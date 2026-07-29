import { Human } from '@vladmandic/human'
import { runBenchmark } from '../src/services/benchmark/runner'
import { BenchmarkStorage } from '../src/services/benchmark/storage'
import { generateLeaderboard } from '../src/services/benchmark/leaderboard'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Monkey-patch for tfjs-node compatibility with Node.js 24
// util.isNullOrUndefined was removed but tfjs-node still references it
const nodeUtil = require('util') as {
  isNullOrUndefined?: (x: unknown) => boolean
}
nodeUtil.isNullOrUndefined ??= (x: unknown) => x === null || x === undefined

async function main() {
  console.log('[human] Initializing...')
  const human = new Human({
    debug: false,
    face: { emotion: { enabled: false } },
    body: { enabled: false },
    hand: { enabled: false },
    gesture: { enabled: false },
    modelBasePath:
      'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.0.3/models/'
  })
  await human.tf.ready()
  await human.load()
  console.log('[human] Ready')

  const compareFn = async (img1: Buffer, img2: Buffer) => {
    const start = performance.now()
    const tensor1 = human.tf.node.decodeImage(img1, 3)
    const tensor2 = human.tf.node.decodeImage(img2, 3)
    const [det1, det2] = await Promise.all([
      human.detect(tensor1),
      human.detect(tensor2)
    ])
    tensor1.dispose()
    tensor2.dispose()

    if (
      !det1.face?.length ||
      !det1.face[0].embedding ||
      !det2.face?.length ||
      !det2.face[0].embedding
    ) {
      throw new Error('No face detected')
    }

    const similarity = human.match.similarity(
      det1.face[0].embedding,
      det2.face[0].embedding,
      { order: 2 }
    )
    return { similarity, latency: performance.now() - start }
  }

  const storage = new BenchmarkStorage()
  const datasets = ['lfw', 'cfp-fp', 'agedb-30', 'calfw']

  for (const ds of datasets) {
    console.log('[human]', ds, '...')
    try {
      const r = await runBenchmark(
        { dataset: ds, models: ['vladmandic-human'] },
        compareFn
      )
      storage.saveResult(r[0])
      console.log(
        `  AUC=${r[0].accuracy.auc.toFixed(4)}, pairs=${r[0].performance.pairsProcessed}, lat=${r[0].performance.avgLatency.toFixed(1)}ms`
      )
    } catch (e) {
      console.log('  FAIL:', String(e).slice(0, 100))
    }
  }

  storage.close()

  const rs = new BenchmarkStorage()
  const lb = rs.getLeaderboard()
  writeFileSync(
    resolve('metrics/benchmark-results.csv'),
    generateLeaderboard(lb, {}, 'csv'),
    'utf-8'
  )
  writeFileSync(
    resolve('metrics/benchmark-results.md'),
    generateLeaderboard(lb, {}, 'markdown'),
    'utf-8'
  )
  rs.close()
  console.log('[human] Done')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
