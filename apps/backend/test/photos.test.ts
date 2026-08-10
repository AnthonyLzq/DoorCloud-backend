import { createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getEnv } from '../src/config/env'
import { response } from '../src/network/http/response'
import { Photos } from '../src/network/http/routes/photos'

vi.mock('../src/config/env', () => ({
  getEnv: vi.fn()
}))

const mockGetEnv = getEnv as ReturnType<typeof vi.fn>

const PHOTO_URL_SECRET = 'test-photo-url-secret'

const signedPhotoUrl = (path: string, expiresAt = Date.now() + 30_000) =>
  `/photos/${createHmac('sha256', PHOTO_URL_SECRET)
    .update(`${expiresAt}:${path}`)
    .digest('hex')}/${expiresAt}/${path}`

let photosDir: string

const buildApp = async (): Promise<FastifyInstance> => {
  const app = fastify({ logger: false })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  Photos(app.withTypeProvider<ZodTypeProvider>())
  app.setNotFoundHandler((_request, reply) => {
    response({ error: true, message: 'Not found', reply, status: 404 })
  })
  app.setErrorHandler(
    (
      error: { statusCode?: number; status?: number; message: string },
      _request,
      reply
    ) => {
      const status = error.statusCode ?? error.status ?? 500

      response({ error: true, message: error.message, reply, status })
    }
  )

  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  photosDir = mkdtempSync(join(tmpdir(), 'doorcloud-photos-routes-'))
  mockGetEnv.mockReturnValue({
    PHOTOS_DIR: photosDir,
    PHOTOS_BASE_URL: 'http://localhost:1996/photos',
    PHOTOS_URL_SECRET: PHOTO_URL_SECRET,
    PHOTO_URL_TTL_MS: 300_000
  })
})

afterEach(() => {
  rmSync(photosDir, { force: true, recursive: true })
})

describe('Signed photo serving (RF-4)', () => {
  test('serves a signed URL and rejects unsigned, tampered, expired, traversal, and absolute URLs', async () => {
    const app = await buildApp()
    const inject = async (url: string) =>
      (await app.inject({ method: 'GET', url })).statusCode

    mkdirSync(join(photosDir, 'Ana-42'), { recursive: true })
    writeFileSync(join(photosDir, 'Ana-42', 'selfie.jpg'), 'photo-content')
    writeFileSync(join(photosDir, '..', 'secret.txt'), 'TOP-SECRET')

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

  test('returns 404 for a validly signed URL whose file was removed', async () => {
    const app = await buildApp()

    mkdirSync(join(photosDir, 'Ana-42'), { recursive: true })
    writeFileSync(join(photosDir, 'Ana-42', 'selfie.jpg'), 'photo-content')

    const url = signedPhotoUrl('Ana-42/selfie.jpg')
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200)

    rmSync(join(photosDir, 'Ana-42', 'selfie.jpg'))

    const response = await app.inject({ method: 'GET', url })
    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toMatch(/application\/json/)
  })

  test('serves photos with the correct content type', async () => {
    const app = await buildApp()

    mkdirSync(join(photosDir, 'Ana-42'), { recursive: true })
    writeFileSync(join(photosDir, 'Ana-42', 'selfie.jpg'), 'photo-content')

    const url = signedPhotoUrl('Ana-42/selfie.jpg')
    const response = await app.inject({ method: 'GET', url })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toMatch(/^image\/jpeg/)
    expect(response.body).toBe('photo-content')
  })
})
