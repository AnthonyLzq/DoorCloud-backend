import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DETECTOR_MODEL_NAME,
  ONNXProvider,
  RECOGNITION_MODEL_NAME
} from '../src/services/face-recognition/onnx-provider'

const DETECTOR_MODEL_PATH = 'models/insightface/det_500m.onnx'
const RECOGNITION_MODEL_PATH = 'models/insightface/w600k_mbf.onnx'
const LFW_IMAGE_PATH = 'datasets/lfw/Aaron_Eckhart/Aaron_Eckhart_0001.jpg'

const assetsAvailable =
  existsSync(resolve(DETECTOR_MODEL_PATH)) &&
  existsSync(resolve(RECOGNITION_MODEL_PATH)) &&
  existsSync(resolve(LFW_IMAGE_PATH))

describe.skipIf(!assetsAvailable)('ONNXProvider real-model pipeline', () => {
  let provider: ONNXProvider

  beforeAll(async () => {
    provider = new ONNXProvider()
    await provider.loadModel(DETECTOR_MODEL_NAME, DETECTOR_MODEL_PATH, {
      name: DETECTOR_MODEL_NAME,
      embeddingSize: 0,
      landmarks: 5,
      speed: 0
    })
    await provider.loadModel(RECOGNITION_MODEL_NAME, RECOGNITION_MODEL_PATH, {
      name: RECOGNITION_MODEL_NAME,
      embeddingSize: 512,
      landmarks: 0,
      speed: 0
    })
  })

  it('detects a single face with five landmarks on a real LFW image', async () => {
    const image = await readFile(LFW_IMAGE_PATH)
    const faces = await provider.detectFaces(image)

    expect(faces).toHaveLength(1)
    expect(faces[0].score).toBeGreaterThan(0.5)
    expect(faces[0].landmarks).toHaveLength(5)
    expect(faces[0].bbox[2]).toBeGreaterThan(faces[0].bbox[0])
    expect(faces[0].bbox[3]).toBeGreaterThan(faces[0].bbox[1])
  })

  it('re-embeds the warped crop into a 512-dim embedding', async () => {
    const image = await readFile(LFW_IMAGE_PATH)
    const faces = await provider.detectFaces(image)
    expect(faces).toHaveLength(1)

    const embedding = await provider.getAlignedEmbedding(
      image,
      faces[0].landmarks,
      RECOGNITION_MODEL_NAME
    )

    expect(embedding.length).toBe(512)
  })
})
