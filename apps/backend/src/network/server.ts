import { resolve } from 'node:path'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { getEnv } from 'config/env'
import { repoRoot } from 'config/paths'
import fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod'
import { faceRecognitionService } from 'services/face-recognition'
import { migrateLegacyUnidentified } from 'storage/migrations'
import { DiskPhotoStorage } from 'storage/photos'
import { applyRoutes } from './http'
import { webAuthMiddleware } from './http/middleware/web-auth'
import { mqttConnection } from './mqtt'

const ENVIRONMENTS_WITHOUT_PRETTY_PRINT = ['production', 'ci']

class Server {
  #app: FastifyInstance
  #mqqtConnection: Awaited<ReturnType<typeof mqttConnection>> | undefined
  #faceRecognitionService: typeof faceRecognitionService
  #photoStorage!: DiskPhotoStorage
  #stopping = false
  #configPromise: Promise<void>

  constructor() {
    const { NODE_ENV } = getEnv()

    this.#faceRecognitionService = faceRecognitionService
    this.#app = fastify({
      logger: ENVIRONMENTS_WITHOUT_PRETTY_PRINT.includes(NODE_ENV)
        ? true
        : {
            transport: {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname'
              }
            }
          }
    })
    // Plugin registers must be awaited before routes are mounted:
    // @fastify/rate-limit installs an onRoute hook, so a fire-and-forget
    // register would leave the global limiter detached from the routes.
    this.#configPromise = this.#config()
  }

  async #config(): Promise<void> {
    const {
      CORS_ORIGINS,
      PHOTOS_DIR,
      PHOTOS_BASE_URL,
      PHOTOS_URL_SECRET,
      PHOTO_URL_TTL_MS
    } = getEnv()

    const photoStorage = new DiskPhotoStorage({
      photosDir: PHOTOS_DIR,
      baseUrl: PHOTOS_BASE_URL,
      urlSecret: PHOTOS_URL_SECRET,
      urlTtlMs: PHOTO_URL_TTL_MS
    })
    this.#photoStorage = photoStorage

    await this.#app.register(cors, {
      origin: CORS_ORIGINS ?? true
    })
    await this.#app.register(multipart, {
      limits: {
        fields: 3,
        files: 3
      }
    })

    // SEC-05: global rate limiting. /healthz (liveness) and /photos/*
    // (signed URLs fetched by OpenWA/WhatsApp) are exempt; everything else
    // is limited per IP to bound brute-force and abuse.
    await this.#app.register(rateLimit, {
      global: true,
      max: 100,
      timeWindow: 60_000,
      allowList: (request, _key) => {
        const { url } = request

        return url === '/healthz' || url.startsWith('/photos')
      },
      enableDraftSpec: false
    })

    // SEC-09: defense-in-depth response headers. CSP img-src carries the
    // PHOTOS_BASE_URL origin because signed photo URLs may be cross-origin.
    this.#app.addHook('onSend', (_request, reply, _payload, done) => {
      const photosOrigin = new URL(getEnv().PHOTOS_BASE_URL).origin

      reply.header(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self'; img-src 'self' ${photosOrigin}; ` +
          "style-src 'self'; object-src 'none'; base-uri 'self'; " +
          "frame-ancestors 'none'; form-action 'self'"
      )
      reply.header('X-Content-Type-Options', 'nosniff')
      reply.header('X-Frame-Options', 'DENY')

      done()
    })

    this.#app.setValidatorCompiler(validatorCompiler)
    this.#app.setSerializerCompiler(serializerCompiler)
    applyRoutes(this.#app.withTypeProvider<ZodTypeProvider>())

    // Global Basic Auth for the web surfaces (SPA, /setup, /assets).
    // Registered before the static routes so GET / and GET /setup are
    // covered; /healthz and /photos/* are exempted inside the middleware.
    this.#app.addHook('preHandler', webAuthMiddleware)

    // CD-1: liveness probe for container healthchecks. Registered before the
    // static/SPA routes so it is never shadowed, requires no auth, and leaks
    // no environment, model, photo, or user data.
    this.#app.get('/healthz', (_request, reply) => {
      reply.code(200).send({ status: 'ok' })
    })

    // D7: the Preact SPA owns the root pages. Registered AFTER the API
    // routes so /api/*, /setup/* and /photos/* are never shadowed. The
    // static root points at the dist/assets folder because @fastify/static
    // strips the prefix before resolving the file: /assets/foo.js -> root/foo.js.
    const webDist = getEnv().WEB_DIST ?? resolve(repoRoot, 'apps/web/dist')

    await this.#app.register(fastifyStatic, {
      root: resolve(webDist, 'assets'),
      prefix: '/assets/',
      wildcard: true
    })
    this.#app.get('/', (_request, reply) =>
      reply.sendFile('index.html', webDist)
    )
    this.#app.get('/setup', (_request, reply) =>
      reply.sendFile('index.html', webDist)
    )
  }

  public get app(): FastifyInstance {
    return this.#app
  }

  #startMqtt() {
    this.#mqqtConnection = mqttConnection(this.#app.log)
  }

  public async start(): Promise<void> {
    const { HOST, PORT } = getEnv()

    try {
      // Wait for plugin registration (route hooks need the awaits done).
      await this.#configPromise

      // Fail fast: if face recognition cannot start, do not open ports or MQTT
      await this.#faceRecognitionService.init({ mode: 'onnx' })
      this.#startMqtt()
      await this.#mqqtConnection?.start()

      // RF-1 migration: relocate legacy timestamp-prefixed no-match photos
      // to the unidentified tray. Warn-only — a broken migration must never
      // take down the door.
      try {
        const moved = await migrateLegacyUnidentified(this.#photoStorage)

        if (moved > 0)
          this.#app.log.info({ moved }, 'Legacy unidentified photos migrated')
      } catch (error) {
        this.#app.log.warn({ err: error }, 'Legacy migration skipped')
      }

      await this.#app.listen({
        host: HOST,
        port: PORT
      })
    } catch (error) {
      this.#app.log.error({ err: error }, 'Fatal error during server startup')
      await this.#stopInternal()
      throw error
    }
  }

  public async stop(): Promise<void> {
    // CD-2: idempotent stop — a second SIGTERM (or a stop during an in-flight
    // shutdown) must never double-close MQTT, the face-recognition service, or
    // the HTTP server. The flag stays set: this server is single-lifecycle.
    if (this.#stopping) return

    this.#stopping = true
    await this.#stopInternal()
  }

  async #stopInternal(): Promise<void> {
    try {
      await this.#mqqtConnection?.stop()
      await this.#faceRecognitionService.shutdown()
      await this.#app.close()
    } catch (error) {
      console.error(error)
    }
  }
}

const server = new Server()

export { server as Server }
