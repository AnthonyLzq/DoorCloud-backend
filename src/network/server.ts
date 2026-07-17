import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { getEnv } from 'config/env'
import { supabaseConnection } from 'database'
import fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod'
import { init } from 'lib'
import { applyRoutes } from './http'
import { mqttConnection } from './mqtt'

const ENVIRONMENTS_WITHOUT_PRETTY_PRINT = ['production', 'ci']

class Server {
  #app: FastifyInstance
  #mqqtConnection: Awaited<ReturnType<typeof mqttConnection>> | undefined

  constructor() {
    const { NODE_ENV } = getEnv()

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
    const { CORS_ORIGINS } = getEnv()

    this.#app.register(cors, {
      origin: CORS_ORIGINS ?? true
    })
    this.#app.register(multipart, {
      limits: {
        fields: 3,
        files: 3
      }
    })

    this.#app.setValidatorCompiler(validatorCompiler)
    this.#app.setSerializerCompiler(serializerCompiler)
    applyRoutes(this.#app.withTypeProvider<ZodTypeProvider>())
  }

  #startMqtt() {
    this.#mqqtConnection = mqttConnection(this.#app.log)
  }

  public async start(): Promise<void> {
    const { PORT } = getEnv()

    supabaseConnection(this.#app.log)
    this.#startMqtt()
    await this.#mqqtConnection?.start()
    await this.#app.listen({
      port: PORT
    })
    await init(this.#app.log)
  }

  public async stop(): Promise<void> {
    try {
      await this.#mqqtConnection?.stop()
      await this.#app.close()
    } catch (e) {
      console.error(e)
    }
  }
}

const server = new Server()

export { server as Server }
