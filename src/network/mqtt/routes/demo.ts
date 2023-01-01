import { FastifyBaseLogger } from 'fastify'
import { MqttClient } from 'mqtt'
import { UserServices } from 'services'

const PUB_TOPIC = 'DoorCloud'
const SUB_TOPIC = `${PUB_TOPIC}/photo`

const sub = (client: MqttClient, log: FastifyBaseLogger) => {
  const subDebugger = 'DoorCloud:Mqtt:demo:sub'

  client.subscribe(SUB_TOPIC, error => {
    if (!error) log.info({}, `Subscribed to ${subDebugger}`)
  })

  client.on('error', error => {
    log.error(error, `Topic: ${SUB_TOPIC} - Error`)
  })

  /**
   * The message received will be a string in the following format:
   * userID--format--base64Photo
   */
  client.on('message', async (topic, message) => {
    if (topic.includes('photo')) {
      log.info({}, 'Received a photo')

      const [userID, format, base64] = message.toString().split('----')
      const [, base64Photo] = base64.split(`data:image/${format};base64,`)
      const us = new UserServices(log)

      try {
        await us.sendPhotoThroughWhatsapp(
          userID,
          format,
          Buffer.from(base64Photo, 'base64')
        )
        log.info({}, `Topic: ${SUB_TOPIC} - Photo send.`)
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
