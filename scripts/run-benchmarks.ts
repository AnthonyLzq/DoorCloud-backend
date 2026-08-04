import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { FaceRecognitionService } from '../apps/backend/src/services/face-recognition'
import { runBenchmark } from '../apps/backend/src/services/benchmark/runner'
import { BenchmarkStorage } from '../apps/backend/src/services/benchmark/storage'
import { generateLeaderboard } from '../apps/backend/src/services/benchmark/leaderboard'

const DATASETS = ['lfw', 'cfp-fp', 'agedb-30', 'calfw']
const MODELS = [
  {
    name: 'insightface-buffalo-l',
    approach: 'onnx' as const,
    config: { path: 'models/insightface/w600k_r50.onnx', embeddingSize: 512 }
  },
  {
    name: 'insightface-buffalo-m',
    approach: 'onnx' as const,
    config: {
      path: 'models/insightface/buffalo_m/w600k_r50.onnx',
      embeddingSize: 512
    }
  },
  {
    name: 'insightface-buffalo-s',
    approach: 'onnx' as const,
    config: { path: 'models/insightface/w600k_mbf.onnx', embeddingSize: 512 }
  },
  {
    name: 'dlib',
    approach: 'python' as const,
    config: {
      type: 'dlib' as const,
      path: 'models/dlib/dlib_face_recognition_resnet_model_v1.dat'
    }
  }
]

const isQuick = process.argv.includes('--quick')
const MAX_PAIRS = isQuick ? 300 : undefined

if (isQuick) {
  console.log('[Benchmark] QUICK MODE: 300 pairs per dataset')
}

async function main(): Promise<void> {
  console.log('[Benchmark] Initializing face recognition service...')
  const service = new FaceRecognitionService()
  await service.init()

  // Load models
  for (const model of MODELS) {
    console.log(
      `[Benchmark] Loading model: ${model.name} (${model.approach})...`
    )
    try {
      await service.loadModel(model.name, model.approach, model.config)
      console.log(`[Benchmark]   ✓ ${model.name} loaded`)
    } catch (error) {
      console.error(
        `[Benchmark]   ✗ ${model.name} failed to load: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  // Wrap service.compare into CompareFn
  const compareFn = async (img1: Buffer, img2: Buffer, model: string) => {
    const result = await service.compare(img1, img2, model)
    return {
      similarity: result.similarity,
      latency: result.latency
    }
  }

  const storage = new BenchmarkStorage()

  // Run benchmarks for each dataset + model combination
  for (const dataset of DATASETS) {
    for (const model of MODELS) {
      console.log(`[Benchmark] Running ${model.name} on ${dataset}...`)
      try {
        const results = await runBenchmark(
          { dataset, models: [model.name], maxPairs: MAX_PAIRS },
          compareFn
        )

        // Save to SQLite
        for (const result of results) {
          storage.saveResult(result)
        }

        console.log(
          `[Benchmark]   ✓ ${model.name} on ${dataset}: AUC=${results[0].accuracy.auc.toFixed(4)}, EER=${results[0].accuracy.eer.toFixed(4)}, avgLatency=${results[0].performance.avgLatency.toFixed(1)}ms`
        )
      } catch (error) {
        console.error(
          `[Benchmark]   ✗ ${model.name} on ${dataset}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  storage.close()

  // Export leaderboard as CSV
  const readStorage = new BenchmarkStorage()
  const leaderboard = readStorage.getLeaderboard()
  const csv = generateLeaderboard(leaderboard, {}, 'csv')

  const csvPath = resolve(process.cwd(), 'metrics/benchmark-results.csv')
  writeFileSync(csvPath, csv, 'utf-8')
  console.log(`[Benchmark] Leaderboard exported to ${csvPath}`)

  // Export markdown for quick viewing
  const md = generateLeaderboard(leaderboard, {}, 'markdown')
  const mdPath = resolve(process.cwd(), 'metrics/benchmark-results.md')
  writeFileSync(mdPath, md, 'utf-8')
  console.log(`[Benchmark] Leaderboard exported to ${mdPath}`)

  readStorage.close()
  await service.shutdown()

  console.log('[Benchmark] Done!')
}

main().catch(error => {
  console.error('[Benchmark] Fatal error:', error)
  process.exit(1)
})
