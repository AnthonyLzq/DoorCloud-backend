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

import { migrateLegacyUnidentified } from '../src/storage/migrations'
import { DiskPhotoStorage } from '../src/storage/photos'

let photosDir: string
let storage: DiskPhotoStorage

beforeEach(() => {
  photosDir = mkdtempSync(join(tmpdir(), 'doorcloud-migration-'))
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

describe('migrateLegacyUnidentified', () => {
  test('moves /^\\d/ prefixed image files from person folders to the tray', async () => {
    const legacy = '1785597387029-nomatch.jpg'
    const kept = 'selfie.jpg'

    mkdirSync(join(photosDir, 'Bryan'))
    writeFileSync(join(photosDir, 'Bryan', legacy), 'photo')
    writeFileSync(join(photosDir, 'Bryan', kept), 'photo')

    const moved = await migrateLegacyUnidentified(storage)

    expect(moved).toBe(1)
    expect(existsSync(join(photosDir, 'Bryan', legacy))).toBe(false)
    expect(existsSync(join(photosDir, 'unidentified', legacy))).toBe(true)
    expect(existsSync(join(photosDir, 'Bryan', kept))).toBe(true)
  })

  test('ignores non-numeric and non-image files', async () => {
    mkdirSync(join(photosDir, 'Henry'))
    writeFileSync(join(photosDir, 'Henry', '1234-notes.txt'), 'notes')
    writeFileSync(join(photosDir, 'Henry', 'notes-1234.jpg'), 'photo')

    const moved = await migrateLegacyUnidentified(storage)

    expect(moved).toBe(0)
    expect(existsSync(join(photosDir, 'Henry', '1234-notes.txt'))).toBe(true)
    expect(existsSync(join(photosDir, 'Henry', 'notes-1234.jpg'))).toBe(true)
  })

  test('is idempotent: a second run moves nothing', async () => {
    mkdirSync(join(photosDir, 'Bryan'))
    writeFileSync(join(photosDir, 'Bryan', '1785597387029-old.png'), 'photo')

    const first = await migrateLegacyUnidentified(storage)
    const second = await migrateLegacyUnidentified(storage)

    expect(first).toBe(1)
    expect(second).toBe(0)
    expect(readdirSync(join(photosDir, 'unidentified'))).toHaveLength(1)
  })

  test('is a no-op when there are no known persons', async () => {
    const moved = await migrateLegacyUnidentified(storage)

    expect(moved).toBe(0)
  })
})
