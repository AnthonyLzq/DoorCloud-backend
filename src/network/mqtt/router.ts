import { MqttClient } from 'mqtt'
import { FastifyBaseLogger } from 'fastify'

import * as Routes from './routes'

const applyRoutes = (client: MqttClient, logger: FastifyBaseLogger) => {
  ;(Object.keys(Routes) as (keyof typeof Routes)[]).forEach(route => {
    Routes[route].sub(client, logger)
  })
}

export { applyRoutes }
