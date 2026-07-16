import type { FastifyBaseLogger, FastifyReply } from 'fastify'

type MockFunction = {
  (...args: unknown[]): unknown
  mockImplementation: <Args extends unknown[], Result>(
    implementation: (...args: Args) => Result
  ) => MockFunction
  mockReturnThis: () => MockFunction
}

type Expectation = {
  toBe: (expected: unknown) => void
  toHaveBeenCalledTimes: (times: number) => void
  toHaveBeenCalledWith: (...expected: unknown[]) => void
  toMatchObject: (expected: unknown) => void
  toThrow: (expected?: string | RegExp) => void
}

type TestGlobals = {
  beforeEach: (fn: () => void) => void
  describe: (name: string, fn: () => void) => void
  expect: (actual: unknown) => Expectation
  jest: {
    clearAllMocks: () => void
    fn: <Args extends unknown[] = unknown[], Result = unknown>(
      implementation?: (...args: Args) => Result
    ) => MockFunction
    mock: (moduleName: string, factory: () => unknown) => void
  }
  test: (name: string, fn: () => unknown | Promise<unknown>) => void
}

declare const require: <T>(moduleName: string) => T
declare const beforeEach: TestGlobals['beforeEach']
declare const describe: TestGlobals['describe']
declare const expect: TestGlobals['expect']
declare const jest: TestGlobals['jest']
declare const test: TestGlobals['test']

type MockMqttClient = {
  end: MockFunction
  on: MockFunction
  subscribe: MockFunction
}

const validEnv = {
  MODELS_CDN_URL: 'https://models.example.com',
  MQTT_HOST: 'mqtt.example.com',
  MQTT_PASS: 'mqtt-password',
  MQTT_PORT: '8883',
  MQTT_USER: 'mqtt-user',
  SUPABASE_KEY: 'supabase-key',
  SUPABASE_URL: 'https://supabase.example.com',
  TWILIO_ACCOUNT_SID: 'twilio-sid',
  TWILIO_AUTH_TOKEN: 'twilio-token',
  TWILIO_PHONE_NUMBER: '+10000000000'
}

const mockClient: MockMqttClient = {
  end: jest.fn(),
  on: jest.fn(),
  subscribe: jest.fn()
}

mockClient.on.mockImplementation((event: string, handler: () => void) => {
  if (event === 'connect') handler()

  return mockClient
})

jest.mock('mqtt', () => ({
  __esModule: true,
  default: {
    connect: jest.fn(() => mockClient)
  }
}))

jest.mock('../src/network/mqtt/router', () => ({
  applyRoutes: jest.fn()
}))

const mqtt = require<{ default: typeof import('mqtt') }>('mqtt').default
const { response } =
  require<typeof import('../src/network/http/response')>(
    '../src/network/http/response'
  )
const { debugMessage, getClient, mqttConnection } =
  require<typeof import('../src/network/mqtt/mqtt')>(
    '../src/network/mqtt/mqtt'
  )
const { applyRoutes } =
  require<typeof import('../src/network/mqtt/router')>(
    '../src/network/mqtt/router'
  )
const { parseEnv } =
  require<typeof import('../src/config/env')>('../src/config/env')

const log = {
  error: jest.fn(),
  info: jest.fn()
} as Pick<FastifyBaseLogger, 'error' | 'info'> as FastifyBaseLogger

describe('DoorCloud backend tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Reflect.deleteProperty(global, '__mqttClient__')
    Object.assign(process.env, validEnv)
  })

  describe('environment validation', () => {
    test('parses required environment variables and defaults', () => {
      expect(parseEnv(validEnv)).toMatchObject({
        MODELS_CDN_URL: 'https://models.example.com',
        MQTT_HOST: 'mqtt.example.com',
        MQTT_PORT: 8883,
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

  describe('MQTT connection', () => {
    test('creates and reuses one MQTT client', () => {
      const firstClient = getClient(log)
      const secondClient = getClient(log)

      expect(mqtt.connect).toHaveBeenCalledTimes(1)
      expect(mqtt.connect).toHaveBeenCalledWith({
        host: 'mqtt.example.com',
        keepalive: 0,
        password: 'mqtt-password',
        port: 8883,
        protocol: 'mqtts',
        username: 'mqtt-user'
      })
      expect(firstClient).toBe(mockClient)
      expect(secondClient).toBe(mockClient)
      expect(log.info).toHaveBeenCalledWith({}, debugMessage)
    })

    test('applies MQTT routes on start', async () => {
      await mqttConnection(log).start()

      expect(applyRoutes).toHaveBeenCalledTimes(1)
      expect(applyRoutes).toHaveBeenCalledWith(mockClient, log)
    })

    test('ends the MQTT client on stop', async () => {
      await mqttConnection(log).stop()

      expect(mockClient.end).toHaveBeenCalledTimes(1)
    })
  })

  describe('HTTP response helper', () => {
    test('sends a normalized response envelope', () => {
      const reply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn()
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
