interface Route {
  sub: (
    client: import('mqtt').MqttClient,
    logger: import('fastify').FastifyBaseLogger
  ) => void
  PUB_TOPIC: string
  SUB_TOPIC: string
}
