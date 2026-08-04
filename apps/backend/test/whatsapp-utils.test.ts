import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendWhatsappImage: vi.fn(),
  sendWhatsappText: vi.fn()
}))

vi.mock('../src/integrations/whatsapp/openwa', () => ({
  sendWhatsappImage: mocks.sendWhatsappImage,
  sendWhatsappText: mocks.sendWhatsappText
}))

import { sendPhotoDetectionResultThroughWhatsapp } from '../src/integrations/whatsapp/utils'

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
