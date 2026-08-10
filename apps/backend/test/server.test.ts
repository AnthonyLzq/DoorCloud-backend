import { createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PHOTO_URL_SECRET = 'test-photo-url-secret'

const signedPhotoUrl = (path: string, expiresAt = Date.now() + 30_000) =>
  `/photos/${createHmac('sha256', PHOTO_URL_SECRET)
    .update(`${expiresAt}:${path}`)
    .digest('hex')}/${expiresAt}/${path}`

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
    PHOTOS_DIR: photosDir,
    PHOTOS_BASE_URL: 'http://localhost:1996/photos',
    PHOTOS_URL_SECRET: PHOTO_URL_SECRET,
    PHOTO_URL_TTL_MS: 300_000
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

  it('GET /healthz returns 200 without auth (CD-1)', async () => {
    const { Server } = await import('../src/network/server.js')
    currentServer = Server
    await Server.start()

    const res = await Server.app.inject({ method: 'GET', url: '/healthz' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('stop() is idempotent and releases sessions once (CD-2)', async () => {
    const Server = await startServer()

    await Server.stop()
    await Server.stop()
    await Server.stop()

    expect(mocks.frsShutdown).toHaveBeenCalledTimes(1)
    expect(mocks.mqttConnection.mock.results[0].value.stop).toHaveBeenCalledTimes(1)
  })
})

describe('Signed photo serving (RF-4)', () => {
  it('serves a signed URL and rejects unsigned, tampered, expired, traversal, and absolute URLs', async () => {
    const { Server } = await import('../src/network/server.js')
    currentServer = Server
    await Server.start()
    const inject = async (url: string) =>
      (await Server.app.inject({ method: 'GET', url })).statusCode

    mkdirSync(join(photosDir, 'Ana-42'), { recursive: true })
    writeFileSync(join(photosDir, 'Ana-42', 'selfie.jpg'), 'photo-content')
    writeFileSync(join(tmpRoot, 'secret.txt'), 'TOP-SECRET')

    const urls = [
      signedPhotoUrl('Ana-42/selfie.jpg'),
      '/photos/Ana-42/selfie.jpg',
      `/photos/${'f'.repeat(64)}/${Date.now() + 30_000}/Ana-42/selfie.jpg`,
      signedPhotoUrl('Ana-42/selfie.jpg', Date.now() - 1_000),
      signedPhotoUrl('../secret.txt'),
      signedPhotoUrl('/etc/passwd')
    ]
    const statuses = await Promise.all(urls.map(inject))

    expect(statuses[0]).toBe(200)
    expect(statuses.slice(1, 4)).toEqual([404, 404, 404])
    expect(statuses.slice(4).every(s => s >= 400)).toBe(true)
  })

  it('returns 404 for a validly signed URL whose file was removed', async () => {
    const { Server } = await import('../src/network/server.js')
    currentServer = Server
    await Server.start()

    mkdirSync(join(photosDir, 'Ana-42'), { recursive: true })
    writeFileSync(join(photosDir, 'Ana-42', 'selfie.jpg'), 'photo-content')

    const url = signedPhotoUrl('Ana-42/selfie.jpg')
    expect((await Server.app.inject({ method: 'GET', url })).statusCode).toBe(
      200
    )

    rmSync(join(photosDir, 'Ana-42', 'selfie.jpg'))

    const response = await Server.app.inject({ method: 'GET', url })
    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toMatch(/application\/json/)
  })

  it('serves photos with the correct content type', async () => {
    const { Server } = await import('../src/network/server.js')
    currentServer = Server
    await Server.start()

    mkdirSync(join(photosDir, 'Ana-42'), { recursive: true })
    writeFileSync(join(photosDir, 'Ana-42', 'selfie.jpg'), 'photo-content')

    const url = signedPhotoUrl('Ana-42/selfie.jpg')
    const response = await Server.app.inject({ method: 'GET', url })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toMatch(/^image\/jpeg/)
    expect(response.body).toBe('photo-content')
  })
})

describe('HTTP hardening (REQ-6/7) — security headers and rate limit', () => {
  it('adds security headers on responses: CSP, nosniff, frame-ancestors', async () => {
    const { Server } = await import('../src/network/server.js')
    currentServer = Server
    await Server.start()

    const res = await Server.app.inject({ method: 'GET', url: '/healthz' })

    expect(res.statusCode).toBe(200)

    const csp = res.headers['content-security-policy'] as string
    expect(csp).toBeDefined()
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).toContain("img-src 'self'")
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
  })

  it('rate limits bursts on protected routes but exempts /healthz', async () => {
    const { Server } = await import('../src/network/server.js')
    currentServer = Server
    await Server.start()

    // /healthz is exempt: a burst never gets rate-limited.
    for (let i = 0; i < 20; i++) {
      const res = await Server.app.inject({ method: 'GET', url: '/healthz' })
      expect(res.statusCode).toBe(200)
    }

    // Protected paths exceed the per-window max and answer 429. The root
    // SPA route is a real (non-exempt) route: applyRoutes is mocked in this
    // suite, so /setup/* and /admin/* would 404 without hitting the global
    // rate-limit hook (Fastify 404s bypass instance hooks).
    const burst = await Promise.all(
      Array.from({ length: 130 }, () =>
        Server.app.inject({ method: 'GET', url: '/' })
      )
    )
    const got429 = burst.some(res => res.statusCode === 429)
    expect(got429).toBe(true)
  })
})
