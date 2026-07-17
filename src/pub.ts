import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import debug from 'debug'

import { getClient } from './network/mqtt'
import { MQTT_TOPICS } from './network/mqtt/topics'

const pubDebug = debug('DoorCloud:Mqtt:demo:pub')
const client = getClient()

client.on('error', error => {
  pubDebug('Error: ', error)
})

const filePath = join(__dirname, '../basic_pub_sub_test.png')
const file = readFileSync(filePath)

// Convert image to base64 data URL
const base64Photo = file.toString('base64')
const dataUrl = `data:image/png;base64,${base64Photo}`

// Create JSON payload with versioned topic format
const payload = JSON.stringify({
  userId: '1',
  format: 'png',
  photo: dataUrl
})

client.publish(MQTT_TOPICS.photo.send, payload, () => {
  pubDebug('Message sent to', MQTT_TOPICS.photo.send)
})
