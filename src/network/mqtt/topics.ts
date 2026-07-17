const PHOTO_TOPIC_PREFIX = 'doorcloud/v1/photo'

const MQTT_TOPICS = {
  photo: {
    send: `${PHOTO_TOPIC_PREFIX}/send`,
    metrics: `${PHOTO_TOPIC_PREFIX}/metrics`,
    result: `${PHOTO_TOPIC_PREFIX}/result/#`
  }
} as const

const getPhotoSubscriptionTopics = (): string[] => [
  MQTT_TOPICS.photo.send,
  MQTT_TOPICS.photo.metrics
]

const isPhotoSendTopic = (topic: string): boolean =>
  topic === MQTT_TOPICS.photo.send

const isPhotoMetricsTopic = (topic: string): boolean =>
  topic === MQTT_TOPICS.photo.metrics

export {
  getPhotoSubscriptionTopics,
  isPhotoMetricsTopic,
  isPhotoSendTopic,
  MQTT_TOPICS
}
