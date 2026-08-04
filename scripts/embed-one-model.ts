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
  const outputDirectory = resolve(process.cwd(), 'metrics/embeddings')
  if (!existsSync(outputDirectory))
    mkdirSync(outputDirectory, { recursive: true })

  const bfwDatasetRoot = resolve(
    process.cwd(),
    'datasets/tmp/BFW-Release/bfw-faces-cropped/jrobby/bfw/bfw-cropped-aligned'
  )
  const demographicGroups = [
    'asian_females',
    'asian_males',
    'black_females',
    'black_males',
    'indian_females',
    'indian_males',
    'white_females',
    'white_males'
  ]

  const imagePaths: string[] = []
  const imageDataBuffers: Buffer[] = []
  for (const group of demographicGroups) {
    const groupDir = join(bfwDatasetRoot, group)
    const personDirectories = readdirSync(groupDir)
    for (const personDirectory of personDirectories) {
      const personPath = join(groupDir, personDirectory)
      try {
        const files = readdirSync(personPath).filter((file: string) =>
          file.endsWith('.jpg')
        )
        for (const file of files) {
          imagePaths.push(`${group}/${personDirectory}/${file}`)
          imageDataBuffers.push(readFileSync(join(personPath, file)))
        }
      } catch {
        /* skip non-directories */
      }
    }
  }
  console.error(`[embed] ${model}: ${imagePaths.length} images`)

  const outputFilePath = join(outputDirectory, `${model}.json`)

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

    const embeddings: Record<string, number[]> = {}
    for (let i = 0; i < imagePaths.length; i++) {
      try {
        const tensor = human.tf.node.decodeImage(imageDataBuffers[i], 3)
        const detection = await human.detect(tensor)
        tensor.dispose()
        if (detection.face?.[0]?.embedding)
          embeddings[imagePaths[i]] = Array.from(detection.face[0].embedding)
      } catch {
        /* skip */
      }
      if (i % 100 === 0)
        console.error(`[embed] ${model}: ${i}/${imagePaths.length}`)
    }
    writeFileSync(outputFilePath, JSON.stringify(embeddings), 'utf-8')
    console.error(
      `[embed] ${model}: ${Object.keys(embeddings).length} embeddings`
    )
    return
  }

  const { FaceRecognitionService } = require('../apps/backend/src/services/face-recognition')
  const service = new FaceRecognitionService()
  await service.init()
  const approach = getArg('approach')
  const config = JSON.parse(getArg('config'))
  await service.loadModel(model, approach, config)
  console.error(`[embed] ${model} ready`)

  const embeddings: Record<string, number[]> = {}
  for (let i = 0; i < imagePaths.length; i++) {
    try {
      const comparisonResult = await service.getEmbedding(
        imageDataBuffers[i],
        model
      )
      embeddings[imagePaths[i]] = Array.from(comparisonResult.embedding)
    } catch {
      /* skip */
    }
    if (i % 100 === 0)
      console.error(`[embed] ${model}: ${i}/${imagePaths.length}`)
  }
  writeFileSync(outputFilePath, JSON.stringify(embeddings), 'utf-8')
  await service.shutdown()
  console.error(
    `[embed] ${model}: ${Object.keys(embeddings).length} embeddings`
  )
}

main().catch((error: Error) => {
  console.error(`FATAL: ${error.message}`)
  process.exit(1)
})
