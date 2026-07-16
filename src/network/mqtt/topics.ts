const PHOTO_TOPIC_PREFIX = 'doorcloud/v1/photo'
/**
 * @deprecated Keep only while legacy publishers still use delimiter payloads.
 * Prefer versioned `doorcloud/v1/photo/*` topics.
 */
const LEGACY_PHOTO_TOPIC_FILTER = 'DoorCloud/photo/#'

const MQTT_TOPICS = {
  photo: {
    send: `${PHOTO_TOPIC_PREFIX}/send`,
    metrics: `${PHOTO_TOPIC_PREFIX}/metrics`,
    result: `${PHOTO_TOPIC_PREFIX}/result/#`,
    legacy: LEGACY_PHOTO_TOPIC_FILTER
  }
} as const

const getPhotoSubscriptionTopics = (legacyTopicsEnabled: boolean): string[] => {
  const topics: string[] = [MQTT_TOPICS.photo.send, MQTT_TOPICS.photo.metrics]

  if (legacyTopicsEnabled) topics.push(MQTT_TOPICS.photo.legacy)

  return topics
}

/**
 * @deprecated Legacy topic detection exists only for transition compatibility.
 * Prefer exact versioned `doorcloud/v1/photo/*` topic checks.
 */
const isLegacyPhotoTopic = (topic: string): boolean =>
  topic.startsWith('DoorCloud/photo/')

const isPhotoSendTopic = (
  topic: string,
  legacyTopicsEnabled: boolean
): boolean =>
  topic === MQTT_TOPICS.photo.send ||
  (legacyTopicsEnabled && isLegacyPhotoTopic(topic) && topic.includes('send'))

const isPhotoMetricsTopic = (
  topic: string,
  legacyTopicsEnabled: boolean
): boolean =>
  topic === MQTT_TOPICS.photo.metrics ||
  (legacyTopicsEnabled &&
    isLegacyPhotoTopic(topic) &&
    topic.includes('metrics'))

export {
  getPhotoSubscriptionTopics,
  isLegacyPhotoTopic,
  isPhotoMetricsTopic,
  isPhotoSendTopic,
  MQTT_TOPICS
}
