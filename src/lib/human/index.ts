import { type Config, Human } from '@vladmandic/human'
import { getEnv } from 'config/env'
import type { FastifyBaseLogger } from 'fastify'
import { CustomError } from 'network/http'

declare global {
  // eslint-disable-next-line no-var
  var __human__: Human
}

const getHumanConfig = (): Partial<Config> => ({
  debug: false,
  face: { emotion: { enabled: false } },
  body: { enabled: false },
  hand: { enabled: false },
  gesture: { enabled: false },
  modelBasePath: getEnv().MODELS_CDN_URL
})

const init = async (log: FastifyBaseLogger) => {
  if (!global.__human__) {
    log.info({}, 'Initializing human')
    const humanConfig = getHumanConfig()

    global.__human__ = new Human(humanConfig)
    await global.__human__.tf.ready()
    await global.__human__.load()
    log.info({}, 'Human initialized')
  }
}

const detectFromBuffer = async (input: Buffer) => {
  const humanConfig = getHumanConfig()
  const tensor = global.__human__.tf.node.decodeImage(input, 3)
  const result = await global.__human__.detect(tensor, humanConfig)

  return result
}

const detectFromUrl = async (input: string) => {
  const res = await fetch(input)

  if (res?.ok) {
    const buffer = Buffer.from(await res.arrayBuffer())

    return await detectFromBuffer(buffer)
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
    !res1?.face ||
    res1.face.length === 0 ||
    !res1.face[0].embedding ||
    !res2 ||
    !res2.face ||
    res2.face.length === 0 ||
    !res2.face[0].embedding
  ) {
    log.error({}, 'Could not compare faces')

    return { match: false, name }
  }

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

export { compareFaces, init }
