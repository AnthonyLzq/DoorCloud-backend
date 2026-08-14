import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReadableStream } from 'node:stream/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUFFALO_S_SHA256,
  computeSha256,
  installBuffaloS,
  verifySha256
} from '../scripts/download-models.prod'

// The extraction boundary is a subprocess (unzip/python3); keeping it mocked
// lets the tests assert that a bad checksum aborts BEFORE any extraction.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn()
}))

const FAKE_ZIP_BYTES = Buffer.from('fake-zip-bytes-for-download-test')

const webStreamOf = (bytes: Buffer): ReadableStream => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    }
  })
  return stream as ReadableStream
}

const sha256Of = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex')

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'doorcloud-download-'))
  vi.mocked(spawnSync).mockReset()
})

afterEach(() => {
  rmSync(tmpDir, { force: true, recursive: true })
  vi.unstubAllGlobals()
})

describe('model download checksum pin (CD-12)', () => {
  it('computes a known sha256 from real file bytes', async () => {
    const filePath = join(tmpDir, 'payload.bin')
    writeFileSync(filePath, Buffer.from('hello'))

    await expect(computeSha256(filePath)).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    )
  })

  it('rejects a checksum mismatch before any extraction (CD-12 scenario 2)', async () => {
    const zipPath = join(tmpDir, 'buffalo_s.zip')
    writeFileSync(zipPath, FAKE_ZIP_BYTES)

    await expect(
      verifySha256(zipPath, '0'.repeat(64))
    ).rejects.toThrow(/sha256 mismatch/)
    // The mismatch must abort before the unzip/python subprocess boundary.
    expect(vi.mocked(spawnSync)).not.toHaveBeenCalled()
  })

  it('aborts the install flow on mismatch, removing the artifact (CD-12 scenario 2)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: webStreamOf(FAKE_ZIP_BYTES)
      })
    )
    const zipPath = join(tmpDir, 'buffalo_s.zip')
    const destDir = join(tmpDir, 'extracted')

    await expect(
      installBuffaloS(zipPath, destDir, '0'.repeat(64))
    ).rejects.toThrow(/sha256 mismatch/)

    // No extraction happened and the corrupt artifact was cleaned up.
    expect(existsSync(zipPath)).toBe(false)
    expect(existsSync(destDir)).toBe(false)
    expect(vi.mocked(spawnSync)).not.toHaveBeenCalled()
  })

  it('extracts only after a matching checksum (CD-12 scenario 1)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: webStreamOf(FAKE_ZIP_BYTES)
      })
    )
    vi.mocked(spawnSync).mockReturnValue({ status: 0, error: null } as never)
    const zipPath = join(tmpDir, 'buffalo_s.zip')
    const destDir = join(tmpDir, 'extracted')
    const expected = sha256Of(FAKE_ZIP_BYTES)

    await installBuffaloS(zipPath, destDir, expected)

    expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(
      'unzip',
      ['-q', zipPath, '-d', destDir]
    )
    expect(existsSync(destDir)).toBe(true)
    expect(existsSync(zipPath)).toBe(false)
  })

  it('pins the real buffalo_s sha256 and matches the artifact when present', async () => {
    expect(BUFFALO_S_SHA256).toMatch(/^[0-9a-f]{64}$/)

    // When a real downloaded copy exists locally (dev/CI with datasets), the
    // pinned constant must match it; hermetic CI without the artifact skips
    // the file comparison but still checks the 64-hex format above.
    const localZip = join('models', 'insightface', 'buffalo_s.zip')
    if (existsSync(localZip)) {
      await expect(computeSha256(localZip)).resolves.toBe(BUFFALO_S_SHA256)
    }
  })
})