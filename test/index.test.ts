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

const log = {
  error: jest.fn(),
  info: jest.fn()
} as Pick<FastifyBaseLogger, 'error' | 'info'> as FastifyBaseLogger

describe('DoorCloud backend tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Reflect.deleteProperty(global, '__mqttClient__')
  })

  describe('MQTT connection', () => {
    test('creates and reuses one MQTT client', () => {
      const firstClient = getClient(log)
      const secondClient = getClient(log)

      expect(mqtt.connect).toHaveBeenCalledTimes(1)
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
