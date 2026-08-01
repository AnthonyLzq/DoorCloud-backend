import {
  createReadStream,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { cosineSimilarity } from '../src/services/face-recognition/cosine-similarity'

const BFW_CSV = resolve(
  process.cwd(),
  'datasets/tmp/BFW-Release/bfw-datatable.csv'
)
const OUTPUT_DIR = resolve(process.cwd(), 'metrics/roc-pipeline')

const PIPELINES = [
  {
    name: 'baseline',
    embeddingsPath: resolve(
      process.cwd(),
      'metrics/embeddings/insightface-buffalo-s.json'
    )
  },
  {
    name: 'aligned',
    embeddingsPath: resolve(
      process.cwd(),
      'metrics/embeddings/insightface-buffalo-s-aligned.json'
    )
  }
]

async function exportPipeline(pipeline: {
  name: string
  embeddingsPath: string
}): Promise<void> {
  const embeddings: Record<string, number[]> = JSON.parse(
    readFileSync(pipeline.embeddingsPath, 'utf-8')
  )
  console.error(
    `[export] ${pipeline.name}: ${Object.keys(embeddings).length} embeddings`
  )

  const lines: string[] = ['similarity,label']
  let count = 0
  const lineReader = createInterface({
    input: createReadStream(BFW_CSV),
    crlfDelay: Infinity
  })
  let isHeader = true

  for await (const line of lineReader) {
    if (isHeader) {
      isHeader = false
      continue
    }
    const columns = line.split(',')
    if (columns.length < 4) continue

    const embedding1 = embeddings[columns[1]]
    const embedding2 = embeddings[columns[2]]
    if (!embedding1 || !embedding2) continue

    lines.push(
      `${cosineSimilarity(embedding1, embedding2).toFixed(8)},${columns[3]}`
    )
    count++
  }

  writeFileSync(
    resolve(OUTPUT_DIR, `${pipeline.name}-similarities.csv`),
    lines.join('\n'),
    'utf-8'
  )
  console.error(`[export] ${pipeline.name}: wrote ${count} pairs`)
}

async function main(): Promise<void> {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })
  for (const pipeline of PIPELINES) await exportPipeline(pipeline)
}

main().catch(error => {
  console.error(
    `[export] FATAL: ${error instanceof Error ? error.message : error}`
  )
  process.exit(1)
})
