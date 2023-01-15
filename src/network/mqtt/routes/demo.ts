import { FastifyBaseLogger } from 'fastify'
import { appendFileSync } from 'fs'
import { MqttClient } from 'mqtt'
import { resolve } from 'path'
import { UserServices } from 'services'
import { diffTimeInSeconds, getTimestamp } from 'utils'

const PUB_TOPIC = 'DoorCloud'
const SUB_TOPIC = `${PUB_TOPIC}/photo/#`

const sub = (client: MqttClient, log: FastifyBaseLogger) => {
  client.subscribe(SUB_TOPIC, error => {
    if (!error) log.info({}, `Subscribed to ${SUB_TOPIC}`)
  })

  client.on('error', error => {
    log.error(error, `Topic: ${SUB_TOPIC} - Error`)
  })

  /**
   * The message received will be a string in the following format:
   * userID--format--base64Photo----timestampSent----whatsapp
   *
   * where whatsapp is an optional string that indicates if the photo will be
   * sent through whatsapp or not.
   */
  client.on('message', async (topic, message) => {
    log.info(topic, message)
    if (topic.includes('photo')) {
      log.info({}, 'Received a photo')

      const [userID, format, base64, timestampSent, whatsapp] = message
        .toString()
        .split('----')
      const [, base64Photo] = base64.split(`data:image/${format};base64,`)
      const us = new UserServices(log)

      try {
        if (whatsapp)
          await us.sendPhotoThroughWhatsapp(
            userID,
            format,
            Buffer.from(base64Photo, 'base64')
          )

        if (topic.includes('metrics')) {
          const timeReceived = getTimestamp()
          const timeSent = parseInt(timestampSent)
          const diffInSeconds = diffTimeInSeconds(timeReceived, timeSent)

          appendFileSync(
            resolve(
              __dirname,
              '..',
              '..',
              '..',
              '..',
              'metrics',
              'receivePhoto.csv'
            ),
            `\n${new Date(timeSent).toISOString()},${new Date(
              timeReceived
            ).toISOString()},${diffInSeconds}`,
            'utf-8'
          )
        }
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
