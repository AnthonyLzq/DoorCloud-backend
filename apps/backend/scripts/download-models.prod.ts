import { spawnSync } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import {
  BUFFALO_S_SHA256,
  computeSha256,
  verifySha256
} from './download-models.checksum'

export { BUFFALO_S_SHA256, computeSha256, verifySha256 }

const BUFFALO_S_URL =
  'https://github.com/deepinsight/insightface/releases/download/' +
  'v0.7/buffalo_s.zip'

// Script runs via `pnpm models:download:prod` from apps/backend, so CWD is
// apps/backend and models/ lands at apps/backend/models (same as the .sh).
const MODELS_DIR = resolve(process.cwd(), 'models')
const INSIGHTFACE_DIR = join(MODELS_DIR, 'insightface')

const REQUIRED_MODELS_PROD = [
  'det_500m.onnx',
  'w600k_mbf.onnx'
]

const allProdModelsInstalled = (): boolean =>
  REQUIRED_MODELS_PROD.every(file =>
    existsSync(join(INSIGHTFACE_DIR, file))
  )

const downloadModel = async (url: string, destFile: string): Promise<void> => {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url} (HTTP ${response.status})`)
  }
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      createWriteStream(destFile)
    )
  } catch (error) {
    rmSync(destFile, { force: true })
    throw error
  }
}

const extractZip = (zipFile: string, destDir: string): void => {
  mkdirSync(destDir, { recursive: true })
  const unzip = spawnSync('unzip', ['-q', zipFile, '-d', destDir])
  if (unzip.error || unzip.status !== 0) {
    console.log('  unzip not available, extracting with python3...')
    const python = spawnSync(
      'python3',
      ['-m', 'zipfile', '-e', zipFile, destDir],
      { stdio: 'inherit' }
    )
    if (python.error || python.status !== 0) {
      throw new Error(`Failed to extract ${zipFile}`)
    }
  }
}

/**
 * Downloads buffalo_s.zip, verifies its pinned sha256, then extracts it.
 *
 * CD-12: the checksum is verified BEFORE extraction; a mismatch removes the
 * artifact and aborts, so a tampered or truncated zip never reaches the
 * unzip/python subprocess boundary.
 *
 * @param zipFile - Destination path for the downloaded zip
 * @param destDir - Directory to extract into
 * @param expectedSha256 - Pinned digest (defaults to BUFFALO_S_SHA256)
 */
export const installBuffaloS = async (
  zipFile: string,
  destDir: string,
  expectedSha256: string = BUFFALO_S_SHA256
): Promise<void> => {
  console.log('Downloading buffalo_s (~128MB)...')
  await downloadModel(BUFFALO_S_URL, zipFile)
  console.log('Verifying buffalo_s sha256 (pinned)...')
  try {
    await verifySha256(zipFile, expectedSha256)
  } catch (error) {
    console.error(
      `[download-models] sha256 verification failed, removing ${zipFile}`
    )
    rmSync(zipFile, { force: true })
    throw error
  }
  console.log('Extracting buffalo_s...')
  extractZip(zipFile, destDir)
  rmSync(zipFile)
}

const main = async (): Promise<void> => {
  console.log('Downloading production ONNX models (door-verification set)...')
  mkdirSync(INSIGHTFACE_DIR, { recursive: true })

  if (allProdModelsInstalled()) {
    console.log('Both production models already exist, skipping download.')
    for (const file of REQUIRED_MODELS_PROD) {
      console.log(`  - ${join(INSIGHTFACE_DIR, file)}`)
    }
    return
  }

  const zipFile = join(INSIGHTFACE_DIR, 'buffalo_s.zip')
  await installBuffaloS(zipFile, INSIGHTFACE_DIR)

  console.log('')
  console.log('Production model set installed (~130MB):')
  for (const file of REQUIRED_MODELS_PROD) {
    console.log(`  - ${join(INSIGHTFACE_DIR, file)}`)
  }
  console.log(
    'This production set is used by the door-verification runtime.'
  )
}

// Only run the download flow when executed directly (`tsx
// download-models.prod.ts`); importing the module (tests, tooling) must not
// trigger a network download. tsx populates require.main for directly
// executed scripts even when the file runs as ESM, and the scripts dir is
// typechecked as CommonJS (module: Node16), so import.meta is off-limits.
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(error => {
    console.error('Failed to install production models:', error)
    process.exit(1)
  })
}