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
  console.log('Downloading buffalo_s (~128MB)...')
  await downloadModel(BUFFALO_S_URL, zipFile)
  console.log('Extracting buffalo_s...')
  extractZip(zipFile, INSIGHTFACE_DIR)
  rmSync(zipFile)

  console.log('')
  console.log('Production model set installed (~130MB):')
  for (const file of REQUIRED_MODELS_PROD) {
    console.log(`  - ${join(INSIGHTFACE_DIR, file)}`)
  }
  console.log(
    'This production set is used by the door-verification runtime.'
  )
}

main().catch(error => {
  console.error('Failed to install production models:', error)
  process.exit(1)
})