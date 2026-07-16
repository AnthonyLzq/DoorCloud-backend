import type { FastifyBaseLogger, FastifyReply } from 'fastify'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import mqtt from 'mqtt'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { parseEnv } from '../src/config/env'
import {
  getOpenWaSetupQr,
  getOpenWaSetupStatus,
  saveOpenWaSetupConfig,
  sendOpenWaSetupTest,
  startOpenWaSetupSession,
  sendWhatsappImage,
  sendWhatsappText
} from '../src/integrations/whatsapp'
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
  connected: boolean
  end: MockFunction
  on: MockFunction
  options?: unknown
  once: MockFunction
  removeListener: MockFunction
  subscribe: MockFunction
}

const mockClient = vi.hoisted(() => {
  const client = {} as MockMqttClient

  client.connected = false
  client.end = vi.fn(
    (force: boolean, options: unknown, done?: (error?: Error) => void) => {
      done?.(undefined)

      return client
    }
  )
  client.on = vi.fn((event: string, handler: () => void) => {
    if (event === 'connect') {
      client.connected = true
      handler()
    }

    return client
  })
  client.once = vi.fn((event: string, handler: () => void) => {
    if (event === 'connect') {
      client.connected = true
      handler()
    }

    return client
  })
  client.removeListener = vi.fn().mockReturnValue(client)
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
  OPENWA_API_KEY: 'openwa-api-key',
  OPENWA_BASE_URL: 'http://localhost:2785',
  OPENWA_CHAT_ID: '51999999999@c.us',
  OPENWA_SESSION_ID: 'main',
  SUPABASE_KEY: 'supabase-key',
  SUPABASE_URL: 'https://supabase.example.com'
}

const log = {
  error: vi.fn(),
  info: vi.fn()
} as Pick<FastifyBaseLogger, 'error' | 'info'> as FastifyBaseLogger

describe('DoorCloud backend tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(process.env, 'SETUP_TOKEN')
    Reflect.deleteProperty(global, '__mqttClient__')
    Reflect.deleteProperty(mockClient, 'options')
    mockClient.connected = false
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
        OPENWA_BASE_URL: 'http://localhost:2785',
        OPENWA_CHAT_ID: '51999999999@c.us',
        OPENWA_SESSION_ID: 'main',
        PORT: 1996
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

  describe('OpenWA WhatsApp provider', () => {
    test('sends text messages to the configured chat id', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'text-1', timestamp: 1 }), {
          status: 201
        })
      )

      vi.stubGlobal('fetch', fetchMock)

      await expect(sendWhatsappText('hello', log)).resolves.toMatchObject({
        messageId: 'text-1'
      })
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:2785/api/sessions/main/messages/send-text',
        expect.objectContaining({
          body: JSON.stringify({
            chatId: '51999999999@c.us',
            text: 'hello'
          }),
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'openwa-api-key'
          },
          method: 'POST'
        })
      )
    })

    test('sends image messages through OpenWA send-image', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'image-1', timestamp: 2 }), {
          status: 201
        })
      )

      vi.stubGlobal('fetch', fetchMock)

      await expect(
        sendWhatsappImage({
          imageUrl: 'https://example.com/photo.jpg',
          caption: 'result',
          log
        })
      ).resolves.toMatchObject({ messageId: 'image-1' })
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:2785/api/sessions/main/messages/send-image',
        expect.objectContaining({
          body: JSON.stringify({
            caption: 'result',
            chatId: '51999999999@c.us',
            url: 'https://example.com/photo.jpg'
          }),
          method: 'POST'
        })
      )
    })

    test('surfaces OpenWA send errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('bad api key', { status: 401 }))
      )

      await expect(sendWhatsappText('hello', log)).rejects.toThrow(
        'OpenWA message request failed with 401'
      )
      expect(log.error).toHaveBeenCalledWith(
        { responseBody: 'bad api key', status: 401 },
        'OpenWA message request failed'
      )
    })

    test('reports missing OpenWA session during setup status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('not found', { status: 404 }))
      )

      await expect(getOpenWaSetupStatus(log)).resolves.toMatchObject({
        configuredChatId: '51999999999@c.us',
        configuredSessionId: 'main',
        session: null
      })
    })

    test('creates and starts an OpenWA session for setup', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('not found', { status: 404 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'main', status: 'created' }), {
            status: 201
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'qr_ready' }), { status: 201 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'main', status: 'qr_ready' }), {
            status: 200
          })
        )

      vi.stubGlobal('fetch', fetchMock)

      await expect(startOpenWaSetupSession(log)).resolves.toMatchObject({
        session: { id: 'main', status: 'qr_ready' }
      })
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost:2785/api/sessions',
        expect.objectContaining({
          body: JSON.stringify({ name: 'main' }),
          method: 'POST'
        })
      )
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'http://localhost:2785/api/sessions/main/start',
        expect.objectContaining({ method: 'POST' })
      )
    })

    test('loads the OpenWA setup QR', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'main', status: 'qr_ready' }), {
            status: 200
          })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              qrCode: 'data:image/png;base64,ZmFrZQ==',
              status: 'qr_ready'
            }),
            { status: 200 }
          )
        )

      vi.stubGlobal('fetch', fetchMock)

      await expect(getOpenWaSetupQr(log)).resolves.toMatchObject({
        qrCode: 'data:image/png;base64,ZmFrZQ==',
        status: 'qr_ready'
      })
    })

    test('sends OpenWA setup test text and image', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ messageId: 'text-1', timestamp: 1 }), {
            status: 201
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ messageId: 'image-1', timestamp: 2 }), {
            status: 201
          })
        )

      vi.stubGlobal('fetch', fetchMock)

      await expect(
        sendOpenWaSetupTest({
          imageUrl: 'https://example.com/test.jpg',
          log,
          text: 'setup test'
        })
      ).resolves.toMatchObject({
        imageMessage: { messageId: 'image-1' },
        textMessage: { messageId: 'text-1' }
      })
    })

    test('saves OpenWA setup config to .env and process env', () => {
      const cwd = process.cwd()
      const dir = mkdtempSync(join(tmpdir(), 'doorcloud-openwa-'))

      try {
        process.chdir(dir)

        expect(
          saveOpenWaSetupConfig({
            OPENWA_API_KEY: 'saved-key',
            OPENWA_BASE_URL: 'http://localhost:2785',
            OPENWA_CHAT_ID: '51999999999@c.us',
            OPENWA_SESSION_ID: 'main'
          })
        ).toMatchObject({
          saved: [
            'OPENWA_API_KEY',
            'OPENWA_BASE_URL',
            'OPENWA_CHAT_ID',
            'OPENWA_SESSION_ID'
          ]
        })
        expect(readFileSync('.env', 'utf8')).toContain(
          'OPENWA_API_KEY=saved-key'
        )
        expect(process.env.OPENWA_API_KEY).toBe('saved-key')
      } finally {
        process.chdir(cwd)
        rmSync(dir, { force: true, recursive: true })
      }
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
