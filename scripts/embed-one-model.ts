import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync
} from 'node:fs'
import { resolve, join } from 'node:path'

function getArg(name: string): string {
  const idx = process.argv.indexOf('--' + name)
  if (idx === -1 || idx + 1 >= process.argv.length)
    throw new Error(`Missing --${name}`)
  return process.argv[idx + 1]
}

async function main() {
  const model = getArg('model')
  const outputDir = resolve(process.cwd(), 'metrics/embeddings')
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  const bfwRoot = resolve(
    process.cwd(),
    'datasets/tmp/BFW-Release/bfw-faces-cropped/jrobby/bfw/bfw-cropped-aligned'
  )
  const groups = [
    'asian_females',
    'asian_males',
    'black_females',
    'black_males',
    'indian_females',
    'indian_males',
    'white_females',
    'white_males'
  ]

  const imageKeys: string[] = []
  const imageBuffers: Buffer[] = []
  for (const group of groups) {
    const dir = join(bfwRoot, group)
    const personDirs = readdirSync(dir)
    for (const personDir of personDirs) {
      const personPath = join(dir, personDir)
      try {
        const files = readdirSync(personPath).filter((f: string) =>
          f.endsWith('.jpg')
        )
        for (const f of files) {
          imageKeys.push(`${group}/${personDir}/${f}`)
          imageBuffers.push(readFileSync(join(personPath, f)))
        }
      } catch {
        /* skip non-directories */
      }
    }
  }
  console.error(`[embed] ${model}: ${imageKeys.length} images`)

  const outputPath = join(outputDir, `${model}.json`)

  if (model === 'vladmandic-human') {
    const { Human } = require('@vladmandic/human')
    const nodeUtil = require('util')
    nodeUtil.isNullOrUndefined ??= (x: unknown) => x === null || x === undefined
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
    console.error(`[embed] ${model} ready`)

    const embs: Record<string, number[]> = {}
    for (let i = 0; i < imageKeys.length; i++) {
      try {
        const t = human.tf.node.decodeImage(imageBuffers[i], 3)
        const det = await human.detect(t)
        t.dispose()
        if (det.face?.[0]?.embedding)
          embs[imageKeys[i]] = Array.from(det.face[0].embedding)
      } catch {
        /* skip */
      }
      if (i % 100 === 0)
        console.error(`[embed] ${model}: ${i}/${imageKeys.length}`)
    }
    writeFileSync(outputPath, JSON.stringify(embs), 'utf-8')
    console.error(`[embed] ${model}: ${Object.keys(embs).length} embeddings`)
    return
  }

  const { FaceRecognitionService } = require('../src/services/face-recognition')
  const service = new FaceRecognitionService()
  await service.init()
  const approach = getArg('approach')
  const config = JSON.parse(getArg('config'))
  await service.loadModel(model, approach, config)
  console.error(`[embed] ${model} ready`)

  const embs: Record<string, number[]> = {}
  for (let i = 0; i < imageKeys.length; i++) {
    try {
      const r = await service.getEmbedding(imageBuffers[i], model)
      embs[imageKeys[i]] = Array.from(r.embedding)
    } catch {
      /* skip */
    }
    if (i % 100 === 0)
      console.error(`[embed] ${model}: ${i}/${imageKeys.length}`)
  }
  writeFileSync(outputPath, JSON.stringify(embs), 'utf-8')
  await service.shutdown()
  console.error(`[embed] ${model}: ${Object.keys(embs).length} embeddings`)
}

main().catch((e: Error) => {
  console.error(`FATAL: ${e.message}`)
  process.exit(1)
})
