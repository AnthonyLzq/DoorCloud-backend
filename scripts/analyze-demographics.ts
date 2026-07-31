import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const EMBED_DIR = resolve(process.cwd(), 'metrics/embeddings')
const OUTPUT_DIR = resolve(process.cwd(), 'metrics/demographics')

interface ModelJob {
  model: string
  worker: number
}

const MODEL_JOBS: ModelJob[] = [
  { model: 'insightface-buffalo-s', worker: 1 },
  { model: 'insightface-buffalo-l', worker: 1 },
  { model: 'insightface-buffalo-m', worker: 1 },
  { model: 'vladmandic-human', worker: 1 },
  { model: 'dlib', worker: 2 }
]

async function runJob(modelJob: ModelJob): Promise<void> {
  return new Promise(finishJob => {
    const workerScript = resolve(
      process.cwd(),
      'scripts/analyze-demographics-worker.ts'
    )
    const args = ['tsx', workerScript, '--model', modelJob.model]
    // Low CPU priority (nice -n 19) to minimize impact on interactive use
    const childProcess = spawn('nice', ['-n', '19', 'npx', ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=512'
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

async function mergeResults(): Promise<void> {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })

  const csvLines = ['model,group,auc,eer,tarAtFar001,pairs']
  for (const modelJob of MODEL_JOBS) {
    const resultPath = join(OUTPUT_DIR, `${modelJob.model}.json`)
    if (!existsSync(resultPath)) {
      console.error(
        `[orchestrator] ${modelJob.model}: no results, skipping merge`
      )
      continue
    }
    const groupResults: Record<
      string,
      { auc: number; eer: number; tarAtFar001: number; pairs: number }
    > = JSON.parse(readFileSync(resultPath, 'utf-8'))
    for (const [group, groupResult] of Object.entries(groupResults)) {
      csvLines.push(
        `${modelJob.model},${group},${groupResult.auc.toFixed(6)},${groupResult.eer.toFixed(6)},${groupResult.tarAtFar001.toFixed(6)},${groupResult.pairs}`
      )
    }
  }

  const csvPath = join(OUTPUT_DIR, 'demographics-results.csv')
  writeFileSync(csvPath, csvLines.join('\n'), 'utf-8')
  console.error(`[orchestrator] Merged results saved to ${csvPath}`)
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })

  // Skip models with existing results
  const pendingJobs = MODEL_JOBS.filter(
    job => !existsSync(join(OUTPUT_DIR, `${job.model}.json`))
  )

  if (pendingJobs.length === 0) {
    console.log('[orchestrator] All models already analyzed')
  } else {
    const worker1Jobs = pendingJobs.filter(job => job.worker === 1)
    const worker2Jobs = pendingJobs.filter(job => job.worker === 2)

    console.log(
      `[orchestrator] Worker 1: ${worker1Jobs.map(job => job.model).join(', ')}`
    )
    console.log(
      `[orchestrator] Worker 2: ${worker2Jobs.map(job => job.model).join(', ')}`
    )

    const worker1 = (async () => {
      for (const job of worker1Jobs) {
        console.log(`[worker1] Starting ${job.model}...`)
        const startTime = Date.now()
        await runJob(job)
        console.log(
          `[worker1] ${job.model} done in ${((Date.now() - startTime) / 1000 / 60).toFixed(1)}min`
        )
      }
    })()

    const worker2 = (async () => {
      for (const job of worker2Jobs) {
        console.log(`[worker2] Starting ${job.model}...`)
        const startTime = Date.now()
        await runJob(job)
        console.log(
          `[worker2] ${job.model} done in ${((Date.now() - startTime) / 1000 / 60).toFixed(1)}min`
        )
      }
    })()

    await Promise.all([worker1, worker2])
    console.log('[orchestrator] All demographic analysis done')
  }

  await mergeResults()
  console.log('[orchestrator] Finished')
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
