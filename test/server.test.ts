import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
  mqttConnection: vi.fn(),
  applyRoutes: vi.fn(),
  humanInit: vi.fn(),
  frsInit: vi.fn(),
  frsShutdown: vi.fn()
}))

vi.mock('../src/config/env', () => ({
  getEnv: mocks.getEnv
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
  },
  faceRecognitionService: {
    init: mocks.frsInit,
    shutdown: mocks.frsShutdown
  }
}))

interface ServerLike {
  start: () => Promise<void>
  stop: () => Promise<void>
}

let currentServer: ServerLike | null = null
let tmpRoot: string
let photosDir: string

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  tmpRoot = mkdtempSync(join(tmpdir(), 'doorcloud-server-'))
  photosDir = join(tmpRoot, 'photos')
  mkdirSync(photosDir, { recursive: true })
  mocks.getEnv.mockReturnValue({
    NODE_ENV: 'production',
    CORS_ORIGINS: undefined,
    PORT: 0,
    PHOTOS_DIR: photosDir
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
  rmSync(tmpRoot, { force: true, recursive: true })
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

  it('start() wires MQTT and photo storage without instantiating Supabase', async () => {
    await startServer()

    expect(
      (globalThis as { __supabaseClient__?: unknown }).__supabaseClient__
    ).toBeUndefined()
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

describe('Static photo serving (RF-4)', () => {
  it('serves a stored photo with 200 and its content', async () => {
    mkdirSync(join(photosDir, 'Ana-42'), { recursive: true })
    writeFileSync(join(photosDir, 'Ana-42', 'selfie.jpg'), 'photo-content')

    const { Server } = await import('../src/network/server.js')
    currentServer = Server

    const response = await Server.app.inject({
      method: 'GET',
      url: '/photos/Ana-42/selfie.jpg'
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('photo-content')
  })

  it('rejects ../ traversal with 4xx and never reads outside the root', async () => {
    writeFileSync(join(tmpRoot, 'secret.txt'), 'TOP-SECRET')

    const { Server } = await import('../src/network/server.js')
    currentServer = Server

    const response = await Server.app.inject({
      method: 'GET',
      url: '/photos/../secret.txt'
    })

    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(response.statusCode).toBeLessThan(500)
    expect(response.body).not.toContain('TOP-SECRET')
  })

  it('rejects an absolute path segment with 4xx', async () => {
    const { Server } = await import('../src/network/server.js')
    currentServer = Server

    const response = await Server.app.inject({
      method: 'GET',
      url: '/photos//etc/passwd'
    })

    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(response.statusCode).toBeLessThan(500)
  })
})
