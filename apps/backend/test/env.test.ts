import { describe, expect, test } from 'vitest'

import { parseEnv } from '../src/config/env'

const baseEnv = {
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
  PHOTOS_DIR: '/tmp/doorcloud-photos',
  PHOTOS_BASE_URL: 'http://localhost:1996/photos',
  PHOTOS_URL_SECRET: 'test-photo-url-secret',
  USER_NAME: 'Ana',
  USER_PHONE: '51999999999@c.us'
}

const prodEnv = {
  ...baseEnv,
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://app.doorcloud.com'
}

const authVars = {
  SETUP_TOKEN: 'setup-secret-token',
  WEB_AUTH_USER: 'web-user',
  WEB_AUTH_PASS: 'web-password'
}

const without = (
  env: Record<string, string>,
  ...keys: string[]
): Record<string, string | undefined> => {
  const copy: Record<string, string | undefined> = { ...env }
  for (const key of keys) delete copy[key]

  return copy
}

describe('AUTH-1: production-required auth secrets', () => {
  test('production boots when all auth vars are set', () => {
    const env = parseEnv({ ...prodEnv, ...authVars })

    expect(env.SETUP_TOKEN).toBe('setup-secret-token')
    expect(env.WEB_AUTH_USER).toBe('web-user')
    expect(env.WEB_AUTH_PASS).toBe('web-password')
  })

  test('production fails fast when SETUP_TOKEN is missing', () => {
    expect(() => parseEnv(without(prodEnv, 'SETUP_TOKEN'))).toThrow(
      'SETUP_TOKEN'
    )
  })

  test('production fails fast when WEB_AUTH_USER is missing', () => {
    expect(() =>
      parseEnv(without({ ...prodEnv, ...authVars }, 'WEB_AUTH_USER'))
    ).toThrow('WEB_AUTH_USER')
  })

  test('production fails fast when WEB_AUTH_PASS is missing', () => {
    expect(() =>
      parseEnv(without({ ...prodEnv, ...authVars }, 'WEB_AUTH_PASS'))
    ).toThrow('WEB_AUTH_PASS')
  })

  test('dev keeps working with auth vars unset', () => {
    const env = parseEnv(baseEnv)

    expect(env.NODE_ENV).toBe('development')
    expect(env.SETUP_TOKEN).toBeUndefined()
    expect(env.WEB_AUTH_USER).toBeUndefined()
    expect(env.WEB_AUTH_PASS).toBeUndefined()
  })

  test('explicit development env keeps working with auth vars unset', () => {
    const env = parseEnv({ ...baseEnv, NODE_ENV: 'development' })

    expect(env.SETUP_TOKEN).toBeUndefined()
    expect(env.WEB_AUTH_USER).toBeUndefined()
    expect(env.WEB_AUTH_PASS).toBeUndefined()
  })
})