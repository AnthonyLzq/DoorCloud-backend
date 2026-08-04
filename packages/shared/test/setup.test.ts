import { describe, expect, test } from 'vitest'
import {
  openWaQrSchema,
  openWaSessionSchema,
  openWaSetupConfigResultSchema,
  openWaSetupConfigSchema,
  openWaSetupStatusSchema
} from '../src/index'

describe('openWaSessionSchema', () => {
  test('accepts a fully populated session', () => {
    const session = {
      id: 'main',
      name: 'main',
      phone: '51999999999@c.us',
      status: 'qr_ready'
    }

    expect(openWaSessionSchema.parse(session)).toEqual(session)
  })

  test('accepts a minimal session with only an id', () => {
    expect(openWaSessionSchema.parse({ id: 'main' })).toEqual({ id: 'main' })
  })

  test('accepts a null phone', () => {
    expect(openWaSessionSchema.parse({ id: 'main', phone: null })).toEqual({
      id: 'main',
      phone: null
    })
  })

  test('rejects a session without an id', () => {
    expect(openWaSessionSchema.safeParse({ status: 'connected' }).success).toBe(
      false
    )
  })
})

describe('openWaQrSchema', () => {
  test('accepts a QR payload', () => {
    const payload = {
      qrCode: 'data:image/png;base64,ZmFrZQ==',
      status: 'qr_ready'
    }

    expect(openWaQrSchema.parse(payload)).toEqual(payload)
  })

  test('rejects a missing qrCode', () => {
    expect(openWaQrSchema.safeParse({ status: 'qr_ready' }).success).toBe(false)
  })
})

describe('openWaSetupStatusSchema', () => {
  test('accepts the session null state (unconfigured)', () => {
    const status = {
      configured: false,
      configuredChatId: '51999999999@c.us',
      configuredSessionId: 'main',
      missing: ['OPENWA_API_KEY'],
      session: null
    }

    expect(openWaSetupStatusSchema.parse(status)).toEqual(status)
  })

  test('accepts the connected state with a session object', () => {
    const status = {
      configured: true,
      configuredSessionId: 'main',
      missing: [],
      session: { id: 'main', status: 'connected' }
    }

    expect(openWaSetupStatusSchema.parse(status)).toEqual(status)
  })

  test('rejects a non-object, non-null session', () => {
    const status = {
      configured: false,
      configuredSessionId: 'main',
      missing: [],
      session: 'main'
    }

    expect(openWaSetupStatusSchema.safeParse(status).success).toBe(false)
  })

  test('rejects missing configuredSessionId', () => {
    const status = {
      configured: false,
      missing: [],
      session: null
    }

    expect(openWaSetupStatusSchema.safeParse(status).success).toBe(false)
  })
})

describe('openWaSetupConfigSchema', () => {
  test('accepts an empty config (all fields optional)', () => {
    expect(openWaSetupConfigSchema.parse({})).toEqual({})
  })

  test('accepts a fully populated config', () => {
    const config = {
      OPENWA_API_KEY: 'key',
      OPENWA_BASE_URL: 'http://localhost:2785',
      OPENWA_CHAT_ID: '51999999999@c.us',
      OPENWA_SESSION_ID: 'main'
    }

    expect(openWaSetupConfigSchema.parse(config)).toEqual(config)
  })

  test('rejects a non-URL base URL', () => {
    expect(
      openWaSetupConfigSchema.safeParse({ OPENWA_BASE_URL: 'not-a-url' })
        .success
    ).toBe(false)
  })

  test('trims config values', () => {
    expect(
      openWaSetupConfigSchema.parse({ OPENWA_API_KEY: '  key  ' })
    ).toEqual({ OPENWA_API_KEY: 'key' })
  })
})

describe('openWaSetupConfigResultSchema', () => {
  test('accepts a saved-keys list', () => {
    expect(
      openWaSetupConfigResultSchema.parse({
        saved: ['OPENWA_API_KEY', 'OPENWA_BASE_URL']
      })
    ).toEqual({ saved: ['OPENWA_API_KEY', 'OPENWA_BASE_URL'] })
  })

  test('rejects a non-array saved value', () => {
    expect(
      openWaSetupConfigResultSchema.safeParse({ saved: 'OPENWA_API_KEY' })
        .success
    ).toBe(false)
  })
})
