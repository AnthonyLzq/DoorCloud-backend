import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { DiskPhotoStorage } from '../src/storage/photos'

let photosDir: string
let storage: DiskPhotoStorage

beforeEach(() => {
  photosDir = mkdtempSync(join(tmpdir(), 'doorcloud-admin-photos-'))
  storage = new DiskPhotoStorage({
    photosDir,
    baseUrl: 'http://localhost:1996/photos',
    urlSecret: 'test-photo-url-secret',
    urlTtlMs: 300_000
  })
})

afterEach(() => {
  rmSync(photosDir, { force: true, recursive: true })
})

describe('DiskPhotoStorage admin primitives (RF-8..11)', () => {
  describe('createFolder / renameFolder / deleteFolder', () => {
    test('createFolder makes a person folder under PHOTOS_DIR', async () => {
      await storage.createFolder('Bryan Ramos')

      expect(existsSync(join(photosDir, 'Bryan Ramos'))).toBe(true)
    })

    test('renameFolder moves the folder and preserves its photos', async () => {
      await storage.upload('Bryan', 'selfie.jpg', Buffer.from('photo'))
      await storage.renameFolder('Bryan', 'Bryan2')

      expect(existsSync(join(photosDir, 'Bryan'))).toBe(false)
      expect(existsSync(join(photosDir, 'Bryan2', 'selfie.jpg'))).toBe(true)
    })

    test('deleteFolder removes the whole subtree recursively', async () => {
      await storage.upload('Bryan', 'selfie.jpg', Buffer.from('photo'))
      await storage.upload('Bryan', 'nested/other.jpg', Buffer.from('x'))

      await storage.deleteFolder('Bryan')

      expect(existsSync(join(photosDir, 'Bryan'))).toBe(false)
    })

    test('createFolder rejects a reserved unidentified name', async () => {
      await expect(storage.createFolder('unidentified')).rejects.toThrow(
        /unidentified/i
      )
    })
  })

  describe('deletePhoto / movePhoto', () => {
    test('deletePhoto removes a single photo', async () => {
      await storage.upload('Bryan', 'keep.jpg', Buffer.from('a'))
      await storage.upload('Bryan', 'drop.jpg', Buffer.from('b'))

      await storage.deletePhoto('Bryan', 'drop.jpg')

      expect(existsSync(join(photosDir, 'Bryan', 'drop.jpg'))).toBe(false)
      expect(existsSync(join(photosDir, 'Bryan', 'keep.jpg'))).toBe(true)
    })

    test('movePhoto relocates the file, never leaving a copy behind', async () => {
      await storage.upload('unidentified', 'x.jpg', Buffer.from('photo'))
      await storage.createFolder('Bryan')

      const relativePath = await storage.movePhoto(
        'unidentified',
        'x.jpg',
        'Bryan'
      )

      expect(relativePath).toBe('Bryan/x.jpg')
      expect(existsSync(join(photosDir, 'Bryan', 'x.jpg'))).toBe(true)
      expect(existsSync(join(photosDir, 'unidentified', 'x.jpg'))).toBe(false)
    })
  })

  describe('listUnidentified', () => {
    test('lists raw files including numeric prefixes, hiding only .tmp- files', async () => {
      await storage.upload('unidentified', '1785597387029-nomatch.jpg', Buffer.from('a'))
      await storage.upload('unidentified', 'selfie-b.jpg', Buffer.from('b'))
      await storage.upload('unidentified', 'selfie.tmp-orphan.jpg', Buffer.from('c'))

      const files = await storage.listUnidentified()

      expect(files).toEqual(
        expect.arrayContaining([
          '1785597387029-nomatch.jpg',
          'selfie-b.jpg'
        ])
      )
      expect(files).not.toContain('selfie.tmp-orphan.jpg')
    })

    test('returns an empty list when the unidentified folder does not exist', async () => {
      expect(await storage.listUnidentified()).toEqual([])
    })
  })

  describe('listDirectories tray exclusion (RF-8)', () => {
    test('never exposes the unidentified folder as a known person', async () => {
      await storage.upload('unidentified', 'x.jpg', Buffer.from('a'))
      await storage.upload('Bryan', 'selfie.jpg', Buffer.from('b'))

      const directories = await storage.listDirectories()

      expect(directories).toEqual(['Bryan'])
    })
  })

  describe('containment guarantee (RF-11)', () => {
    test('rejects traversal in every new primitive', async () => {
      await expect(storage.createFolder('../escape')).rejects.toThrow()
      await expect(storage.createFolder('/etc/escape')).rejects.toThrow()
      await expect(
        storage.renameFolder('Bryan', '../escape')
      ).rejects.toThrow()
      await expect(storage.deleteFolder('../escape')).rejects.toThrow()
      await expect(
        storage.deletePhoto('Bryan', '../../secret.txt')
      ).rejects.toThrow()
      await expect(
        storage.movePhoto('unidentified', 'x.jpg', '../escape')
      ).rejects.toThrow()
      await expect(
        storage.movePhoto('unidentified', '../x.jpg', 'Bryan')
      ).rejects.toThrow()
    })

    test('traversal attempts never create files outside PHOTOS_DIR', async () => {
      await expect(
        storage.upload('unidentified', '../../evil.jpg', Buffer.from('x'))
      ).rejects.toThrow()
      expect(
        readdirSync(join(tmpdir())).filter(name => name === 'evil.jpg')
      ).toEqual([])
    })
  })
})
