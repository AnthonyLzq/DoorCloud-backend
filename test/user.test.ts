import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
  getUserByUserID: vi.fn(),
  getAllFilesFromBucket: vi.fn(),
  getPhotosUrls: vi.fn(),
  uploadUserPhoto: vi.fn(),
  updateUserLastMessage: vi.fn(),
  sayHelloThroughWhatsapp: vi.fn(),
  sendPhotoDetectionResultThroughWhatsapp: vi.fn(),
  verify: vi.fn(),
  appendFileSync: vi.fn()
}))

vi.mock('../src/config/env', () => ({
  getEnv: mocks.getEnv
}))
vi.mock('../src/database', () => ({
  getUserByUserID: mocks.getUserByUserID,
  getAllFilesFromBucket: mocks.getAllFilesFromBucket,
  getPhotosUrls: mocks.getPhotosUrls,
  uploadUserPhoto: mocks.uploadUserPhoto,
  updateUserLastMessage: mocks.updateUserLastMessage
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
vi.mock('node:fs', () => ({
  appendFileSync: mocks.appendFileSync
}))
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

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getEnv.mockReturnValue({
    FACE_VERIFY_THRESHOLD: 0.37
  })
  mocks.verify.mockResolvedValue({
    match: false,
    reason: 'no-match'
  })
  mocks.getUserByUserID.mockResolvedValue([
    { id: 1, name: 'John', phone: '51999999999', lastMessage: null }
  ])
  mocks.getAllFilesFromBucket.mockResolvedValue([{ name: 'selfie-abc123.jpg' }])
  mocks.getPhotosUrls.mockResolvedValue([
    'https://example.com/John-1/selfie-abc123.jpg'
  ])
  mocks.uploadUserPhoto.mockResolvedValue({
    data: { path: 'John-1/2026-01-01T00:00:00.000Z-uuid.jpg' }
  })
})

describe('UserServices.sendPhotoThroughWhatsapp (RF-6)', () => {
  it('routes photos through FaceRecognitionService.verify', async () => {
    const { UserServices } = await import('../src/services/index.js')
    us = new UserServices(logMock as never)

    await us.sendPhotoThroughWhatsapp('1', 'jpg', Buffer.from('photo'))

    expect(mocks.verify).toHaveBeenCalledTimes(1)
    expect(mocks.verify).toHaveBeenCalledWith(
      Buffer.from('photo'),
      [{ name: 'selfie', url: 'https://example.com/John-1/selfie-abc123.jpg' }],
      { threshold: 0.37 }
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
    us = new UserServices(logMock as never)

    await us.sendPhotoThroughWhatsapp('1', 'jpg', Buffer.from('photo'))

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
    us = new UserServices(logMock as never)

    await us.sendPhotoThroughWhatsapp('1', 'jpg', Buffer.from('photo'))

    expect(mocks.sendPhotoDetectionResultThroughWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    )
    expect(mocks.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('matchPhoto.csv'),
      '\n0,1',
      'utf-8'
    )
  })
})
