interface Route {
  sub: (client: import('mqtt').MqttClient) => void
  PUB_TOPIC: string
  SUB_TOPIC: string
}
