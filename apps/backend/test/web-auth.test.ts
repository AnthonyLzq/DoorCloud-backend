import fastify from 'fastify'
import { describe, expect, test, vi } from 'vitest'

vi.mock('../src/config/env', () => ({
  getEnv: vi.fn()
}))

import { getEnv } from '../src/config/env'
import { safeEqual } from '../src/network/http/middleware/auth'
import { webAuthMiddleware } from '../src/network/http/middleware/web-auth'

const mockGetEnv = getEnv as ReturnType<typeof vi.fn>

const buildApp = () => {
  const app = fastify({ logger: false })

  app.addHook('preHandler', webAuthMiddleware)
  app.get('/', async () => ({ ok: true }))
  app.get('/setup', async () => ({ ok: true }))
  app.get('/assets/app.js', async () => 'asset')
  app.get('/healthz', async () => ({ status: 'ok' }))
  app.get('/photos/:signature/:expiresAt/*', async () => 'photo')

  return app
}

const basicHeader = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`

describe('webAuthMiddleware', () => {
  test('allows requests when no credentials are configured (dev mode)', async () => {
    mockGetEnv.mockReturnValue({
      WEB_AUTH_USER: undefined,
      WEB_AUTH_PASS: undefined
    })
    const app = buildApp()

    const response = await app.inject({ method: 'GET', url: '/' })

    expect(response.statusCode).toBe(200)
  })

  test('rejects a request without Authorization as 401 with WWW-Authenticate', async () => {
    mockGetEnv.mockReturnValue({
      WEB_AUTH_USER: 'admin',
      WEB_AUTH_PASS: 'secret'
    })
    const app = buildApp()

    const response = await app.inject({ method: 'GET', url: '/' })

    expect(response.statusCode).toBe(401)
    expect(response.headers['www-authenticate']).toBe('Basic realm="DoorCloud"')
    expect(response.json()).toEqual({
      error: true,
      message: 'Authentication required'
    })
  })

  test('allows a request with valid Basic credentials', async () => {
    mockGetEnv.mockReturnValue({
      WEB_AUTH_USER: 'admin',
      WEB_AUTH_PASS: 'secret'
    })
    const app = buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { authorization: basicHeader('admin', 'secret') }
    })

    expect(response.statusCode).toBe(200)
  })

  test('rejects wrong credentials as 401 with WWW-Authenticate', async () => {
    mockGetEnv.mockReturnValue({
      WEB_AUTH_USER: 'admin',
      WEB_AUTH_PASS: 'secret'
    })
    const app = buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { authorization: basicHeader('admin', 'wrong') }
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['www-authenticate']).toBe('Basic realm="DoorCloud"')
  })

  test('rejects a malformed Authorization header as 401', async () => {
    mockGetEnv.mockReturnValue({
      WEB_AUTH_USER: 'admin',
      WEB_AUTH_PASS: 'secret'
    })
    const app = buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { authorization: 'Bearer some-token' }
    })

    expect(response.statusCode).toBe(401)
  })

  test('keeps /healthz open without credentials', async () => {
    mockGetEnv.mockReturnValue({
      WEB_AUTH_USER: 'admin',
      WEB_AUTH_PASS: 'secret'
    })
    const app = buildApp()

    const response = await app.inject({ method: 'GET', url: '/healthz' })

    expect(response.statusCode).toBe(200)
  })

  test('keeps signed /photos/* URLs open without credentials', async () => {
    mockGetEnv.mockReturnValue({
      WEB_AUTH_USER: 'admin',
      WEB_AUTH_PASS: 'secret'
    })
    const app = buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/photos/signature/1900000000/Ana-42/selfie.jpg'
    })

    expect(response.statusCode).toBe(200)
  })

  test('protects /setup and /assets when credentials are configured', async () => {
    mockGetEnv.mockReturnValue({
      WEB_AUTH_USER: 'admin',
      WEB_AUTH_PASS: 'secret'
    })
    const app = buildApp()

    const setup = await app.inject({ method: 'GET', url: '/setup' })
    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' })

    expect(setup.statusCode).toBe(401)
    expect(asset.statusCode).toBe(401)
  })

  test('rejects a short username as 401 without throwing', async () => {
    mockGetEnv.mockReturnValue({
      WEB_AUTH_USER: 'admin',
      WEB_AUTH_PASS: 'secret'
    })
    const app = buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { authorization: basicHeader('a', 'secret') }
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('safeEqual (AUTH-3)', () => {
  test('returns true for equal values', () => {
    expect(safeEqual('secret', 'secret')).toBe(true)
  })

  test('returns false for different values of equal length', () => {
    expect(safeEqual('secret1', 'secret2')).toBe(false)
  })

  test('returns false for different lengths without throwing', () => {
    expect(() => safeEqual('long-secret-value', 'short')).not.toThrow()
    expect(safeEqual('long-secret-value', 'short')).toBe(false)
  })
})
