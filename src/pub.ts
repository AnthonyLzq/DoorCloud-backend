import debug from 'debug'

import { getClient, BASE_TOPIC } from './network'

debug('DoorCloud:Mqtt:pub')

const client = getClient()

client.on('connect', () => {
  debug.log('Connected to mqtt server')
})

client.on('error', error => {
  console.log(error)
})

const test = {
  foo: 'bar'
}

client.publish(`${BASE_TOPIC}/test`, Buffer.from(JSON.stringify(test)), () => {
  debug.log('Message send')
})
