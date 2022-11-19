import debug from 'debug'
import { MqttClient } from 'mqtt'

const PUB_TOPIC = 'DoorCloud'
const SUB_TOPIC = `${PUB_TOPIC}/#`

const sub = (client: MqttClient) => {
  const subDebug = debug('DoorCloud:Mqtt:sub')

  client.on('connect', () => {
    subDebug(`Connected to mqtt server - Topic: ${SUB_TOPIC}`)
  })

  client.on('error', error => {
    subDebug(`Topic: ${SUB_TOPIC} - Error:`, error)
  })

  client.on('message', (t, message) => {
    subDebug(`Topic: ${t} - Message: ${message.toString()}`)
  })

  client.subscribe(SUB_TOPIC, error => {
    if (!error) subDebug(`Subscribed to Topic: ${SUB_TOPIC}`)
  })
}

const demo: Route = {
  sub,
  PUB_TOPIC,
  SUB_TOPIC
}

export { demo }
