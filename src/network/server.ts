import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { getEnv } from 'config/env'
import fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod'
import { faceRecognitionService } from 'services/face-recognition'
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
