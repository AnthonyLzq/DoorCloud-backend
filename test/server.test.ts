import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
  supabaseConnection: vi.fn(),
  mqttConnection: vi.fn(),
  applyRoutes: vi.fn(),
  humanInit: vi.fn(),
  frsInit: vi.fn(),
  frsShutdown: vi.fn()
}))

vi.mock('../src/config/env', () => ({
  getEnv: mocks.getEnv
}))
vi.mock('../src/database', () => ({
  supabaseConnection: mocks.supabaseConnection
}))
vi.mock('../src/network/mqtt', () => ({
  mqttConnection: mocks.mqttConnection
}))
vi.mock('../src/network/http', () => ({
  applyRoutes: mocks.applyRoutes
}))
vi.mock('../src/lib', () => ({
  init: mocks.humanInit
}))
vi.mock('../src/services/face-recognition', () => ({
  FaceRecognitionService: class {
    init = mocks.frsInit
    shutdown = mocks.frsShutdown
  }
}))

interface ServerLike {
  start: () => Promise<void>
  stop: () => Promise<void>
}

let currentServer: ServerLike | null = null

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.getEnv.mockReturnValue({
    NODE_ENV: 'production',
    CORS_ORIGINS: undefined,
    PORT: 0
  })
  mocks.mqttConnection.mockReturnValue({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined)
  })
})

afterEach(async () => {
  if (currentServer) {
    await currentServer.stop()
    currentServer = null
  }
})

async function startServer(): Promise<ServerLike> {
  const { Server } = await import('../src/network/server.js')
  currentServer = Server
  await Server.start()
  return Server
}

describe('Server lifecycle (RF-5)', () => {
  it('start() initializes ONNX face recognition instead of human', async () => {
    await startServer()

    expect(mocks.frsInit).toHaveBeenCalledTimes(1)
    expect(mocks.frsInit).toHaveBeenCalledWith({ mode: 'onnx' })
    expect(mocks.humanInit).not.toHaveBeenCalled()
  })

  it('stop() releases the face recognition service sessions', async () => {
    const Server = await startServer()
    await Server.stop()

    expect(mocks.frsShutdown).toHaveBeenCalledTimes(1)
  })

  it('start() still wires supabase and MQTT alongside ONNX face recognition', async () => {
    await startServer()

    expect(mocks.supabaseConnection).toHaveBeenCalled()
    expect(mocks.mqttConnection).toHaveBeenCalled()
    expect(mocks.mqttConnection.mock.results[0].value.start).toHaveBeenCalled()
    expect(mocks.frsInit).toHaveBeenCalledWith({ mode: 'onnx' })
  })

  it('start() fails fast when face recognition init fails and cleans up', async () => {
    mocks.frsInit.mockRejectedValueOnce(new Error('model load failed'))

    const { Server } = await import('../src/network/server.js')
    currentServer = Server
    await expect(Server.start()).rejects.toThrow('model load failed')

    // Cleanup ran: sessions released, MQTT never started, no HTTP listen
    expect(mocks.frsShutdown).toHaveBeenCalledTimes(1)
    expect(mocks.mqttConnection).not.toHaveBeenCalled()
  })
})
