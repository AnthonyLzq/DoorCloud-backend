import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

// CD-12 supply-chain pin: sha256 of buffalo_s.zip as served from the
// configured CDN (GitHub release v0.7,
// https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip).
// Computed Aug 2026 from the live artifact (127,607,557 bytes). The bash
// downloader (download-models.sh) hardcodes the same value; keep both in sync.
export const BUFFALO_S_SHA256 =
  'd85a87f503f691807cd8bb97128bdf7a0660326cd9cd02657127fa978bab8b5e'

/**
 * Computes the sha256 digest of a file's bytes.
 *
 * @param filePath - Absolute or relative path of the file to hash
 * @returns Lower-case hex sha256 digest
 */
export const computeSha256 = async (filePath: string): Promise<string> => {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}

/**
 * Verifies a file against an expected sha256 digest.
 *
 * Throws when the digests differ. Callers MUST invoke this before extraction
 * so a tampered or truncated artifact never reaches the unzip boundary.
 *
 * @param filePath - Path of the downloaded artifact
 * @param expectedSha256 - Pinned digest the artifact must match
 */
export const verifySha256 = async (
  filePath: string,
  expectedSha256: string
): Promise<void> => {
  const actual = await computeSha256(filePath)
  if (actual !== expectedSha256) {
    throw new Error(
      `sha256 mismatch for ${filePath}: expected ${expectedSha256}, got ${actual}`
    )
  }
}