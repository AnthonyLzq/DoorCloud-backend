import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

interface ModelJob {
  model: string
  approach: string
  config: string
}

const MODEL_JOBS: ModelJob[] = [
  {
    model: 'insightface-buffalo-s',
    approach: 'onnx',
    config: '{"path":"models/insightface/w600k_mbf.onnx","embeddingSize":512}'
  },
  {
    model: 'insightface-buffalo-l',
    approach: 'onnx',
    config: '{"path":"models/insightface/w600k_r50.onnx","embeddingSize":512}'
  },
  {
    model: 'insightface-buffalo-m',
    approach: 'onnx',
    config:
      '{"path":"models/insightface/buffalo_m/w600k_r50.onnx","embeddingSize":512}'
  },
  {
    model: 'dlib',
    approach: 'python',
    config:
      '{"type":"dlib","path":"models/dlib/dlib_face_recognition_resnet_model_v1.dat"}'
  },
  { model: 'vladmandic-human', approach: 'python', config: '{}' }
]

async function runJob(modelJob: ModelJob): Promise<void> {
  return new Promise(finishJob => {
    const workerScript = resolve(process.cwd(), 'scripts/embed-one-model.ts')
    const args = [
      'tsx',
      workerScript,
      '--model',
      modelJob.model,
      '--approach',
      modelJob.approach,
      '--config',
      modelJob.config
    ]
    const childProcess = spawn('npx', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=512 --experimental-sqlite'
      }
    })

    childProcess.stdout?.on('data', (chunk: Buffer) =>
      process.stdout.write(chunk)
    )
    childProcess.stderr?.on('data', (chunk: Buffer) =>
      process.stderr.write(chunk)
    )

    childProcess.on('close', exitCode => {
      if (exitCode === 0) finishJob()
      else {
        console.error(
          `[orchestrator] ${modelJob.model} failed (exit ${exitCode})`
        )
        finishJob() // continue with next job
      }
    })
  })
}

async function main() {
  const outputDir = resolve(process.cwd(), 'metrics/embeddings')
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  // Worker 1: fast models (buffalo-s, buffalo-l, buffalo-m, human) — sequential
  const fastModelJobs = MODEL_JOBS.filter(job => job.model !== 'dlib')

  // Worker 2: dlib alone (bottleneck, ~4h)
  const dlibJob = MODEL_JOBS.find(job => job.model === 'dlib')!

  // Start both workers in parallel
  const worker1 = (async () => {
    for (const modelJob of fastModelJobs) {
      const outputPath = resolve(outputDir, `${modelJob.model}.json`)
      if (existsSync(outputPath)) {
        console.log(`[worker1] ${modelJob.model} already done`)
        continue
      }
      console.log(`[worker1] Starting ${modelJob.model}...`)
      const startTime = Date.now()
      await runJob(modelJob)
      console.log(
        `[worker1] ${modelJob.model} done in ${((Date.now() - startTime) / 1000 / 60).toFixed(1)}min`
      )
    }
  })()

  const worker2 = (async () => {
    const outputPath = resolve(outputDir, `${dlibJob.model}.json`)
    if (existsSync(outputPath)) {
      console.log(`[worker2] ${dlibJob.model} already done`)
      return
    }
    console.log(`[worker2] Starting ${dlibJob.model}...`)
    const startTime = Date.now()
    await runJob(dlibJob)
    console.log(
      `[worker2] ${dlibJob.model} done in ${((Date.now() - startTime) / 1000 / 60).toFixed(1)}min`
    )
  })()

  await Promise.all([worker1, worker2])
  console.log('[orchestrator] All embeddings generated')
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
