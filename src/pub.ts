import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import debug from 'debug'

import { getClient } from './network/mqtt'

const pubDebug = debug('DoorCloud:Mqtt:demo:pub')
const client = getClient()

client.on('error', error => {
  pubDebug('Error: ', error)
})

const filePath = join(__dirname, '../basic_pub_sub_test.png')
const file = readFileSync(filePath)

client.publish('DoorCloud/image', file, () => {
  pubDebug('Message send')
})
