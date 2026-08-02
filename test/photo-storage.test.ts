import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { DiskPhotoStorage } from '../src/storage/photos'

let photosDir: string
let storage: DiskPhotoStorage

beforeEach(() => {
  photosDir = mkdtempSync(join(tmpdir(), 'doorcloud-photos-'))
  storage = new DiskPhotoStorage({
    photosDir,
    baseUrl: 'http://localhost:1996/photos',
    urlSecret: 'test-photo-url-secret'
  })
})

afterEach(() => {
  rmSync(photosDir, { force: true, recursive: true })
})

describe('DiskPhotoStorage', () => {
  describe('upload', () => {
    test('writes a file under {name}-{id}/{fieldname}-{uuid}.{ext}', async () => {
      const relativePath = await storage.upload(
        'Ana-42',
        'selfie-123e4567-e89b-12d3-a456-426614174000.jpg',
        Buffer.from('photo-bytes')
      )

      expect(relativePath).toBe(
        'Ana-42/selfie-123e4567-e89b-12d3-a456-426614174000.jpg'
      )
      expect(
        existsSync(
          join(
            photosDir,
            'Ana-42/selfie-123e4567-e89b-12d3-a456-426614174000.jpg'
          )
        )
      ).toBe(true)
    })

    test('rejects paths that escape PHOTOS_DIR via ../', async () => {
      await expect(
        storage.upload('../evil', 'selfie.jpg', Buffer.from('x'))
      ).rejects.toThrow()

      await expect(
        storage.upload('Ana-42', '../../evil.jpg', Buffer.from('x'))
      ).rejects.toThrow()
    })
  })

  describe('list', () => {
    test('returns file names under the user folder', async () => {
      mkdirSync(join(photosDir, 'Ana-42'), { recursive: true })
      writeFileSync(join(photosDir, 'Ana-42/selfie-a.jpg'), 'a')
      writeFileSync(join(photosDir, 'Ana-42/selfie-b.jpg'), 'b')

      const files = await storage.list('Ana-42')

      expect(files).toEqual(
        expect.arrayContaining(['selfie-a.jpg', 'selfie-b.jpg'])
      )
      expect(files).toHaveLength(2)
    })

    test('excludes numeric-prefix no-match files', async () => {
      mkdirSync(join(photosDir, 'Ana-42'), { recursive: true })
      writeFileSync(join(photosDir, 'Ana-42/1785597387029-nomatch.jpg'), 'a')
      writeFileSync(join(photosDir, 'Ana-42/selfie-a.jpg'), 'b')

      const files = await storage.list('Ana-42')

      expect(files).toEqual(['selfie-a.jpg'])
    })

    test('returns an empty list when the user folder does not exist yet', async () => {
      expect(await storage.list('Ana-42')).toEqual([])
    })
  })

  describe('getUrl', () => {
    test('builds a signed URL and validates expiry and signature', () => {
      const m = storage.getUrl('Ana-42/selfie.jpg').match(/\/photos\/([a-f0-9]{64})\/(\d+)\/(.+)$/)!

      expect(m[3]).toBe('Ana-42/selfie.jpg')
      expect(storage.isUrlValid(m[3], m[1], Number(m[2]))).toBe(true)
      expect(storage.isUrlValid(m[3], 'f'.repeat(64), Number(m[2]))).toBe(false)
      expect(storage.isUrlValid(m[3], m[1], Number(m[2]) - 60_000)).toBe(false)
    })
  })
})
