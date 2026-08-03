import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { setupPhotos } from '../scripts/photos-setup'

let sourceDir: string
let targetDir: string

beforeEach(() => {
  sourceDir = mkdtempSync(join(tmpdir(), 'doorcloud-setup-src-'))
  targetDir = mkdtempSync(join(tmpdir(), 'doorcloud-setup-dst-'))
})

afterEach(() => {
  rmSync(sourceDir, { force: true, recursive: true })
  rmSync(targetDir, { force: true, recursive: true })
  vi.unstubAllGlobals()
})

describe('setupPhotos', () => {
  test('copies image files from the source into the target folder', async () => {
    writeFileSync(join(sourceDir, 'selfie-a.jpg'), 'a')
    writeFileSync(join(sourceDir, 'selfie-b.png'), 'b')
    writeFileSync(join(sourceDir, 'notes.txt'), 'not a photo')

    const summary = await setupPhotos(sourceDir, targetDir)

    expect(summary.files).toEqual(['selfie-a.jpg', 'selfie-b.png'])
    expect(readFileSync(join(targetDir, 'selfie-a.jpg'), 'utf8')).toBe('a')
    expect(readFileSync(join(targetDir, 'selfie-b.png'), 'utf8')).toBe('b')
    expect(existsSync(join(targetDir, 'notes.txt'))).toBe(false)
  })

  test('skips names that list() would exclude and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    writeFileSync(join(sourceDir, '1785597387029-nomatch.jpg'), 'a')
    writeFileSync(join(sourceDir, 'selfie.tmp-1234.jpg'), 'b')
    writeFileSync(join(sourceDir, 'selfie.jpg'), 'c')

    const summary = await setupPhotos(sourceDir, targetDir)

    expect(summary.files).toEqual(['selfie.jpg'])
    expect(existsSync(join(targetDir, '1785597387029-nomatch.jpg'))).toBe(false)
    expect(existsSync(join(targetDir, 'selfie.tmp-1234.jpg'))).toBe(false)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  test('throws when the source folder does not exist', async () => {
    await expect(
      setupPhotos(join(sourceDir, 'missing'), targetDir)
    ).rejects.toThrow('does not exist')
  })

  test('dry-run reports files without writing anything', async () => {
    writeFileSync(join(sourceDir, 'selfie.jpg'), 'a')

    const summary = await setupPhotos(sourceDir, targetDir, { dryRun: true })

    expect(summary.files).toEqual(['selfie.jpg'])
    expect(existsSync(join(targetDir, 'selfie.jpg'))).toBe(false)
  })
})
