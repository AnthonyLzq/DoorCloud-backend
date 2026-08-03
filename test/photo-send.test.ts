import { writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { sendPhoto } from '../scripts/photo-send'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'doorcloud-photo-send-'))
})

afterEach(() => {
  rmSync(tmpDir, { force: true, recursive: true })
  vi.unstubAllGlobals()
})

describe('sendPhoto', () => {
  test('dry-run builds a base64 data-URL payload without connecting', async () => {
    const filePath = join(tmpDir, 'selfie.jpg')
    writeFileSync(filePath, 'photo-bytes')

    const result = await sendPhoto(filePath, { dryRun: true })

    expect(result.published).toBe(false)
    expect(result.topic).toBe('doorcloud/v1/photo/send')
    expect(result.payload).toEqual({
      format: 'jpeg',
      photo: 'data:image/jpeg;base64,cGhvdG8tYnl0ZXM='
    })
  })

  test('maps common extensions to the payload format', async () => {
    const pngPath = join(tmpDir, 'selfie.png')
    writeFileSync(pngPath, 'png-bytes')

    const webpPath = join(tmpDir, 'selfie.webp')
    writeFileSync(webpPath, 'webp-bytes')

    const jpgPath = join(tmpDir, 'selfie.jpg')
    writeFileSync(jpgPath, 'jpg-bytes')

    const [png, webp, jpg] = await Promise.all([
      sendPhoto(pngPath, { dryRun: true }),
      sendPhoto(webpPath, { dryRun: true }),
      sendPhoto(jpgPath, { dryRun: true })
    ])

    expect(png.payload.format).toBe('png')
    expect(webp.payload.format).toBe('webp')
    expect(jpg.payload.format).toBe('jpeg')
  })

  test('rejects unsupported extensions', async () => {
    const filePath = join(tmpDir, 'notes.txt')
    writeFileSync(filePath, 'not a photo')

    await expect(sendPhoto(filePath, { dryRun: true })).rejects.toThrow(
      'Unsupported image source'
    )
  })

  test('rejects a missing local file', async () => {
    await expect(
      sendPhoto(join(tmpDir, 'missing.jpg'), { dryRun: true })
    ).rejects.toThrow()
  })

  test('fetches an http URL and builds the payload in dry-run', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('url-photo').buffer
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendPhoto('https://example.com/selfie.jpg', {
      dryRun: true
    })

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/selfie.jpg')
    expect(result.published).toBe(false)
    expect(result.payload.photo).toBe('data:image/jpeg;base64,dXJsLXBob3Rv')
  })
})
