import debug from 'debug'
import { writeFile } from 'fs'
import { MqttClient } from 'mqtt'
import { join } from 'path'

const PUB_TOPIC = 'DoorCloud'
const SUB_TOPIC = `${PUB_TOPIC}/#`

const sub = (client: MqttClient) => {
  const subDebug = debug('DoorCloud:Mqtt:demo:sub')

  client.subscribe(SUB_TOPIC, error => {
    if (!error) subDebug(`Subscribed to Topic: ${SUB_TOPIC}`)
  })

  client.on('error', error => {
    subDebug(`Topic: ${SUB_TOPIC} - Error:`, error)
  })

  client.on('message', async (topic, message) => {
    subDebug(`Topic: ${topic} - Message received`)

    if (topic.includes('image')) {
      subDebug('Received an image')

      const path = join(__dirname, 'test.png')

      await new Promise<void>((resolve, reject) => {
        writeFile(path, message, error => {
          if (error) {
            subDebug(
              `Topic: ${SUB_TOPIC} - Error while creating the image:`,
              error
            )

            return reject(new Error('Error while creating the image'))
          }

          subDebug(`Topic: ${SUB_TOPIC} - Image: ${path} created.`)
          resolve()
        })
      })
    }
  })
}

const demo: Route = {
  sub,
  PUB_TOPIC,
  SUB_TOPIC
}

export { demo }
