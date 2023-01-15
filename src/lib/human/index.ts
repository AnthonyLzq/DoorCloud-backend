import { Human, Config } from '@vladmandic/human'
import { FastifyBaseLogger } from 'fastify'

import { CustomError } from 'network/http'

declare global {
  // eslint-disable-next-line no-var
  var __human__: Human
}

const humanConfig: Partial<Config> = {
  debug: false,
  face: { emotion: { enabled: false } },
  body: { enabled: false },
  hand: { enabled: false },
  gesture: { enabled: false },
  modelBasePath: process.env.MODELS_CDN_URL
}

const init = async (log: FastifyBaseLogger) => {
  if (!global.__human__) {
    log.info({}, 'Initializing human')
    global.__human__ = new Human(humanConfig)
    await global.__human__.tf.ready()
    await global.__human__.load()
    log.info({}, 'Human initialized')
  }
}

const detectFromBuffer = async (input: Buffer) => {
  const tensor = global.__human__.tf.node.decodeImage(input, 3)
  const result = await global.__human__.detect(tensor, humanConfig)

  global.__human__.tf.dispose(tensor)

  return result
}

const detectFromUrl = async (input: string) => {
  const res = await fetch(input)

  if (res && res.ok) {
    const buffer = Buffer.from(await res.arrayBuffer())
    const tensor = global.__human__.tf.node.decodeImage(buffer, 3)
    const result = await global.__human__.detect(tensor, humanConfig)

    global.__human__.tf.dispose(tensor)

    return result
  }

  throw new CustomError('Could not fetch image')
}

const compareFaces = async (
  bufferImage: Buffer,
  urlImage: string,
  name: string,
  log: FastifyBaseLogger
) => {
  await init(log)

  const [res1, res2] = await Promise.all([
    detectFromBuffer(bufferImage),
    detectFromUrl(urlImage)
  ])

  if (
    !res1 ||
    !res1.face ||
    res1.face.length === 0 ||
    !res1.face[0].embedding ||
    !res2 ||
    !res2.face ||
    res2.face.length === 0 ||
    !res2.face[0].embedding
  )
    throw new CustomError('Could not detect face descriptors')

  const similarity = global.__human__.match.similarity(
    res1.face[0].embedding,
    res2.face[0].embedding,
    { order: 2 }
  )
  const result = {
    match: similarity > 0.5,
    name
  }

  log.info(result, 'Similarity result')

  return result
}

export { init, compareFaces }
