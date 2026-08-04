import { spawn } from 'node:child_process'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { calculateAllMetrics } from '../apps/backend/src/services/benchmark/metrics'
import { cosineSimilarity } from '../apps/backend/src/services/face-recognition/cosine-similarity'

const EMBEDDINGS_PATH = resolve(
  process.cwd(),
  'metrics/embeddings/insightface-buffalo-s-aligned.json'
)
const BFW_CSV = resolve(
  process.cwd(),
  'datasets/tmp/BFW-Release/bfw-datatable.csv'
)
const TARGET_FAR = 1e-4

function runWorker(): Promise<void> {
  return new Promise((finishJob, rejectJob) => {
    const workerScript = resolve(process.cwd(), 'scripts/reembed-bfw-worker.ts')
    const childProcess = spawn(
      'nice',
      ['-n', '19', 'npx', 'tsx', workerScript],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=512'
        }
      }
    )

    childProcess.stdout?.on('data', (chunk: Buffer) =>
      process.stdout.write(chunk)
    )
    childProcess.stderr?.on('data', (chunk: Buffer) =>
      process.stderr.write(chunk)
    )

    childProcess.on('close', exitCode => {
      if (exitCode === 0) finishJob()
      else rejectJob(new Error(`worker exited with code ${exitCode}`))
    })
  })
}

/**
 * Derives the similarity threshold for a target FAR from ROC points
 *
 * Walks the ROC curve (sorted by similarity descending) and returns the
 * similarity at the last point where FAR is still at or below the target.
 */
function thresholdAtFar(
  similarities: number[],
  labels: number[],
  targetFar: number
): { threshold: number; tar: number; rocAtTarget: number } | null {
  const paired = similarities
    .map((sim, i) => ({ sim, label: labels[i] }))
    .sort((a, b) => b.sim - a.sim)

  const totalPos = paired.filter(p => p.label === 1).length
  const totalNeg = paired.filter(p => p.label === 0).length
  if (totalPos === 0 || totalNeg === 0) return null

  let tp = 0
  let fp = 0
  let last = -Infinity

  for (const item of paired) {
    if (item.label === 1) tp++
    else fp++
    const far = fp / totalNeg
    const tar = tp / totalPos
    if (far <= targetFar) {
      last = item.sim
    } else {
      return { threshold: last, tar, rocAtTarget: far }
    }
  }

  return { threshold: last, tar: 1, rocAtTarget: 0 }
}

async function deriveThreshold(): Promise<void> {
  if (!existsSync(EMBEDDINGS_PATH)) {
    console.error('[derive] embeddings not found, running worker...')
    await runWorker()
  } else {
    console.error('[derive] embeddings already exist, skipping worker')
  }

  const embeddings: Record<string, number[]> = JSON.parse(
    readFileSync(EMBEDDINGS_PATH, 'utf-8')
  )
  console.error(`[derive] loaded ${Object.keys(embeddings).length} embeddings`)

  const similarities: number[] = []
  const labels: number[] = []
  const lineReader = createInterface({
    input: createReadStream(BFW_CSV),
    crlfDelay: Infinity
  })
  let isHeader = true
  let lineCount = 0

  for await (const line of lineReader) {
    if (isHeader) {
      isHeader = false
      continue
    }
    const columns = line.split(',')
    if (columns.length < 4) continue

    const imagePath1 = columns[1]
    const imagePath2 = columns[2]
    const label = parseInt(columns[3], 10)
    const embedding1 = embeddings[imagePath1]
    const embedding2 = embeddings[imagePath2]
    if (!embedding1 || !embedding2) continue

    similarities.push(cosineSimilarity(embedding1, embedding2))
    labels.push(label)
    lineCount++
  }

  console.error(`[derive] processed ${lineCount} pairs`)

  const metrics = calculateAllMetrics(similarities, labels)
  const threshold = thresholdAtFar(similarities, labels, TARGET_FAR)

  console.log(
    JSON.stringify(
      {
        pairs: lineCount,
        auc: metrics.auc,
        eer: metrics.eer,
        tarAtFar001: metrics.tarAtFar001,
        tarAtFar01: metrics.tarAtFar01,
        targetFar: TARGET_FAR,
        thresholdAtFar: threshold?.threshold,
        tarAtThreshold: threshold?.tar,
        previousBaseline: 0.3719
      },
      null,
      2
    )
  )
}

deriveThreshold().catch(error => {
  console.error(
    `[derive] FATAL: ${error instanceof Error ? error.message : error}`
  )
  process.exit(1)
})
