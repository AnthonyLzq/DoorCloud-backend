import { Human } from '@vladmandic/human'
import { runBenchmark } from '../src/services/benchmark/runner'
import { BenchmarkStorage } from '../src/services/benchmark/storage'

// Monkey-patch for tfjs-node compat with Node.js 24
const nodeUtil = require('util') as {
  isNullOrUndefined?: (x: unknown) => boolean
}
nodeUtil.isNullOrUndefined ??= (x: unknown) => x === null || x === undefined

function getArg(name: string): string {
  const idx = process.argv.indexOf('--' + name)
  if (idx === -1 || idx + 1 >= process.argv.length)
    throw new Error(`Missing --${name}`)
  return process.argv[idx + 1]
}

async function main() {
  const model = getArg('model')
  const dataset = getArg('dataset')
  const repeat = parseInt(getArg('repeat'), 10)

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
  console.error(`[worker-human] ${model} loaded`)

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
  const results = await runBenchmark({ dataset, models: [model] }, compareFn)

  for (const result of results) {
    storage.saveResult(result, repeat)
  }

  storage.close()
  console.log(`CI: ${model} ${dataset} repeat=${repeat} OK`)
}

main().catch(e => {
  console.error(
    `CI: ${getArg('model')} ${getArg('dataset')} repeat=${getArg('repeat')} FAIL:`,
    e.message
  )
  process.exit(1)
})
