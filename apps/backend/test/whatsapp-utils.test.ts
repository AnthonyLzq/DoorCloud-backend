import { writeFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendWhatsappImage: vi.fn(),
  sendWhatsappText: vi.fn(),
  requestOpenWa: vi.fn()
}))

vi.mock('../src/integrations/whatsapp/openwa', () => ({
  sendWhatsappImage: mocks.sendWhatsappImage,
  sendWhatsappText: mocks.sendWhatsappText,
  requestOpenWa: mocks.requestOpenWa
}))

vi.mock('../src/config/env', () => ({
  getEnv: vi.fn(() => ({
    NODE_ENV: 'development',
    OPENWA_ALLOWED_HOSTS: ['localhost']
  }))
}))

vi.mock('../src/config/paths', () => ({
  getEnvFilePath: vi.fn(() => '/tmp/doorcloud-whatsapp-test/.env')
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()

  return { ...actual, writeFileSync: vi.fn() }
})

import { getEnv } from '../src/config/env'
import { saveOpenWaSetupConfig } from '../src/integrations/whatsapp/setup'
import { sendPhotoDetectionResultThroughWhatsapp } from '../src/integrations/whatsapp/utils'

const mockGetEnv = getEnv as ReturnType<typeof vi.fn>

const THRESHOLD = 0.3435

describe('sendPhotoDetectionResultThroughWhatsapp', () => {
  beforeEach(() => {
    mocks.sendWhatsappImage.mockReset()
    mocks.sendWhatsappText.mockReset()
  })

  it('says the visitor is here on a confident match', async () => {
    await sendPhotoDetectionResultThroughWhatsapp({
      imageUrl: 'http://localhost:1996/photos/x.png',
      success: true,
      name: 'Ana',
      similarity: 0.81,
      threshold: THRESHOLD
    })

    expect(mocks.sendWhatsappImage).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'Hey, Ana is here!' })
    )
  })

  it('hedges with "I think" on a near-threshold match', async () => {
    await sendPhotoDetectionResultThroughWhatsapp({
      imageUrl: 'http://localhost:1996/photos/x.png',
      success: true,
      name: 'Ana',
      similarity: THRESHOLD + 0.01,
      threshold: THRESHOLD
    })

    expect(mocks.sendWhatsappImage).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: 'Hey, I think Ana is here, check it out!'
      })
    )
  })

  it('treats a missing similarity as a confident match', async () => {
    await sendPhotoDetectionResultThroughWhatsapp({
      imageUrl: 'http://localhost:1996/photos/x.png',
      success: true,
      name: 'Ana',
      threshold: THRESHOLD
    })

    expect(mocks.sendWhatsappImage).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'Hey, Ana is here!' })
    )
  })

  it('announces an unknown visitor when there is no match', async () => {
    await sendPhotoDetectionResultThroughWhatsapp({
      imageUrl: 'http://localhost:1996/photos/x.png',
      success: false,
      threshold: THRESHOLD
    })

    expect(mocks.sendWhatsappImage).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: 'Hey, I do not know who this is, but he/she is at your door.'
      })
    )
  })
})

describe('SECRET-2: saveOpenWaSetupConfig write gating', () => {
  const config = {
    OPENWA_API_KEY: 'key',
    OPENWA_BASE_URL: 'http://localhost:2785'
  }

  it('does not write the env file in production', () => {
    mockGetEnv.mockReturnValue({ NODE_ENV: 'production' })

    const result = saveOpenWaSetupConfig(config)

    expect(writeFileSync).not.toHaveBeenCalled()
    expect(result).toEqual({ saved: [] })
  })

  it('keeps writing the env file in development', () => {
    mockGetEnv.mockReturnValue({ NODE_ENV: 'development' })

    const result = saveOpenWaSetupConfig(config)

    expect(writeFileSync).toHaveBeenCalled()
    expect(result.saved).toContain('OPENWA_API_KEY')
  })
})
