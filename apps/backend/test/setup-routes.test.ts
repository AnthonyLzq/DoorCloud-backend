import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fastify from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../src/config/env', () => ({
  getEnv: vi.fn()
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()

  return { ...actual, writeFileSync: vi.fn() }
})

import { getEnv } from '../src/config/env'
import { Setup } from '../src/network/http/routes/setup'

const mockGetEnv = getEnv as ReturnType<typeof vi.fn>

const buildApp = () => {
  const app = fastify({ logger: false })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  Setup(app.withTypeProvider<ZodTypeProvider>())

  return app
}

let tmpRoot: string
let envFile: string
const prevEnvFile = process.env.DOORCLOUD_ENV_FILE

beforeEach(() => {
  vi.clearAllMocks()
  // No SETUP_TOKEN configured -> setup endpoints run open (local dev)
  mockGetEnv.mockReturnValue({ SETUP_TOKEN: undefined })
  tmpRoot = mkdtempSync(join(tmpdir(), 'doorcloud-setup-routes-'))
  envFile = join(tmpRoot, '.env')
  process.env.DOORCLOUD_ENV_FILE = envFile
})

afterEach(() => {
  rmSync(tmpRoot, { force: true, recursive: true })
  if (prevEnvFile === undefined) delete process.env.DOORCLOUD_ENV_FILE
  else process.env.DOORCLOUD_ENV_FILE = prevEnvFile
})

describe('POST /setup/config schema validation', () => {
  test('rejects an invalid body with 400', async () => {
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      payload: { OPENWA_BASE_URL: 'not-a-url' }
    })

    expect(response.statusCode).toBe(400)
  })

  test('accepts a valid body and persists the config', async () => {
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      payload: {
        OPENWA_API_KEY: 'saved-key',
        OPENWA_BASE_URL: 'http://localhost:2785',
        OPENWA_CHAT_ID: '51999999999@c.us',
        OPENWA_SESSION_ID: 'main'
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      error: false,
      message: {
        saved: [
          'OPENWA_API_KEY',
          'OPENWA_BASE_URL',
          'OPENWA_CHAT_ID',
          'OPENWA_SESSION_ID'
        ]
      }
    })
  })
})

describe('SECRET-1: setup schema rejects unsafe OpenWA URLs', () => {
  test('rejects a non-HTTPS base URL with 400', async () => {
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      payload: { OPENWA_BASE_URL: 'http://wa.example.com' }
    })

    expect(response.statusCode).toBe(400)
  })

  test('rejects a non-allowlisted https host with 400', async () => {
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      payload: { OPENWA_BASE_URL: 'https://evil.example.com' }
    })

    expect(response.statusCode).toBe(400)
  })

  test('accepts a loopback dev URL', async () => {
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      payload: { OPENWA_BASE_URL: 'http://localhost:2785' }
    })

    expect(response.statusCode).toBe(200)
  })
})

describe('SECRET-2: production setup does not touch disk', () => {
  test('does not write the env file when NODE_ENV=production', async () => {
    mockGetEnv.mockReturnValue({ NODE_ENV: 'production' })
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      payload: {
        OPENWA_API_KEY: 'saved-key',
        OPENWA_BASE_URL: 'http://localhost:2785',
        OPENWA_CHAT_ID: '51999999999@c.us',
        OPENWA_SESSION_ID: 'main'
      }
    })

    expect(response.statusCode).toBe(200)
    expect(writeFileSync).not.toHaveBeenCalled()
    expect(response.json()).toMatchObject({
      error: false,
      message: { saved: [] }
    })
  })

  test('still writes the env file in development', async () => {
    mockGetEnv.mockReturnValue({ NODE_ENV: 'development' })
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      payload: {
        OPENWA_API_KEY: 'saved-key',
        OPENWA_BASE_URL: 'http://localhost:2785',
        OPENWA_CHAT_ID: '51999999999@c.us',
        OPENWA_SESSION_ID: 'main'
      }
    })

    expect(response.statusCode).toBe(200)
    expect(writeFileSync).toHaveBeenCalled()
  })
})

describe('setupAuthMiddleware (AUTH-2/3)', () => {
  const validPayload = {
    OPENWA_BASE_URL: 'http://localhost:2785'
  }

  test('rejects a request without Authorization as 401', async () => {
    mockGetEnv.mockReturnValue({ SETUP_TOKEN: 'correct-token' })
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      payload: validPayload
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      error: true,
      message: 'Authorization header with Bearer token required'
    })
  })

  test('rejects a wrong token as 401 (not 403)', async () => {
    mockGetEnv.mockReturnValue({ SETUP_TOKEN: 'correct-token' })
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      headers: { authorization: 'Bearer wrong-token' },
      payload: validPayload
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      error: true,
      message: 'Invalid setup token'
    })
  })

  test('rejects a short token as 401 without throwing', async () => {
    mockGetEnv.mockReturnValue({ SETUP_TOKEN: 'correct-token' })
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      headers: { authorization: 'Bearer t' },
      payload: validPayload
    })

    expect(response.statusCode).toBe(401)
  })

  test('accepts a valid token', async () => {
    mockGetEnv.mockReturnValue({ SETUP_TOKEN: 'correct-token' })
    const app = buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/setup/config',
      headers: { authorization: 'Bearer correct-token' },
      payload: {
        OPENWA_API_KEY: 'saved-key',
        OPENWA_BASE_URL: 'http://localhost:2785',
        OPENWA_CHAT_ID: '51999999999@c.us',
        OPENWA_SESSION_ID: 'main'
      }
    })

    expect(response.statusCode).toBe(200)
  })
})
