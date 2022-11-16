import debug from 'debug'

import { getClient } from './network'

const pubDebug = debug('DoorCloud:Mqtt:pub')

const client = getClient()

client.on('connect', () => {
  pubDebug('Connected to mqtt server')
})

client.on('error', error => {
  pubDebug('Error: ', error)
})

const test = {
  foo: 'bar'
}

client.publish('DoorCloud/test', Buffer.from(JSON.stringify(test)), () => {
  pubDebug('Message send')
})
