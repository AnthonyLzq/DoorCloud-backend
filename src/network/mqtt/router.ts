import { MqttClient } from 'mqtt'
import { FastifyBaseLogger } from 'fastify'

import * as Routes from './routes'

const routedClients = new WeakSet<MqttClient>()

const applyRoutes = (client: MqttClient, logger: FastifyBaseLogger) => {
  if (routedClients.has(client)) {
    logger.info({}, 'MQTT routes already registered')

    return
  }

  ;(Object.keys(Routes) as (keyof typeof Routes)[]).forEach(route => {
    Routes[route].sub(client, logger)
  })
  routedClients.add(client)
}

export { applyRoutes }
