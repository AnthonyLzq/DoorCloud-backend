import type { FastifyBaseLogger, FastifyReply } from 'fastify'
import mqtt from 'mqtt'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { parseEnv } from '../src/config/env'
import { response } from '../src/network/http/response'
import {
  debugMessage,
  getClient,
  mqttConnection
} from '../src/network/mqtt/mqtt'
import {
  parseLegacyPhotoMetricsPayload,
  parseLegacyPhotoSendPayload,
  parsePhotoMetricsPayload,
  parsePhotoSendPayload
} from '../src/network/mqtt/photoPayloads'
import { applyRoutes } from '../src/network/mqtt/router'
import {
  getPhotoSubscriptionTopics,
  isPhotoMetricsTopic,
  isPhotoSendTopic,
  MQTT_TOPICS
} from '../src/network/mqtt/topics'

type MockFunction = ReturnType<typeof vi.fn>

type MockMqttClient = {
  end: MockFunction
  on: MockFunction
  options?: unknown
  subscribe: MockFunction
}

const mockClient = vi.hoisted(() => {
  const client = {} as MockMqttClient

  client.end = vi.fn(
    (force: boolean, options: unknown, done?: (error?: Error) => void) => {
      done?.(undefined)

      return client
    }
  )
  client.on = vi.fn((event: string, handler: () => void) => {
    if (event === 'connect') handler()

    return client
  })
  client.subscribe = vi.fn()

  return client
})

vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn((options: unknown) => {
      mockClient.options = options

      return mockClient
    })
  }
}))

vi.mock('../src/network/mqtt/router', () => ({
  applyRoutes: vi.fn()
}))

const validEnv = {
  MODELS_CDN_URL: 'https://models.example.com',
  MQTT_HOST: 'mqtt.example.com',
  MQTT_PASS: 'mqtt-password',
  MQTT_PORT: '8883',
  MQTT_PROTOCOL: 'mqtt',
  MQTT_USER: 'mqtt-user',
  SUPABASE_KEY: 'supabase-key',
  SUPABASE_URL: 'https://supabase.example.com',
  TWILIO_ACCOUNT_SID: 'twilio-sid',
  TWILIO_AUTH_TOKEN: 'twilio-token',
  TWILIO_PHONE_NUMBER: '+10000000000'
}

const log = {
  error: vi.fn(),
  info: vi.fn()
} as Pick<FastifyBaseLogger, 'error' | 'info'> as FastifyBaseLogger

describe('DoorCloud backend tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Reflect.deleteProperty(global, '__mqttClient__')
    Reflect.deleteProperty(mockClient, 'options')
    Object.assign(process.env, validEnv)
  })

  describe('environment validation', () => {
    test('parses required environment variables and defaults', () => {
      expect(parseEnv(validEnv)).toMatchObject({
        MODELS_CDN_URL: 'https://models.example.com',
        MQTT_CLEAN: true,
        MQTT_CONNECT_TIMEOUT: 30_000,
        MQTT_HOST: 'mqtt.example.com',
        MQTT_KEEPALIVE: 60,
        MQTT_LEGACY_TOPICS_ENABLED: true,
        MQTT_PORT: 8883,
        MQTT_PROTOCOL: 'mqtt',
        MQTT_QOS: 0,
        MQTT_RECONNECT_PERIOD: 1_000,
        NODE_ENV: 'development',
        PORT: 1996,
        TWILIO_PHONE_NUMBER: '+10000000000'
      })
    })

    test('reports invalid environment variables by name', () => {
      expect(() => parseEnv({ ...validEnv, MQTT_HOST: '' })).toThrow(
        'MQTT_HOST'
      )
    })
  })

  describe('MQTT photo topics and payloads', () => {
    test('builds subscriptions with legacy topics enabled', () => {
      expect(getPhotoSubscriptionTopics(true)).toMatchObject([
        MQTT_TOPICS.photo.send,
        MQTT_TOPICS.photo.metrics,
        MQTT_TOPICS.photo.legacy
      ])
    })

    test('identifies versioned and legacy photo topics', () => {
      expect(isPhotoSendTopic('doorcloud/v1/photo/send', false)).toBe(true)
      expect(isPhotoSendTopic('DoorCloud/photo/send', true)).toBe(true)
      expect(isPhotoSendTopic('DoorCloud/photo/send', false)).toBe(false)
      expect(isPhotoMetricsTopic('doorcloud/v1/photo/metrics', false)).toBe(
        true
      )
      expect(isPhotoMetricsTopic('DoorCloud/photo/metrics', true)).toBe(true)
    })

    test('parses versioned photo send payloads', () => {
      const payload = Buffer.from(
        JSON.stringify({
          userId: '42',
          format: 'jpeg',
          photo: 'data:image/jpeg;base64,aGVsbG8='
        })
      )

      expect(parsePhotoSendPayload(payload)).toMatchObject({
        userID: '42',
        format: 'jpeg',
        base64Photo: 'aGVsbG8='
      })
    })

    test('parses legacy photo send payloads', () => {
      expect(
        parseLegacyPhotoSendPayload(
          Buffer.from('42----png----data:image/png;base64,aGVsbG8=')
        )
      ).toMatchObject({
        userID: '42',
        format: 'png',
        base64Photo: 'aGVsbG8='
      })
    })

    test('parses versioned and legacy metrics payloads', () => {
      expect(
        parsePhotoMetricsPayload(Buffer.from('{"timestampSent":1730000000000}'))
      ).toMatchObject({ timestampSent: 1_730_000_000_000 })
      expect(
        parseLegacyPhotoMetricsPayload(Buffer.from('1730000000000----x'))
      ).toMatchObject({
        timestampSent: 1_730_000_000_000
      })
    })
  })

  describe('MQTT connection', () => {
    test('creates and reuses one MQTT client', () => {
      const firstClient = getClient(log)
      const secondClient = getClient(log)

      expect(mqtt.connect).toHaveBeenCalledTimes(1)
      expect(mqtt.connect).toHaveBeenCalledWith({
        clean: true,
        clientId: `doorcloud-backend-${process.pid}`,
        connectTimeout: 30_000,
        host: 'mqtt.example.com',
        keepalive: 60,
        password: 'mqtt-password',
        port: 8883,
        protocol: 'mqtt',
        reconnectPeriod: 1_000,
        resubscribe: true,
        username: 'mqtt-user'
      })
      expect(firstClient).toBe(mockClient)
      expect(secondClient).toBe(mockClient)
      expect(log.info).toHaveBeenCalledWith(
        {
          clientId: `doorcloud-backend-${process.pid}`,
          host: 'mqtt.example.com',
          port: 8883,
          protocol: 'mqtt'
        },
        debugMessage
      )
    })

    test('applies MQTT routes on start', async () => {
      await mqttConnection(log).start()

      expect(applyRoutes).toHaveBeenCalledTimes(1)
      expect(applyRoutes).toHaveBeenCalledWith(mockClient, log)
    })

    test('does not create an MQTT client on stop', async () => {
      await mqttConnection(log).stop()

      expect(mqtt.connect).toHaveBeenCalledTimes(0)
      expect(mockClient.end).toHaveBeenCalledTimes(0)
    })

    test('ends and clears the MQTT client on stop', async () => {
      await mqttConnection(log).start()
      await mqttConnection(log).stop()

      expect(mockClient.end).toHaveBeenCalledTimes(1)
      expect(global.__mqttClient__).toBe(undefined)
    })
  })

  describe('HTTP response helper', () => {
    test('sends a normalized response envelope', () => {
      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn()
      } as unknown as Pick<FastifyReply, 'code' | 'send'> as FastifyReply

      response({
        error: false,
        message: 'DoorCloud backend!',
        reply,
        status: 200
      })

      expect(reply.code).toHaveBeenCalledWith(200)
      expect(reply.send).toHaveBeenCalledWith({
        error: false,
        message: 'DoorCloud backend!'
      })
    })
  })
})
