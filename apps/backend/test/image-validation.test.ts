import { describe, expect, test } from 'vitest'
import { validateImage } from '../src/utils/image-validation'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP')
])
const gif = Buffer.from('GIF89a')

describe('validateImage (RF-12)', () => {
  test('detects JPEG and derives a jpeg extension', () => {
    expect(validateImage(jpeg, 'application/x-whatever')).toEqual({
      ext: 'jpeg',
      mimetype: 'image/jpeg'
    })
  })

  test('detects PNG', () => {
    expect(validateImage(png, '')).toEqual({ ext: 'png', mimetype: 'image/png' })
  })

  test('detects WebP', () => {
    expect(validateImage(webp, '')).toEqual({
      ext: 'webp',
      mimetype: 'image/webp'
    })
  })

  test('detects GIF', () => {
    expect(validateImage(gif, '')).toEqual({ ext: 'gif', mimetype: 'image/gif' })
  })

  test('rejects non-image content with status 415', () => {
    try {
      validateImage(Buffer.from('hello world'), 'image/jpeg')
      expect.unreachable()
    } catch (error) {
      expect((error as { statusCode: number }).statusCode).toBe(415)
    }
  })

  test('derives the extension from content, not the declared mimetype', () => {
    // Provider says GIF, but the real content is JPEG -> content wins
    expect(validateImage(jpeg, 'image/gif')).toEqual({
      ext: 'jpeg',
      mimetype: 'image/jpeg'
    })
  })
})
