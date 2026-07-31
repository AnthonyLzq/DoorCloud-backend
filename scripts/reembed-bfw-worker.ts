import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import {
  DETECTOR_MODEL_NAME,
  ONNXProvider,
  RECOGNITION_MODEL_NAME
} from '../src/services/face-recognition/onnx-provider'

const BFW_DATASET_ROOT = resolve(
  process.cwd(),
  'datasets/tmp/BFW-Release/bfw-faces-cropped/jrobby/bfw/bfw-cropped-aligned'
)
const OUTPUT_PATH = resolve(
  process.cwd(),
  'metrics/embeddings/insightface-buffalo-s-aligned.json'
)
const CANVAS_SIZE = 384

const DEMOGRAPHIC_GROUPS = [
  'asian_females',
  'asian_males',
  'black_females',
  'black_males',
  'indian_females',
  'indian_males',
  'white_females',
  'white_males'
]

function collectImages(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectImages(full, out)
    else if (entry.endsWith('.jpg')) out.push(full)
  }
}

/**
 * Centers a BFW crop inside a larger canvas
 *
 * BFW crops are tight 108x124 face crops; letterboxing them to the SCRFD
 * 640x640 input makes the face fill the whole frame and SCRFD misses it.
 * Placing the crop on a neutral canvas simulates a full photo with the face
 * at a realistic relative size, which the detector handles correctly.
 */
async function toCanvas(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const offsetX = Math.floor((CANVAS_SIZE - info.width) / 2)
  const offsetY = Math.floor((CANVAS_SIZE - info.height) / 2)
  const canvas = Buffer.alloc(CANVAS_SIZE * CANVAS_SIZE * 3, 128)

  for (let y = 0; y < info.height; y++) {
    data.copy(
      canvas,
      ((offsetY + y) * CANVAS_SIZE + offsetX) * 3,
      y * info.width * 3,
      (y + 1) * info.width * 3
    )
  }

  return sharp(canvas, {
    raw: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3 }
  })
    .jpeg()
    .toBuffer()
}

async function main(): Promise<void> {
  const provider = new ONNXProvider()
  await provider.loadModel(
    DETECTOR_MODEL_NAME,
    'models/insightface/det_500m.onnx',
    { name: DETECTOR_MODEL_NAME, embeddingSize: 0, landmarks: 5, speed: 0 }
  )
  await provider.loadModel(
    RECOGNITION_MODEL_NAME,
    'models/insightface/w600k_mbf.onnx',
    { name: RECOGNITION_MODEL_NAME, embeddingSize: 512, landmarks: 0, speed: 0 }
  )
  console.error('[worker] models loaded')

  const imagePaths: string[] = []
  const imageBuffers: Buffer[] = []
  for (const group of DEMOGRAPHIC_GROUPS) {
    const files: string[] = []
    collectImages(join(BFW_DATASET_ROOT, group), files)
    for (const file of files) {
      imagePaths.push(`${group}/${file.split(`/${group}/`)[1]}`)
      imageBuffers.push(readFileSync(file))
    }
  }
  console.error(`[worker] ${imagePaths.length} images to embed`)

  const embeddings: Record<string, number[]> = {}
  const start = Date.now()
  let missed = 0

  for (let i = 0; i < imageBuffers.length; i++) {
    try {
      const canvas = await toCanvas(imageBuffers[i])
      const faces = await provider.detectFaces(canvas)
      if (faces.length === 0) {
        missed++
        console.error(
          `[worker] no face for ${imagePaths[i]} (${missed} missed so far)`
        )
        continue
      }
      const embedding = await provider.getAlignedEmbedding(
        canvas,
        faces[0].landmarks,
        RECOGNITION_MODEL_NAME
      )
      embeddings[imagePaths[i]] = Array.from(embedding)
    } catch {
      missed++
    }

    if ((i + 1) % 500 === 0) {
      const elapsed = (Date.now() - start) / 1000
      const rate = (i + 1) / elapsed
      console.error(
        `[worker] ${i + 1}/${imageBuffers.length} (${rate.toFixed(1)} img/s, ${missed} missed)`
      )
    }
  }

  if (!existsSync(resolve(process.cwd(), 'metrics/embeddings')))
    mkdirSync(resolve(process.cwd(), 'metrics/embeddings'), { recursive: true })
  writeFileSync(OUTPUT_PATH, JSON.stringify(embeddings), 'utf-8')

  const elapsedSec = (Date.now() - start) / 1000
  console.error(
    `[worker] done: ${Object.keys(embeddings).length} embeddings, ${missed} missed, ${(elapsedSec / 60).toFixed(1)} min`
  )
}

main().catch(error => {
  console.error(
    `[worker] FATAL: ${error instanceof Error ? error.message : error}`
  )
  process.exit(1)
})
