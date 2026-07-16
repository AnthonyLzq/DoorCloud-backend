import { MqttClient } from 'mqtt'
import { FastifyBaseLogger } from 'fastify'

import * as Routes from './routes'

const routedClients = new WeakSet<MqttClient>()

const applyRoutes = async (
  client: MqttClient,
  logger: FastifyBaseLogger
): Promise<void> => {
  if (routedClients.has(client)) {
    logger.info({}, 'MQTT routes already registered')

    return
  }

  for (const route of Object.keys(Routes) as (keyof typeof Routes)[])
    await Routes[route].sub(client, logger)

  routedClients.add(client)
}

export { applyRoutes }
