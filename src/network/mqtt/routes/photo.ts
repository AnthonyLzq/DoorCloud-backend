import { FastifyBaseLogger } from 'fastify'
import { appendFileSync } from 'fs'
import { MqttClient } from 'mqtt'
import { resolve } from 'path'
import { UserServices } from 'services'
import { diffTimeInSeconds, getTimestamp } from 'utils'
import { getEnv } from 'config/env'
import {
  parseLegacyPhotoMetricsPayload,
  parseLegacyPhotoSendPayload,
  parsePhotoMetricsPayload,
  parsePhotoSendPayload,
  PhotoMetricsPayload,
  PhotoSendPayload
} from '../photoPayloads'
import {
  getPhotoSubscriptionTopics,
  isLegacyPhotoTopic,
  isPhotoMetricsTopic,
  isPhotoSendTopic,
  MQTT_TOPICS
} from '../topics'
import type { MqttRoute } from '../types'

const PUB_TOPIC = 'doorcloud/v1/photo'
const SUB_TOPIC = MQTT_TOPICS.photo.send

const getPhotoSendPayload = (
  topic: string,
  message: Buffer
): PhotoSendPayload =>
  isLegacyPhotoTopic(topic)
    ? parseLegacyPhotoSendPayload(message)
    : parsePhotoSendPayload(message)

const getPhotoMetricsPayload = (
  topic: string,
  message: Buffer
): PhotoMetricsPayload =>
  isLegacyPhotoTopic(topic)
    ? parseLegacyPhotoMetricsPayload(message)
    : parsePhotoMetricsPayload(message)

const handlePhotoSend = async (
  topic: string,
  message: Buffer,
  log: FastifyBaseLogger
) => {
  log.info({ topic }, 'Received a photo')

  const { base64Photo, format, userID } = getPhotoSendPayload(topic, message)
  const us = new UserServices(log)

  await us.sendPhotoThroughWhatsapp(
    userID,
    format,
    Buffer.from(base64Photo, 'base64')
  )

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
    resolve(__dirname, '..', '..', '..', '..', 'metrics', 'receivePhoto.csv'),
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
  const { MQTT_LEGACY_TOPICS_ENABLED, MQTT_QOS } = getEnv()
  const topics = getPhotoSubscriptionTopics(MQTT_LEGACY_TOPICS_ENABLED)

  await new Promise<void>((resolve, reject) => {
    client.subscribe(topics, { qos: MQTT_QOS }, error => {
      if (error) {
        log.error({ error, topics }, 'Error subscribing to MQTT photo topics')
        reject(error)

        return
      }

      log.info({ topics }, 'Subscribed to MQTT photo topics')
      resolve()
    })
  })

  client.on('error', error => {
    log.error({ error, topics }, 'MQTT photo route error')
  })

  client.on('message', async (topic, message) => {
    try {
      if (isPhotoSendTopic(topic, MQTT_LEGACY_TOPICS_ENABLED)) {
        await handlePhotoSend(topic, message, log)

        return
      }

      if (isPhotoMetricsTopic(topic, MQTT_LEGACY_TOPICS_ENABLED))
        recordMetrics(getPhotoMetricsPayload(topic, message), log, topic)
    } catch (error) {
      log.error({ error, topic }, 'Error processing MQTT photo message')
    }
  })
}

const demo: MqttRoute = {
  sub,
  PUB_TOPIC,
  SUB_TOPIC
}

export { demo }
