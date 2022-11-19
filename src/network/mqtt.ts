import mqtt from 'mqtt'
import debug from 'debug'

let client: mqtt.MqttClient
const options: mqtt.IClientOptions = {
  port: process.env.MQTT_PORT ? parseInt(process.env.MQTT_PORT) : 0,
  host: process.env.MQTT_HOST,
  protocol: 'mqtts',
  keepalive: 0,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS
}
const namespace = 'DoorCloud:Mqtt:Server'
const debugMessage = 'Connected to mqtt server'
const serverDebug = debug(namespace)

const getClient = () => {
  if (!client) {
    client = mqtt.connect(options)
    client.on('connect', () => {
      serverDebug(debugMessage)
    })
  }

  return client
}

const start = async () => {
  const { applyRoutes } = await import('./router')

  applyRoutes(getClient())
}

const stop = async () => {
  getClient().end()
}

export { start, getClient, stop, namespace, debugMessage }
