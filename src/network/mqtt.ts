import debug from 'debug'
// import redis from 'redis'
import mqtt from 'mqtt'

debug('DoorCloud:Mqtt')

let client: mqtt.MqttClient
const options: mqtt.IClientOptions = {
  port: process.env.MQTT_PORT ? parseInt(process.env.MQTT_PORT) : 0,
  host: process.env.MQTT_HOST,
  protocol: 'mqtts',
  keepalive: 0,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS
}
const BASE_TOPIC = 'DoorCloud'
const SUB_TOPIC = `${BASE_TOPIC}/#`

const getClient = () => {
  if (!client) client = mqtt.connect(options)

  return client
}

export { getClient, BASE_TOPIC, SUB_TOPIC }
