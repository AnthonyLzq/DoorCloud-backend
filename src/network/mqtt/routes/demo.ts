import { FastifyBaseLogger } from 'fastify'
import { writeFile } from 'fs'
import { MqttClient } from 'mqtt'
import { join } from 'path'

const PUB_TOPIC = 'DoorCloud'
const SUB_TOPIC = `${PUB_TOPIC}/#`

const sub = (client: MqttClient, logger: FastifyBaseLogger) => {
  const subDebugger = 'DoorCloud:Mqtt:demo:sub'

  client.subscribe(SUB_TOPIC, error => {
    if (!error) logger.info({}, subDebugger)
  })

  client.on('error', error => {
    logger.error(error, `Topic: ${SUB_TOPIC} - Error`)
  })

  client.on('message', async (topic, message) => {
    if (topic.includes('photo')) {
      logger.info({}, 'Received an photo')

      const path = join(__dirname, 'test.png')

      await new Promise<void>((resolve, reject) => {
        writeFile(path, message, error => {
          if (error) {
            logger.error(
              error,
              `Topic: ${SUB_TOPIC} - Error while creating the image`
            )

            return reject(new Error('Error while creating the image'))
          }

          logger.info({}, `Topic: ${SUB_TOPIC} - Image: ${path} created.`)
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
