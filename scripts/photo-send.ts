import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import mqtt from 'mqtt'
import { MQTT_TOPICS } from '../src/network/mqtt/topics'

// Maps a file extension to the `format` field the photo-send payload expects.
// `jpeg` is the canonical name (the receiver stores photos as `.jpeg`), while
// `png`/`webp`/`gif` keep their own extension.
const FORMAT_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
  '.gif': 'gif'
}

const isUrl = (source: string): boolean => /^https?:\/\//i.test(source)

const readSource = async (source: string): Promise<Buffer> => {
  if (isUrl(source)) {
    const response = await fetch(source)

    if (!response.ok)
      throw new Error(`Failed to fetch ${source}: HTTP ${response.status}`)

    return Buffer.from(await response.arrayBuffer())
  }

  return readFileSync(source)
}

const mqttOptions = (): mqtt.IClientOptions => {
  const {
    MQTT_CLEAN = 'true',
    MQTT_CONNECT_TIMEOUT = '30000',
    MQTT_HOST,
    MQTT_KEEPALIVE = '60',
    MQTT_PASS,
    MQTT_PORT = '1883',
    MQTT_PROTOCOL = 'mqtt',
    MQTT_USER
  } = process.env

  return {
    clean: MQTT_CLEAN !== 'false',
    connectTimeout: Number(MQTT_CONNECT_TIMEOUT),
    host: MQTT_HOST ?? 'localhost',
    keepalive: Number(MQTT_KEEPALIVE),
    password: MQTT_PASS,
    port: Number(MQTT_PORT),
    protocol: MQTT_PROTOCOL === 'mqtts' ? 'mqtts' : 'mqtt',
    reconnectPeriod: 0,
    username: MQTT_USER
  }
}

type SendPhotoOptions = {
  dryRun?: boolean
}

type SendPhotoResult = {
  published: boolean
  topic: string
  payload: { format: string; photo: string }
}

/**
 * Publishes a photo to the `doorcloud/v1/photo/send` MQTT topic
 *
 * Accepts a local path or an http(s) URL. The image is sent as a base64 data
 * URL, the same shape a device publisher would use, so the backend verifies it
 * against the registered reference photos. With `dryRun` the payload is
 * printed without connecting or publishing.
 *
 * @param source - Local image path or http(s) URL
 * @param options - Optional dry-run flag
 * @returns What would be / was published
 */
export const sendPhoto = async (
  source: string,
  options: SendPhotoOptions = {}
): Promise<SendPhotoResult> => {
  const format = FORMAT_BY_EXTENSION[extname(source).toLowerCase()]

  if (!format) {
    throw new Error(
      `Unsupported image source ${source}; expected a .jpg/.jpeg/.png/.webp/.gif file or URL`
    )
  }

  const buffer = await readSource(source)
  const payload = {
    format,
    photo: `data:image/${format};base64,${buffer.toString('base64')}`
  }

  if (options.dryRun)
    return { published: false, topic: MQTT_TOPICS.photo.send, payload }

  await new Promise<void>((resolve, reject) => {
    const client = mqtt.connect(mqttOptions())

    const fail = (error: Error): void => {
      client.end(true)
      reject(error)
    }

    client.on('connect', () => {
      client.publish(
        MQTT_TOPICS.photo.send,
        JSON.stringify(payload),
        { qos: 0 },
        error => {
          if (error) {
            fail(error)

            return
          }

          client.end(false, {}, () => resolve())
        }
      )
    })
    client.on('error', fail)
  })

  return { published: true, topic: MQTT_TOPICS.photo.send, payload }
}
