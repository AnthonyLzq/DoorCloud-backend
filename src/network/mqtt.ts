import mqtt from 'mqtt'

let client: mqtt.MqttClient
const options: mqtt.IClientOptions = {
  port: process.env.MQTT_PORT ? parseInt(process.env.MQTT_PORT) : 0,
  host: process.env.MQTT_HOST,
  protocol: 'mqtts',
  keepalive: 0,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS
}

const getClient = () => {
  if (!client) client = mqtt.connect(options)

  return client
}

const start = async () => {
  const { applyRoutes } = await import('./router')

  applyRoutes(getClient())
}

export { start, getClient }
