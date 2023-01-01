import { FastifyBaseLogger } from 'fastify'
import { MqttClient } from 'mqtt'
import { join } from 'path'
import { UserServices } from 'services'

const PUB_TOPIC = 'DoorCloud'
const SUB_TOPIC = `${PUB_TOPIC}/#`

const sub = (client: MqttClient, log: FastifyBaseLogger) => {
  const subDebugger = 'DoorCloud:Mqtt:demo:sub'

  client.subscribe(SUB_TOPIC, error => {
    if (!error) log.info({}, `Subscribed to ${subDebugger}`)
  })

  client.on('error', error => {
    log.error(error, `Topic: ${SUB_TOPIC} - Error`)
  })

  /**
   * TODO: change the way the image is received, from buffer to string in the
   * following format:
   * userID--format--base64Photo
   */
  client.on('message', async (topic, message) => {
    if (topic.includes('photo')) {
      log.info({}, 'Received an photo')

      const [userID, format, base64Photo] = message.toString().split('--')
      const path = join(__dirname, 'test.png')
      const us = new UserServices(log)

      try {
        await us.sendPhotoThroughWhatsapp(
          userID,
          format,
          Buffer.from(base64Photo, 'base64')
        )
        log.info({}, `\tTopic: ${SUB_TOPIC} - Image: ${path} created.`)
      } catch (error) {
        const errorMessage = 'Error while sending the image to the user'

        log.error(error, `${errorMessage}`)

        throw new Error(errorMessage)
      }
    }
  })
}

const demo: Route = {
  sub,
  PUB_TOPIC,
  SUB_TOPIC
}

export { demo }
