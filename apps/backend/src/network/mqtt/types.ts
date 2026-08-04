import type { FastifyBaseLogger } from 'fastify'
import type { MqttClient } from 'mqtt'

type MqttRoute = {
  sub: (client: MqttClient, logger: FastifyBaseLogger) => Promise<void> | void
  PUB_TOPIC: string
  SUB_TOPIC: string
}

export type { MqttRoute }
