import fastify, { FastifyInstance } from 'fastify'

import { supabaseConnection } from 'database'
import { userSchemas } from 'schemas'

import { applyRoutes, validatorCompiler } from './http'
import { mqttConnection } from './mqtt'
import { init } from 'lib'
import { twilioConnection } from 'integrations'
import { getEnv } from 'config/env'

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
    this.#app.register(require('@fastify/cors'), {})
    this.#app.register(require('@fastify/multipart'), {
      limits: {
        fields: 3,
        files: 3
      }
    })

    for (const schema of userSchemas) this.#app.addSchema(schema)

    this.#app.addHook('preHandler', (req, reply, done) => {
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE')
      reply.header('Access-Control-Allow-Origin', '*')
      reply.header(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type'
      )
      reply.header('x-powered-by', 'Simba.js')
      done()
    })
    this.#app.setValidatorCompiler(validatorCompiler)
    applyRoutes(this.#app)
  }

  #startMqtt() {
    this.#mqqtConnection = mqttConnection(this.#app.log)
  }

  public async start(): Promise<void> {
    try {
      const { PORT } = getEnv()

      supabaseConnection(this.#app.log)
      twilioConnection(this.#app.log)
      this.#startMqtt()
      await this.#mqqtConnection?.start()
      await this.#app.listen({
        port: PORT
      })
      await init(this.#app.log)
    } catch (e) {
      console.error(e)
    }
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
