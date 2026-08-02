import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
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
    const { CORS_ORIGINS, PHOTOS_DIR, PHOTOS_BASE_URL, PHOTOS_URL_SECRET } =
      getEnv()

    const photoStorage = new DiskPhotoStorage({
      photosDir: PHOTOS_DIR,
      baseUrl: PHOTOS_BASE_URL,
      urlSecret: PHOTOS_URL_SECRET
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

      if (
        path.startsWith('/') ||
        path.includes('..') ||
        !Number.isFinite(expiresAtNumber)
      )
        return reply.code(400).send({ error: 'Invalid path' })

      if (!photoStorage.isUrlValid(path, signature, expiresAtNumber))
        return reply.code(404).send({ error: 'Not found' })

      return reply.send(createReadStream(resolve(PHOTOS_DIR, path)))
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
    const { PORT } = getEnv()

    try {
      // Fail fast: if face recognition cannot start, do not open ports or MQTT
      await this.#faceRecognitionService.init({ mode: 'onnx' })
      this.#startMqtt()
      await this.#mqqtConnection?.start()
      await this.#app.listen({
        port: PORT
      })
    } catch (error) {
      this.#app.log.error({ error }, 'Fatal error during server startup')
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
