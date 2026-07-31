import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { calculateAllMetrics } from '../src/services/benchmark/metrics'

const EMBED_DIR = resolve(process.cwd(), 'metrics/embeddings')
const BFW_CSV = resolve(
  process.cwd(),
  'datasets/tmp/BFW-Release/bfw-datatable.csv'
)
const OUTPUT_DIR = resolve(process.cwd(), 'metrics/demographics')

interface Result {
  model: string
  group: string
  auc: number
  eer: number
  tarAtFar001: number
  pairs: number
}

async function analyzeModel(model: string): Promise<Result[]> {
  const embedPath = join(EMBED_DIR, `${model}.json`)
  if (!existsSync(embedPath)) {
    console.error(`[analyze] ${model}: no embeddings found, skipping`)
    return []
  }

  const embeddings: Record<string, number[]> = JSON.parse(
    readFileSync(embedPath, 'utf-8')
  )
  console.error(
    `[analyze] ${model}: ${Object.keys(embeddings).length} embeddings loaded`
  )

  // Group accumulators: group_key -> { similarities, labels }
  const groups: Record<string, { sims: number[]; labels: number[] }> = {}

  // Stream CSV line by line (163MB)
  const rl = createInterface({
    input: createReadStream(BFW_CSV),
    crlfDelay: Infinity
  })
  let header = true
  let lineCount = 0

  for await (const line of rl) {
    if (header) {
      header = false
      continue
    }

    const cols = line.split(',')
    if (cols.length < 17) continue

    const p1 = cols[1]
    const p2 = cols[2]
    const label = parseInt(cols[3], 10)
    const e1 = cols[15]
    const g1 = cols[13] // ethnicity, gender

    const emb1 = embeddings[p1]
    const emb2 = embeddings[p2]

    if (!emb1 || !emb2) continue

    // Cosine similarity
    let dot = 0,
      n1 = 0,
      n2 = 0
    for (let i = 0; i < emb1.length; i++) {
      dot += emb1[i] * emb2[i]
      n1 += emb1[i] * emb1[i]
      n2 += emb2[i] * emb2[i]
    }
    const sim = dot / (Math.sqrt(n1) * Math.sqrt(n2) || 1)

    // Group key: ethnicity+gender (e.g., "A_F", "W_M")
    const groupKey = `${e1}_${g1}`

    if (!groups[groupKey]) groups[groupKey] = { sims: [], labels: [] }
    groups[groupKey].sims.push(sim)
    groups[groupKey].labels.push(label)

    lineCount++
    if (lineCount % 100000 === 0)
      console.error(`[analyze] ${model}: ${lineCount} pairs processed`)
  }

  console.error(
    `[analyze] ${model}: ${lineCount} total pairs, ${Object.keys(groups).length} groups`
  )

  // Compute metrics per group
  const results: Result[] = []
  for (const [group, data] of Object.entries(groups)) {
    if (data.labels.length < 100) continue // skip tiny groups
    const metrics = calculateAllMetrics(data.sims, data.labels)
    results.push({
      model,
      group,
      auc: metrics.auc,
      eer: metrics.eer,
      tarAtFar001: metrics.tarAtFar001,
      pairs: data.labels.length
    })
  }

  return results
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })

  const models = [
    'insightface-buffalo-s',
    'insightface-buffalo-l',
    'insightface-buffalo-m',
    'dlib',
    'vladmandic-human'
  ]
  const allResults: Result[] = []

  for (const model of models) {
    const results = await analyzeModel(model)
    allResults.push(...results)
  }

  // Export CSV
  const header = 'model,group,auc,eer,tarAtFar001,pairs'
  const csvLines = [header]
  for (const r of allResults) {
    csvLines.push(
      `${r.model},${r.group},${r.auc.toFixed(6)},${r.eer.toFixed(6)},${r.tarAtFar001.toFixed(6)},${r.pairs}`
    )
  }
  writeFileSync(
    join(OUTPUT_DIR, 'demographics-results.csv'),
    csvLines.join('\n'),
    'utf-8'
  )

  // Print summary
  console.log('\n=== Demographic Analysis Results ===')
  console.log(
    `${'Model'.padEnd(25)} ${'Group'.padEnd(10)} ${'AUC'.padEnd(10)} ${'EER'.padEnd(10)} ${'Pairs'.padEnd(8)}`
  )
  console.log('-'.repeat(65))
  for (const r of allResults) {
    console.log(
      `${r.model.padEnd(25)} ${r.group.padEnd(10)} ${r.auc.toFixed(4).padEnd(10)} ${r.eer.toFixed(4).padEnd(10)} ${r.pairs.toString().padEnd(8)}`
    )
  }
  console.log(
    `\nResults saved to ${join(OUTPUT_DIR, 'demographics-results.csv')}`
  )
}

main().catch((e: Error) => {
  console.error(`FATAL: ${e.message}`)
  process.exit(1)
})
