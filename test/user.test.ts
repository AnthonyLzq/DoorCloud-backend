import multipart from '@fastify/multipart'
import { fromPartial } from '@total-typescript/shoehorn'
import Fastify from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from 'fastify-type-provider-zod'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_VERIFY_THRESHOLD,
  MAX_STORED_PHOTOS
} from '../src/config/constants'

const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
  getActiveUser: vi.fn(),
  uploadPhoto: vi.fn(),
  listPhotos: vi.fn(),
  getPhotoUrl: vi.fn(),
  getLastMessage: vi.fn(),
  setLastMessage: vi.fn(),
  sayHelloThroughWhatsapp: vi.fn(),
  sendPhotoDetectionResultThroughWhatsapp: vi.fn(),
  verify: vi.fn(),
  appendFileSync: vi.fn()
}))

vi.mock('../src/config/env', () => ({
  getEnv: mocks.getEnv
}))
vi.mock('../src/config/user', () => ({
  getActiveUser: mocks.getActiveUser
}))
vi.mock('../src/storage/photos', () => ({
  DiskPhotoStorage: class MockDiskPhotoStorage {
    upload = mocks.uploadPhoto
    list = mocks.listPhotos
    getUrl = mocks.getPhotoUrl
  }
}))
vi.mock('../src/storage/state', () => ({
  getUserState: () => ({
    getLastMessage: mocks.getLastMessage,
    setLastMessage: mocks.setLastMessage
  }),
  UserState: class MockUserState {
    getLastMessage = mocks.getLastMessage
    setLastMessage = mocks.setLastMessage
    close = vi.fn()
  }
}))
vi.mock('../src/integrations', () => ({
  sayHelloThroughWhatsapp: mocks.sayHelloThroughWhatsapp,
  sendPhotoDetectionResultThroughWhatsapp:
    mocks.sendPhotoDetectionResultThroughWhatsapp
}))
vi.mock('../src/services/face-recognition', () => ({
  faceRecognitionService: {
    verify: mocks.verify
  }
}))
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')

  return {
    ...actual,
    appendFileSync: mocks.appendFileSync
  }
})
vi.mock('../src/utils', () => ({
  diffTimeInSeconds: vi.fn(() => 1),
  getTimestamp: vi.fn(() => '2026-01-01T00:00:00.000Z'),
  randomWait: vi.fn()
}))

import type { UserServices } from '../src/services/index.js'

let us: InstanceType<typeof UserServices>

const logMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

const buildMultipartBody = (
  fieldName: string,
  filename: string
): { body: string; contentType: string } => {
  const boundary = '----doorcloud-test'
  const parts = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`,
    'Content-Type: image/jpeg\r\n',
    '\r\n',
    'photo-bytes',
    `\r\n--${boundary}--\r\n`
  ]

  return {
    body: parts.join(''),
    contentType: `multipart/form-data; boundary=${boundary}`
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getEnv.mockReturnValue({
    FACE_VERIFY_THRESHOLD: DEFAULT_VERIFY_THRESHOLD,
    FACE_VERIFY_MAX_PHOTOS: MAX_STORED_PHOTOS,
    PHOTOS_DIR: '/tmp/doorcloud-photos',
    PHOTOS_BASE_URL: 'https://example.com/photos',
    PHOTOS_URL_SECRET: 'test-photo-url-secret',
    PHOTO_URL_TTL_MS: 300_000,
    STATE_DB_PATH: '/tmp/doorcloud-state/app-state.db'
  })
  mocks.getActiveUser.mockReturnValue({
    id: '1',
    name: 'John',
    phone: '51999999999'
  })
  mocks.verify.mockResolvedValue({
    match: false,
    reason: 'no-match'
  })
  mocks.listPhotos.mockResolvedValue(['selfie-abc123.jpg'])
  mocks.getPhotoUrl.mockImplementation(
    (path: string) => `https://example.com/photos/${path}`
  )
  mocks.uploadPhoto.mockResolvedValue(
    'John-1/2026-01-01T00:00:00.000Z-uuid.jpg'
  )
  mocks.getLastMessage.mockReturnValue(new Date(Date.now() - 2 * 36e5))
})

describe('UserServices.sendPhotoThroughWhatsapp (RF-2, RF-7)', () => {
  it('routes photos through FaceRecognitionService.verify with static URLs', async () => {
    const { UserServices } = await import('../src/services/index.js')
    us = new UserServices(fromPartial(logMock))

    await us.sendPhotoThroughWhatsapp('jpg', Buffer.from('photo'))

    expect(mocks.verify).toHaveBeenCalledTimes(1)
    expect(mocks.verify).toHaveBeenCalledWith(
      Buffer.from('photo'),
      [
        {
          name: 'selfie',
          url: 'https://example.com/photos/John-1/selfie-abc123.jpg'
        }
      ],
      { threshold: DEFAULT_VERIFY_THRESHOLD, maxPhotos: MAX_STORED_PHOTOS }
    )
  })

  it('passes only non-numeric-prefix photos from local storage to verify', async () => {
    mocks.listPhotos.mockResolvedValue(['selfie-abc123.jpg'])
    const { UserServices } = await import('../src/services/index.js')
    us = new UserServices(fromPartial(logMock))

    await us.sendPhotoThroughWhatsapp('jpg', Buffer.from('photo'))

    expect(mocks.verify).toHaveBeenCalledWith(
      Buffer.from('photo'),
      [
        {
          name: 'selfie',
          url: 'https://example.com/photos/John-1/selfie-abc123.jpg'
        }
      ],
      { threshold: DEFAULT_VERIFY_THRESHOLD, maxPhotos: MAX_STORED_PHOTOS }
    )
  })

  it('keeps the WhatsApp and CSV contract when a photo matches', async () => {
    mocks.verify.mockResolvedValue({
      match: true,
      name: 'selfie',
      similarity: 0.81,
      reason: 'match'
    })
    const { UserServices } = await import('../src/services/index.js')
    us = new UserServices(fromPartial(logMock))

    await us.sendPhotoThroughWhatsapp('jpg', Buffer.from('photo'))

    expect(mocks.sendPhotoDetectionResultThroughWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, name: 'selfie' })
    )
    expect(mocks.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('matchPhoto.csv'),
      '\n1,1',
      'utf-8'
    )
  })

  it('keeps the WhatsApp and CSV contract when no face is detected', async () => {
    mocks.verify.mockResolvedValue({ match: false, reason: 'no-face' })
    const { UserServices } = await import('../src/services/index.js')
    us = new UserServices(fromPartial(logMock))

    await us.sendPhotoThroughWhatsapp('jpg', Buffer.from('photo'))

    expect(mocks.sendPhotoDetectionResultThroughWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    )
    expect(mocks.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('matchPhoto.csv'),
      '\n0,1',
      'utf-8'
    )
  })

  it('writes a no-match photo locally with a timestamp-uuid name and sends its URL', async () => {
    const { UserServices } = await import('../src/services/index.js')
    us = new UserServices(fromPartial(logMock))

    await us.sendPhotoThroughWhatsapp('jpg', Buffer.from('photo'))

    expect(mocks.uploadPhoto).toHaveBeenCalledWith(
      'John-1',
      expect.stringMatching(/^2026-01-01T00:00:00\.000Z-[0-9a-f-]{36}\.jpg$/),
      Buffer.from('photo')
    )
    expect(mocks.sendPhotoDetectionResultThroughWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl:
          'https://example.com/photos/John-1/2026-01-01T00:00:00.000Z-uuid.jpg',
        success: false
      })
    )
  })

  it('greets when there is no stored last message', async () => {
    mocks.getLastMessage.mockReturnValue(null)
    const { UserServices } = await import('../src/services/index.js')
    us = new UserServices(fromPartial(logMock))

    await us.sendPhotoThroughWhatsapp('jpg', Buffer.from('photo'))

    expect(mocks.sayHelloThroughWhatsapp).toHaveBeenCalledWith(
      'John',
      '51999999999',
      expect.anything()
    )
    expect(mocks.setLastMessage).toHaveBeenCalledWith('1', expect.any(Date))
  })

  it('greets again when the last message is older than 16 hours', async () => {
    mocks.getLastMessage.mockReturnValue(new Date(Date.now() - 20 * 36e5))
    const { UserServices } = await import('../src/services/index.js')
    us = new UserServices(fromPartial(logMock))

    await us.sendPhotoThroughWhatsapp('jpg', Buffer.from('photo'))

    expect(mocks.sayHelloThroughWhatsapp).toHaveBeenCalledTimes(1)
    expect(mocks.setLastMessage).toHaveBeenCalledWith('1', expect.any(Date))
  })

  it('does not greet when the last message is within 16 hours', async () => {
    const { UserServices } = await import('../src/services/index.js')
    us = new UserServices(fromPartial(logMock))

    await us.sendPhotoThroughWhatsapp('jpg', Buffer.from('photo'))

    expect(mocks.sayHelloThroughWhatsapp).not.toHaveBeenCalled()
    expect(mocks.setLastMessage).not.toHaveBeenCalled()
  })
})

describe('User HTTP routes (RF-3)', () => {
  const buildApp = async () => {
    const app = Fastify().withTypeProvider<ZodTypeProvider>()
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    await app.register(multipart, {
      limits: {
        fields: 3,
        files: 3
      }
    })
    const { User } = await import('../src/network/http/routes/user.js')
    await User(app)

    return app
  }

  it('returns 404 for POST /api/user (create route removed)', async () => {
    const app = await buildApp()

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/user',
        payload: { name: 'Ana', phone: '51999999999' }
      })

      expect(res.statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })

  it('keeps POST /api/user/:folderID/upload validating and uploading', async () => {
    const app = await buildApp()
    const { body, contentType } = buildMultipartBody('selfie', 'selfie.jpg')

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/user/John-1/upload',
        headers: { 'content-type': contentType },
        payload: body
      })

      expect(res.statusCode).toBe(200)
      expect(mocks.uploadPhoto).toHaveBeenCalledWith(
        'John-1',
        expect.stringMatching(/^selfie-[0-9a-f-]{36}\.jpeg$/),
        expect.any(Buffer)
      )
    } finally {
      await app.close()
    }
  })

  it('rejects an upload with a non-numeric userID', async () => {
    const app = await buildApp()
    const { body, contentType } = buildMultipartBody('selfie', 'selfie.jpg')

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/user/John-abc/upload',
        headers: { 'content-type': contentType },
        payload: body
      })

      expect(res.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })
})
