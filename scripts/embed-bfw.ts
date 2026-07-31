import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

interface Job {
  model: string
  approach: string
  config: string
}

const JOBS: Job[] = [
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

async function runJob(job: Job): Promise<void> {
  return new Promise(resolvePromise => {
    const script = resolve(process.cwd(), 'scripts/embed-one-model.ts')
    const args = [
      'tsx',
      script,
      '--model',
      job.model,
      '--approach',
      job.approach,
      '--config',
      job.config
    ]
    const proc = spawn('npx', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=512 --experimental-sqlite'
      }
    })

    proc.stdout?.on('data', (d: Buffer) => process.stdout.write(d))
    proc.stderr?.on('data', (d: Buffer) => process.stderr.write(d))

    proc.on('close', code => {
      if (code === 0) resolvePromise()
      else {
        console.error(`[orchestrator] ${job.model} failed (exit ${code})`)
        resolvePromise() // continue with next job
      }
    })
  })
}

async function main() {
  const out = resolve(process.cwd(), 'metrics/embeddings')
  if (!existsSync(out)) mkdirSync(out, { recursive: true })

  // Worker 1: fast models (buffalo-s, buffalo-l, buffalo-m, human) — sequential
  const fastModels = JOBS.filter(j => j.model !== 'dlib')

  // Worker 2: dlib alone (bottleneck, ~19min)
  const dlibJob = JOBS.find(j => j.model === 'dlib')!

  // Start both workers in parallel
  const worker1 = (async () => {
    for (const job of fastModels) {
      const dest = resolve(out, `${job.model}.json`)
      if (existsSync(dest)) {
        console.log(`[worker1] ${job.model} already done`)
        continue
      }
      console.log(`[worker1] Starting ${job.model}...`)
      const start = Date.now()
      await runJob(job)
      console.log(
        `[worker1] ${job.model} done in ${((Date.now() - start) / 1000 / 60).toFixed(1)}min`
      )
    }
  })()

  const worker2 = (async () => {
    const dest = resolve(out, `${dlibJob.model}.json`)
    if (existsSync(dest)) {
      console.log(`[worker2] ${dlibJob.model} already done`)
      return
    }
    console.log(`[worker2] Starting ${dlibJob.model}...`)
    const start = Date.now()
    await runJob(dlibJob)
    console.log(
      `[worker2] ${dlibJob.model} done in ${((Date.now() - start) / 1000 / 60).toFixed(1)}min`
    )
  })()

  await Promise.all([worker1, worker2])
  console.log('[orchestrator] All embeddings generated')
}

main().catch((e: Error) => {
  console.error(e.message)
  process.exit(1)
})
