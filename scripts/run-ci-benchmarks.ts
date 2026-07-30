import { spawn } from 'node:child_process'
import { cpus } from 'node:os'
import { resolve } from 'node:path'

interface BenchmarkJob {
  model: string
  modelApproach: 'onnx' | 'python'
  modelConfig: Record<string, unknown>
  datasets: string[]
  repeats: number
}

const JOBS: BenchmarkJob[] = [
  {
    model: 'insightface-buffalo-s',
    modelApproach: 'onnx',
    modelConfig: {
      path: 'models/insightface/w600k_mbf.onnx',
      embeddingSize: 512
    },
    datasets: ['lfw', 'cfp-fp', 'agedb-30', 'calfw'],
    repeats: 5
  },
  {
    model: 'insightface-buffalo-l',
    modelApproach: 'onnx',
    modelConfig: {
      path: 'models/insightface/w600k_r50.onnx',
      embeddingSize: 512
    },
    datasets: ['lfw', 'cfp-fp', 'agedb-30', 'calfw'],
    repeats: 5
  },
  {
    model: 'insightface-buffalo-m',
    modelApproach: 'onnx',
    modelConfig: {
      path: 'models/insightface/buffalo_m/w600k_r50.onnx',
      embeddingSize: 512
    },
    datasets: ['lfw', 'cfp-fp', 'agedb-30', 'calfw'],
    repeats: 5
  },
  {
    model: 'dlib',
    modelApproach: 'python',
    modelConfig: {
      type: 'dlib',
      path: 'models/dlib/dlib_face_recognition_resnet_model_v1.dat'
    },
    datasets: ['lfw', 'cfp-fp', 'agedb-30', 'calfw'],
    repeats: 3
  },
  {
    model: 'vladmandic-human',
    modelApproach: 'python',
    modelConfig: {},
    datasets: ['lfw', 'cfp-fp', 'agedb-30', 'calfw'],
    repeats: 3
  }
]

const CONCURRENCY = Math.max(1, cpus().length - 1)

interface Task {
  model: string
  dataset: string
  repeat: number
  approach: string
  config: Record<string, unknown>
}

function buildTasks(): Task[] {
  const tasks: Task[] = []
  for (const job of JOBS) {
    for (const dataset of job.datasets) {
      for (let r = 1; r <= job.repeats; r++) {
        tasks.push({
          model: job.model,
          dataset,
          repeat: r,
          approach: job.modelApproach,
          config: job.modelConfig
        })
      }
    }
  }
  return tasks
}

function runTask(task: Task): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const isHuman = task.model === 'vladmandic-human'
    const scriptPath = resolve(
      process.cwd(),
      isHuman ? 'scripts/_run-repeat-human.ts' : 'scripts/_run-repeat.ts'
    )
    const proc = spawn(
      'npx',
      [
        'tsx',
        scriptPath,
        '--model',
        task.model,
        '--approach',
        task.approach,
        '--dataset',
        task.dataset,
        '--repeat',
        String(task.repeat),
        '--config',
        JSON.stringify(task.config)
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=512 --experimental-sqlite'
        }
      }
    )

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
    })

    proc.on('close', code => {
      if (code === 0) {
        // Print last line of stdout (the CI result)
        const lines = stdout
          .trim()
          .split('\n')
          .filter(l => l.startsWith('CI:'))
        for (const line of lines) console.log(line)
        resolvePromise()
      } else {
        console.error(
          `[FAIL] ${task.model}/${task.dataset} repeat ${task.repeat} (exit ${code})`
        )
        const errLines = stderr.trim().split('\n').slice(-5)
        for (const l of errLines) console.error(`  ${l}`)
        reject(new Error(`Exit code ${code}`))
      }
    })

    proc.on('error', reject)
  })
}

async function main() {
  const allTasks = buildTasks()
  const humanTasks = allTasks.filter(t => t.model === 'vladmandic-human')
  const onnxTasks = allTasks.filter(t => t.model !== 'vladmandic-human')
  console.log(
    `[CI] ${onnxTasks.length} ONNX tasks + ${humanTasks.length} human tasks, concurrency=${CONCURRENCY}`
  )

  let completed = 0
  let failed = 0

  async function runBatch(tasks: Task[], label: string, concurrency: number) {
    console.log(
      `[CI] Starting ${label} (${tasks.length} tasks, concurrency=${concurrency})`
    )
    for (let i = 0; i < tasks.length; i += concurrency) {
      const batch = tasks.slice(i, i + concurrency)
      const results = await Promise.allSettled(batch.map(runTask))

      for (const r of results) {
        if (r.status === 'fulfilled') completed++
        else failed++
      }
      console.log(
        `[CI] ${label}: ${completed}/${allTasks.length} (${failed} failed)`
      )
    }
  }

  // Phase 1: ONNX + dlib in parallel batches
  await runBatch(onnxTasks, 'ONNX/dlib', CONCURRENCY)

  // Phase 2: human sequentially (TF.js memory intensive)
  await runBatch(humanTasks, 'human', 1)

  console.log(`[CI] Done! ${completed} succeeded, ${failed} failed`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
