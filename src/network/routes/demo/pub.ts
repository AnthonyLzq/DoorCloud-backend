import debug from 'debug'
import { MqttClient } from 'mqtt'

import { PUB_TOPIC } from './topic'

const pub = (client: MqttClient) => {
  const subDebug = debug('DoorCloud:Mqtt:pub')

  client.on('connect', () => {
    subDebug(`Connected to mqtt server - Topic: ${PUB_TOPIC}`)
  })

  client.on('error', error => {
    subDebug(`Topic: ${PUB_TOPIC} - Error:`, error)
  })
}

export { pub }
