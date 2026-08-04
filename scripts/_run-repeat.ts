import { FaceRecognitionService } from '../apps/backend/src/services/face-recognition'
import { runBenchmark } from '../apps/backend/src/services/benchmark/runner'
import { BenchmarkStorage } from '../apps/backend/src/services/benchmark/storage'

// Parse CLI args
function getArg(name: string): string {
  const idx = process.argv.indexOf('--' + name)
  if (idx === -1 || idx + 1 >= process.argv.length) {
    throw new Error(`Missing --${name}`)
  }
  return process.argv[idx + 1]
}

async function main() {
  const model = getArg('model')
  const approach = getArg('approach') as 'onnx' | 'python'
  const dataset = getArg('dataset')
  const repeat = parseInt(getArg('repeat'), 10)
  const config = JSON.parse(getArg('config'))

  const service = new FaceRecognitionService()
  await service.init()
  await service.loadModel(model, approach, config)

  const compareFn = async (img1: Buffer, img2: Buffer, m: string) => {
    const start = performance.now()
    const r = await service.compare(img1, img2, m)
    return { similarity: r.similarity, latency: r.latency }
  }

  const storage = new BenchmarkStorage()
  const results = await runBenchmark({ dataset, models: [model] }, compareFn)

  for (const result of results) {
    storage.saveResult(result, repeat)
  }

  storage.close()
  await service.shutdown()

  // Print CI line for parent to capture
  console.log(`CI: ${model} ${dataset} repeat=${repeat} OK`)
}

main().catch(e => {
  console.error(
    `CI: ${getArg('model')} ${getArg('dataset')} repeat=${getArg('repeat')} FAIL:`,
    e.message
  )
  process.exit(1)
})
