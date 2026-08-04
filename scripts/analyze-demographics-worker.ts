import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { calculateAllMetrics } from '../apps/backend/src/services/benchmark/metrics'

const EMBED_DIR = resolve(process.cwd(), 'metrics/embeddings')
const BFW_CSV = resolve(
  process.cwd(),
  'datasets/tmp/BFW-Release/bfw-datatable.csv'
)
const OUTPUT_DIR = resolve(process.cwd(), 'metrics/demographics')

function getArg(name: string): string {
  const idx = process.argv.indexOf('--' + name)
  if (idx === -1 || idx + 1 >= process.argv.length)
    throw new Error(`Missing --${name}`)
  return process.argv[idx + 1]
}

interface GroupResult {
  auc: number
  eer: number
  tarAtFar001: number
  pairs: number
}

async function analyzeModel(
  model: string
): Promise<Record<string, GroupResult>> {
  const embedPath = join(EMBED_DIR, `${model}.json`)
  if (!existsSync(embedPath)) {
    console.error(`[worker] ${model}: no embeddings found, skipping`)
    return {}
  }

  const embeddings: Record<string, number[]> = JSON.parse(
    readFileSync(embedPath, 'utf-8')
  )
  console.error(
    `[worker] ${model}: ${Object.keys(embeddings).length} embeddings loaded`
  )

  // Group accumulators: group_key -> { similarities, labels }
  const groups: Record<string, { similarities: number[]; labels: number[] }> =
    {}

  // Stream CSV line by line (156MB)
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
    if (columns.length < 17) continue

    const imagePath1 = columns[1]
    const imagePath2 = columns[2]
    const label = parseInt(columns[3], 10)
    const ethnicity = columns[15]
    const gender = columns[13]

    const embedding1 = embeddings[imagePath1]
    const embedding2 = embeddings[imagePath2]

    if (!embedding1 || !embedding2) continue

    // Cosine similarity
    let dotProduct = 0,
      norm1 = 0,
      norm2 = 0
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      norm1 += embedding1[i] * embedding1[i]
      norm2 += embedding2[i] * embedding2[i]
    }
    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2) || 1)

    // Group key: ethnicity+gender (e.g., "A_F", "W_M")
    const groupKey = `${ethnicity}_${gender}`

    if (!groups[groupKey]) groups[groupKey] = { similarities: [], labels: [] }
    groups[groupKey].similarities.push(similarity)
    groups[groupKey].labels.push(label)

    lineCount++
    if (lineCount % 100000 === 0)
      console.error(`[worker] ${model}: ${lineCount} pairs processed`)
  }

  console.error(
    `[worker] ${model}: ${lineCount} total pairs, ${Object.keys(groups).length} groups`
  )

  // Compute metrics per group
  const results: Record<string, GroupResult> = {}
  for (const [group, groupData] of Object.entries(groups)) {
    if (groupData.labels.length < 100) continue // skip tiny groups
    const metrics = calculateAllMetrics(
      groupData.similarities,
      groupData.labels
    )
    results[group] = {
      auc: metrics.auc,
      eer: metrics.eer,
      tarAtFar001: metrics.tarAtFar001,
      pairs: groupData.labels.length
    }
  }

  return results
}

async function main() {
  const model = getArg('model')
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })

  console.error(`[worker] Starting ${model}...`)
  const startTime = Date.now()
  const results = await analyzeModel(model)

  const outputPath = join(OUTPUT_DIR, `${model}.json`)
  writeFileSync(outputPath, JSON.stringify(results), 'utf-8')
  console.error(
    `[worker] ${model} done in ${((Date.now() - startTime) / 1000 / 60).toFixed(1)}min -> ${outputPath}`
  )
}

main().catch((error: Error) => {
  console.error(`FATAL: ${error.message}`)
  process.exit(1)
})
