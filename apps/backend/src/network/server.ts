import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
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
import { mqttConnection } from './mqtt'

const ENVIRONMENTS_WITHOUT_PRETTY_PRINT = ['production', 'ci']

const PHOTO_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

const contentTypeFor = (path: string): string =>
  PHOTO_CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'

class Server {
  #app: FastifyInstance
  #mqqtConnection: Awaited<ReturnType<typeof mqttConnection>> | undefined
  #faceRecognitionService: typeof faceRecognitionService
  #photoStorage!: DiskPhotoStorage
  #stopping = false

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
    this.#config()
  }

  #config() {
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

    this.#app.register(cors, {
      origin: CORS_ORIGINS ?? true
    })
    this.#app.register(multipart, {
      limits: {
        fields: 3,
        files: 3
      }
    })

    this.#app.get<{
      Params: { signature: string; expiresAt: string; '*': string }
    }>('/photos/:signature/:expiresAt/*', async (request, reply) => {
      const { signature, expiresAt } = request.params
      const path = request.params['*']
      const expiresAtNumber = Number(expiresAt)

      if (!Number.isFinite(expiresAtNumber))
        return reply.code(400).send({ error: 'Invalid path' })

      if (!photoStorage.isUrlValid(path, signature, expiresAtNumber))
        return reply.code(404).send({ error: 'Not found' })

      let fullPath: string
      try {
        // Centralized containment check (rejects traversal and absolute paths)
        fullPath = photoStorage.resolvePath(path)
      } catch {
        return reply.code(400).send({ error: 'Invalid path' })
      }

      try {
        // Map missing files and directories to 404 instead of a stream 500
        const file = await stat(fullPath)
        if (!file.isFile()) return reply.code(404).send({ error: 'Not found' })
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error as { code?: unknown }).code === 'ENOENT'
        )
          return reply.code(404).send({ error: 'Not found' })

        throw error
      }

      return reply
        .type(contentTypeFor(fullPath))
        .send(createReadStream(fullPath))
    })

    this.#app.setValidatorCompiler(validatorCompiler)
    this.#app.setSerializerCompiler(serializerCompiler)
    applyRoutes(this.#app.withTypeProvider<ZodTypeProvider>())

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

    this.#app.register(fastifyStatic, {
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
