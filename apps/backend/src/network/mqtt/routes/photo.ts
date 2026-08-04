import { appendFileSync } from 'node:fs'
import { getEnv } from 'config/env'
import { resolveMetricsPath } from 'config/paths'
import type { FastifyBaseLogger } from 'fastify'
import type { MqttClient } from 'mqtt'
import { UserServices } from 'services'
import { diffTimeInSeconds, getTimestamp } from 'utils'
import {
  type PhotoMetricsPayload,
  parsePhotoMetricsPayload,
  parsePhotoSendPayload
} from '../photoPayloads'
import {
  getPhotoSubscriptionTopics,
  isPhotoMetricsTopic,
  isPhotoSendTopic,
  MQTT_TOPICS
} from '../topics'
import type { MqttRoute } from '../types'

const PUB_TOPIC = 'doorcloud/v1/photo'
const SUB_TOPIC = MQTT_TOPICS.photo.send

const handlePhotoSend = async (
  topic: string,
  message: Buffer,
  log: FastifyBaseLogger
) => {
  log.info({ topic }, 'Received a photo')

  const { base64Photo, format } = parsePhotoSendPayload(message)
  const us = new UserServices(log)

  await us.sendPhotoThroughWhatsapp(format, Buffer.from(base64Photo, 'base64'))

  log.info({ topic }, 'Photo sent.')
}

const recordMetrics = (
  { timestampSent }: PhotoMetricsPayload,
  log: FastifyBaseLogger,
  topic: string
) => {
  log.info({ topic }, 'Received photo metrics')

  const timeReceived = getTimestamp()
  const diffInSeconds = diffTimeInSeconds(timeReceived, timestampSent)

  appendFileSync(
    resolveMetricsPath('receivePhoto.csv'),
    `\n${new Date(timestampSent).toISOString()},${new Date(
      timeReceived
    ).toISOString()},${diffInSeconds}`,
    'utf-8'
  )
  log.info({ topic }, 'Photo received and measured.')
}

const sub = async (
  client: MqttClient,
  log: FastifyBaseLogger
): Promise<void> => {
  const { MQTT_QOS } = getEnv()
  const topics = getPhotoSubscriptionTopics()

  await new Promise<void>((resolve, reject) => {
    client.subscribe(topics, { qos: MQTT_QOS }, error => {
      if (error) {
        log.error(
          { err: error, topics },
          'Error subscribing to MQTT photo topics'
        )
        reject(error)

        return
      }

      log.info({ topics }, 'Subscribed to MQTT photo topics')
      resolve()
    })
  })

  client.on('error', error => {
    log.error({ err: error, topics }, 'MQTT photo route error')
  })

  client.on('message', async (topic, message) => {
    try {
      if (isPhotoSendTopic(topic)) {
        await handlePhotoSend(topic, message, log)

        return
      }

      if (isPhotoMetricsTopic(topic))
        recordMetrics(parsePhotoMetricsPayload(message), log, topic)
    } catch (error) {
      log.error({ err: error, topic }, 'Error processing MQTT photo message')
    }
  })
}

const demo: MqttRoute = {
  sub,
  PUB_TOPIC,
  SUB_TOPIC
}

export { demo }
