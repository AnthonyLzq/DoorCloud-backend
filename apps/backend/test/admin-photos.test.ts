import multipart from '@fastify/multipart'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
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
import { AdminPhotos } from '../src/network/http/routes/admin-photos'
import { response } from '../src/network/http/response'
import { DiskPhotoStorage } from '../src/storage/photos'

vi.mock('../src/config/env', () => ({
  getEnv: vi.fn()
}))
vi.mock('../src/utils', () => ({
  validateImage: () => ({ ext: 'jpeg', mimetype: 'image/jpeg' })
}))

const mockGetEnv = getEnv as ReturnType<typeof vi.fn>

let photosDir: string
let storage: DiskPhotoStorage

const buildApp = async (): Promise<FastifyInstance> => {
  const app = fastify({ logger: false })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(multipart, {
    limits: {
      fields: 3,
      files: 3
    }
  })
  AdminPhotos(app.withTypeProvider<ZodTypeProvider>())
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

const buildMultipartBody = (
  filenames: string[],
  boundary = '----doorcloud-admin'
): { body: string; contentType: string } => {
  const parts = filenames.flatMap(filename => [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="photo"; filename="${filename}"\r\n`,
    'Content-Type: image/jpeg\r\n',
    '\r\n',
    'photo-bytes',
    '\r\n'
  ])
  parts.push(`--${boundary}--\r\n`)

  return {
    body: parts.join(''),
    contentType: `multipart/form-data; boundary=${boundary}`
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  photosDir = mkdtempSync(join(tmpdir(), 'doorcloud-admin-routes-'))
  storage = new DiskPhotoStorage({
    photosDir,
    baseUrl: 'http://localhost:1996/photos',
    urlSecret: 'test-photo-url-secret',
    urlTtlMs: 300_000
  })
  mockGetEnv.mockReturnValue({
    PHOTOS_DIR: photosDir,
    PHOTOS_BASE_URL: 'http://localhost:1996/photos',
    PHOTOS_URL_SECRET: 'test-photo-url-secret',
    PHOTO_URL_TTL_MS: 300_000,
    SETUP_TOKEN: undefined,
    USER_NAME: 'Ana'
  })
})

afterEach(() => {
  rmSync(photosDir, { force: true, recursive: true })
})

describe('Admin photos API (PA-1..6)', () => {
  test('PA-1: requires the SETUP_TOKEN Bearer when configured', async () => {
    mockGetEnv.mockReturnValue({
      PHOTOS_DIR: photosDir,
      PHOTOS_BASE_URL: 'http://localhost:1996/photos',
      PHOTOS_URL_SECRET: 'test-photo-url-secret',
      PHOTO_URL_TTL_MS: 300_000,
      SETUP_TOKEN: 'secret-token',
      USER_NAME: 'Ana'
    })
    const app = await buildApp()

    const missing = await app.inject({
      method: 'GET',
      url: '/admin/photos/persons'
    })
    expect(missing.statusCode).toBe(401)
    expect(missing.json()).toMatchObject({ error: true })

    const withToken = await app.inject({
      method: 'GET',
      url: '/admin/photos/persons',
      headers: { authorization: 'Bearer secret-token' }
    })
    expect(withToken.statusCode).toBe(200)

    await app.close()
  })

  test('PA-1: failures use the { error, message } envelope', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/admin/photos/persons',
      payload: { name: '../escape' }
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: true })
    expect(typeof response.json().message).toBe('string')

    await app.close()
  })

  test('PA-2: rejects ".", "..", separators, empty and reserved names', async () => {
    const app = await buildApp()

    for (const name of ['.', '..', 'a/b', 'a\\b', '   ', 'unidentified']) {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/photos/persons',
        payload: { name }
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe(true)
    }

    await app.close()
  })

  test('PA-2: creating or renaming to an existing person returns 409', async () => {
    const app = await buildApp()
    await storage.createFolder('Bryan')
    await storage.createFolder('Other')

    const create = await app.inject({
      method: 'POST',
      url: '/admin/photos/persons',
      payload: { name: 'Bryan' }
    })
    expect(create.statusCode).toBe(409)

    const rename = await app.inject({
      method: 'PATCH',
      url: '/admin/photos/persons/Other',
      payload: { name: 'Bryan' }
    })
    expect(rename.statusCode).toBe(409)

    await app.close()
  })

  test('PA-3: owner folder rename and delete are rejected with 403', async () => {
    const app = await buildApp()
    mkdirSync(join(photosDir, 'Ana'))

    const rename = await app.inject({
      method: 'PATCH',
      url: '/admin/photos/persons/Ana',
      payload: { name: 'Owner' }
    })
    expect(rename.statusCode).toBe(403)

    const del = await app.inject({
      method: 'DELETE',
      url: '/admin/photos/persons/Ana?confirm=true'
    })
    expect(del.statusCode).toBe(403)
    expect(existsSync(join(photosDir, 'Ana'))).toBe(true)

    await app.close()
  })

  test('PA-4: lists persons with photo counts and the owner name', async () => {
    const app = await buildApp()
    await storage.upload('Bryan', 'selfie.jpg', Buffer.from('a'))

    const list = await app.inject({
      method: 'GET',
      url: '/admin/photos/persons'
    })

    expect(list.statusCode).toBe(200)
    expect(list.headers['content-type']).toMatch(/application\/json/)
    expect(list.json().message).toEqual({
      owner: 'Ana',
      persons: [{ name: 'Bryan', photoCount: 1 }]
    })

    await app.close()
  })

  test('PA-4: DELETE without confirm=true returns 400 and keeps the folder', async () => {
    const app = await buildApp()
    await storage.createFolder('Bryan')

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/photos/persons/Bryan'
    })

    expect(response.statusCode).toBe(400)
    expect(existsSync(join(photosDir, 'Bryan'))).toBe(true)

    await app.close()
  })

  test('PA-4: DELETE with confirm=true hard-deletes the folder', async () => {
    const app = await buildApp()
    await storage.upload('Bryan', 'selfie.jpg', Buffer.from('a'))

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/photos/persons/Bryan?confirm=true'
    })

    expect(response.statusCode).toBe(200)
    expect(existsSync(join(photosDir, 'Bryan'))).toBe(false)

    await app.close()
  })

  test('PA-4: PATCH renames the folder and preserves its photos', async () => {
    const app = await buildApp()
    await storage.upload('Bryan', 'selfie.jpg', Buffer.from('a'))

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/photos/persons/Bryan',
      payload: { name: 'Bryan2' }
    })

    expect(response.statusCode).toBe(200)
    expect(existsSync(join(photosDir, 'Bryan'))).toBe(false)
    expect(existsSync(join(photosDir, 'Bryan2', 'selfie.jpg'))).toBe(true)

    await app.close()
  })

  test('PA-5: uploads a multipart photo and lists it with a signed URL', async () => {
    const app = await buildApp()
    await storage.createFolder('Bryan')
    const { body, contentType } = buildMultipartBody(['selfie.jpg'])

    const upload = await app.inject({
      method: 'POST',
      url: '/admin/photos/persons/Bryan/photos',
      headers: { 'content-type': contentType },
      payload: body
    })
    expect(upload.statusCode).toBe(200)

    const list = await app.inject({
      method: 'GET',
      url: '/admin/photos/persons/Bryan/photos'
    })
    expect(list.statusCode).toBe(200)
    expect(list.json().message).toHaveLength(1)
    expect(list.json().message[0].filename).toMatch(/^selfie-.*\.jpeg$/)
    expect(list.json().message[0].url).toMatch(/^http:\/\/localhost:1996\/photos\//)

    await app.close()
  })

  test('PA-5/D8: per-route limits allow 20 files over the global limit of 3', async () => {
    const app = await buildApp()
    await storage.createFolder('Bryan')
    const filenames = Array.from({ length: 5 }, (_, i) => `file-${i}.jpg`)
    const { body, contentType } = buildMultipartBody(filenames)

    const upload = await app.inject({
      method: 'POST',
      url: '/admin/photos/persons/Bryan/photos',
      headers: { 'content-type': contentType },
      payload: body
    })

    expect(upload.statusCode).toBe(200)
    expect(upload.json().message).toHaveLength(5)

    await app.close()
  })

  test('PA-5/D8: rejects more than 20 files with an error envelope', async () => {
    const app = await buildApp()
    await storage.createFolder('Bryan')
    const filenames = Array.from({ length: 21 }, (_, i) => `file-${i}.jpg`)
    const { body, contentType } = buildMultipartBody(filenames)

    const upload = await app.inject({
      method: 'POST',
      url: '/admin/photos/persons/Bryan/photos',
      headers: { 'content-type': contentType },
      payload: body
    })

    expect(upload.statusCode).toBeGreaterThanOrEqual(400)
    expect(upload.json()).toMatchObject({ error: true })

    await app.close()
  })

  test('PA-5: deletes a single photo with containment', async () => {
    const app = await buildApp()
    await storage.upload('Bryan', 'drop.jpg', Buffer.from('a'))

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/photos/persons/Bryan/photos/drop.jpg'
    })

    expect(response.statusCode).toBe(200)
    expect(existsSync(join(photosDir, 'Bryan', 'drop.jpg'))).toBe(false)

    await app.close()
  })

  test('PA-6: lists unidentified photos with signed URLs', async () => {
    const app = await buildApp()
    await storage.upload('unidentified', '1785597387029-nomatch.jpg', Buffer.from('a'))

    const list = await app.inject({
      method: 'GET',
      url: '/admin/photos/unidentified'
    })

    expect(list.statusCode).toBe(200)
    expect(list.json().message).toHaveLength(1)
    expect(list.json().message[0].filename).toBe('1785597387029-nomatch.jpg')
    expect(list.json().message[0].url).toMatch(/\/unidentified\//)

    await app.close()
  })

  test('PA-6: promote moves the file into the person folder', async () => {
    const app = await buildApp()
    await storage.createFolder('Bryan')
    await storage.upload('unidentified', 'x.jpg', Buffer.from('a'))

    const promote = await app.inject({
      method: 'POST',
      url: '/admin/photos/unidentified/x.jpg/promote',
      payload: { person: 'Bryan' }
    })

    expect(promote.statusCode).toBe(200)
    expect(existsSync(join(photosDir, 'Bryan', 'x.jpg'))).toBe(true)
    expect(existsSync(join(photosDir, 'unidentified', 'x.jpg'))).toBe(false)

    await app.close()
  })

  test('PA-6: promote to a missing person returns 404', async () => {
    const app = await buildApp()
    await storage.upload('unidentified', 'x.jpg', Buffer.from('a'))

    const promote = await app.inject({
      method: 'POST',
      url: '/admin/photos/unidentified/x.jpg/promote',
      payload: { person: 'Ghost' }
    })

    expect(promote.statusCode).toBe(404)
    expect(existsSync(join(photosDir, 'unidentified', 'x.jpg'))).toBe(true)

    await app.close()
  })

  test('PA-6: deletes a single unidentified photo', async () => {
    const app = await buildApp()
    await storage.upload('unidentified', 'x.jpg', Buffer.from('a'))

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/photos/unidentified/x.jpg'
    })

    expect(response.statusCode).toBe(200)
    expect(existsSync(join(photosDir, 'unidentified', 'x.jpg'))).toBe(false)

    await app.close()
  })

  test('missing person on rename returns 404', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/photos/persons/Ghost',
      payload: { name: 'Bryan' }
    })

    expect(response.statusCode).toBe(404)

    await app.close()
  })

  test('A-01: creating the owner name (USER_NAME) is rejected with 403', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/admin/photos/persons',
      payload: { name: 'Ana' }
    })

    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: true })

    await app.close()
  })

  test('A-01: renaming another person onto the owner name is rejected with 403', async () => {
    const app = await buildApp()
    await storage.createFolder('Bryan')

    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/photos/persons/Bryan',
      payload: { name: 'Ana' }
    })

    expect(res.statusCode).toBe(403)
    expect(existsSync(join(photosDir, 'Bryan'))).toBe(true)

    await app.close()
  })

  test('A-02: deleting a photo named "." or ".." is rejected without a 500', async () => {
    const app = await buildApp()
    await storage.createFolder('Bryan')

    for (const filename of ['.', '..']) {
      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/photos/persons/Bryan/photos/${filename}`
      })

      // The router rejects these as a route param (404) before the handler
      // runs, so no filesystem operation (EISDIR) and no 500. The schema
      // refine is defense-in-depth in case a caller reaches the handler.
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      expect(res.statusCode).toBeLessThan(500)
      expect(res.json()).toMatchObject({ error: true })
    }

    await app.close()
  })
})
