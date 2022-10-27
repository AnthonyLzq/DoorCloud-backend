import debug from 'debug'

import { getClient, SUB_TOPIC } from './network'

debug('DoorCloud:Mqtt:sub')

const client = getClient()

client.on('connect', () => {
  debug.log('Connected to mqtt server')
})

client.on('error', error => {
  console.log(error)
})

client.on('message', (topic, message) => {
  debug.log(`${topic} - ${message.toString()}`)
})

client.subscribe(SUB_TOPIC, err => {
  if (!err) debug.log(`Suscribed to ${SUB_TOPIC}`)
})
