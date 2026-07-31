import { describe, it, expect, beforeAll, vi } from 'vitest'
import * as ort from 'onnxruntime-node'
import {
  DETECTOR_MODEL_NAME,
  ONNXProvider,
  RECOGNITION_MODEL_NAME
} from '../src/services/face-recognition/onnx-provider'
import { ARC_FACE_DESTINATION_LANDMARKS } from '../src/services/face-recognition/face-detection'
import sharp from 'sharp'

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: vi.fn(() => true) }
})

const ortMocks = vi.hoisted(() => {
  const detSession = {
    inputNames: ['input.1'],
    outputNames: ['443'],
    run: vi.fn()
  }
  const recSession = {
    inputNames: ['input.1'],
    outputNames: ['516'],
    run: vi.fn()
  }
  return {
    detSession,
    recSession,
    createSession: vi.fn((path: string) =>
      Promise.resolve(path.includes('det_500m') ? detSession : recSession)
    )
  }
})

vi.mock('onnxruntime-node', async importOriginal => {
  const actual = await importOriginal<typeof import('onnxruntime-node')>()
  return { ...actual, InferenceSession: { create: ortMocks.createSession } }
})

function buildDetectorResults(): Record<string, ort.Tensor> {
  const stride8Scores = new Float32Array(12_800).fill(0)
  const stride8Boxes = new Float32Array(12_800 * 4).fill(0)
  const stride8Kps = new Float32Array(12_800 * 10).fill(0)
  stride8Scores[1620] = 0.9
  stride8Boxes.set([10, 10, 10, 10], 1620 * 4)
  stride8Kps.set([0, 0, 2, 1, 4, 2, 6, 3, 8, 4], 1620 * 10)

  const stride16Scores = new Float32Array(3_200).fill(0)
  const stride16Boxes = new Float32Array(3_200 * 4).fill(0)
  const stride16Kps = new Float32Array(3_200 * 10).fill(0)
  stride16Scores[410] = 0.8
  stride16Boxes.set([5, 5, 5, 5], 410 * 4)

  const stride32Scores = new Float32Array(800).fill(0)
  const stride32Boxes = new Float32Array(800 * 4).fill(0)
  const stride32Kps = new Float32Array(800 * 10).fill(0)

  return {
    '443': new ort.Tensor('float32', stride8Scores, [12_800, 1]),
    '446': new ort.Tensor('float32', stride8Boxes, [12_800, 4]),
    '449': new ort.Tensor('float32', stride8Kps, [12_800, 10]),
    '468': new ort.Tensor('float32', stride16Scores, [3_200, 1]),
    '471': new ort.Tensor('float32', stride16Boxes, [3_200, 4]),
    '474': new ort.Tensor('float32', stride16Kps, [3_200, 10]),
    '493': new ort.Tensor('float32', stride32Scores, [800, 1]),
    '496': new ort.Tensor('float32', stride32Boxes, [800, 4]),
    '499': new ort.Tensor('float32', stride32Kps, [800, 10])
  }
}

describe('ONNXProvider', () => {
  let provider: ONNXProvider
  let testImage: Buffer

  beforeAll(async () => {
    provider = new ONNXProvider()

    // Create a test image (100x100 RGB)
    testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 128, g: 64, b: 192 }
      }
    })
      .png()
      .toBuffer()
  })

  describe('preprocess', () => {
    it('should resize image to 112x112', async () => {
      const tensor = await provider.preprocess(testImage)

      expect(tensor.dims).toEqual([1, 3, 112, 112])
    })

    it('should normalize pixel values to [-1, 1]', async () => {
      const tensor = await provider.preprocess(testImage)
      const data = tensor.data as Float32Array

      // Check that all values are in [-1, 1] range
      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(-1.0)
        expect(data[i]).toBeLessThanOrEqual(1.0)
      }
    })

    it('should convert RGB to CHW format', async () => {
      const tensor = await provider.preprocess(testImage)
      const data = tensor.data as Float32Array

      // Tensor should have shape [1, 3, 112, 112]
      // Channel 0 (R) should be at indices 0 to 112*112-1
      // Channel 1 (G) should be at indices 112*112 to 2*112*112-1
      // Channel 2 (B) should be at indices 2*112*112 to 3*112*112-1

      expect(data.length).toBe(3 * 112 * 112)
    })

    it('should handle different input image sizes', async () => {
      const smallImage = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      })
        .png()
        .toBuffer()

      const tensor = await provider.preprocess(smallImage)
      expect(tensor.dims).toEqual([1, 3, 112, 112])
    })

    it('should handle images with alpha channel', async () => {
      const imageWithAlpha = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 128, g: 64, b: 192, alpha: 0.8 }
        }
      })
        .png()
        .toBuffer()

      const tensor = await provider.preprocess(imageWithAlpha)
      expect(tensor.dims).toEqual([1, 3, 112, 112])
    })

    it('should throw error for invalid image data', async () => {
      const invalidImage = Buffer.from('not an image')

      await expect(provider.preprocess(invalidImage)).rejects.toThrow(
        'Image preprocessing failed'
      )
    })
  })

  describe('model management', () => {
    it('should track loaded models', async () => {
      const models = provider.listModels()
      expect(Array.isArray(models)).toBe(true)
    })

    it('should check if model is loaded', () => {
      expect(provider.hasModel('nonexistent')).toBe(false)
    })

    it('should return null metrics for unloaded model', () => {
      const metrics = provider.getMetrics('nonexistent')
      expect(metrics).toBeNull()
    })
  })

  describe('detectFaces', () => {
    let provider: ONNXProvider
    let detectImage: Buffer

    beforeAll(async () => {
      provider = new ONNXProvider()
      await provider.loadModel(
        DETECTOR_MODEL_NAME,
        'models/insightface/det_500m.onnx',
        {
          name: DETECTOR_MODEL_NAME,
          embeddingSize: 0,
          landmarks: 5,
          speed: 0
        }
      )
      detectImage = await sharp({
        create: {
          width: 200,
          height: 100,
          channels: 3,
          background: { r: 128, g: 64, b: 192 }
        }
      })
        .png()
        .toBuffer()
    })

    it('letterboxes to [1,3,640,640] normalized (v-127.5)/128 and returns decoded NMS faces scaled to original coords', async () => {
      const detResults = buildDetectorResults()
      let capturedFeed: Record<string, ort.Tensor> | undefined
      ortMocks.detSession.run.mockImplementation(
        async (feeds: Record<string, ort.Tensor>) => {
          capturedFeed = feeds
          return detResults
        }
      )

      const faces = await provider.detectFaces(detectImage)

      const feed = capturedFeed!['input.1']
      const feedData = feed.data as Float32Array
      expect(feed.dims).toEqual([1, 3, 640, 640])

      // content pixel (0,0): solid 128/64/192 normalized as (v-127.5)/128
      expect(feedData[0]).toBeCloseTo((128 - 127.5) / 128, 5)
      expect(feedData[640 * 640]).toBeCloseTo((64 - 127.5) / 128, 5)
      expect(feedData[2 * 640 * 640]).toBeCloseTo((192 - 127.5) / 128, 5)

      // letterbox zero-pad rows map to (0 - 127.5) / 128
      const paddedIndex = 400 * 640
      expect(feedData[paddedIndex]).toBeCloseTo(-127.5 / 128, 5)

      // stride-8 face [0,0,160,160] at det_scale 3.2 -> [0,0,50,50];
      // the overlapping stride-16 duplicate is suppressed by NMS
      expect(faces).toHaveLength(1)
      expect(faces[0].score).toBeCloseTo(0.9, 5)
      expect(faces[0].bbox).toEqual([0, 0, 50, 50])
      expect(faces[0].landmarks).toEqual([
        [25, 25],
        [30, 27.5],
        [35, 30],
        [40, 32.5],
        [45, 35]
      ])
    })

    it('filters low-score candidates with opts.detThresh', async () => {
      ortMocks.detSession.run.mockResolvedValue(buildDetectorResults())

      const faces = await provider.detectFaces(detectImage, {
        detThresh: 0.85
      })

      // stride-8 survivor at 0.9 keeps; stride-16 candidate at 0.8 drops
      expect(faces).toHaveLength(1)
      expect(faces[0].score).toBeCloseTo(0.9, 5)
    })

    it('returns an empty list when no candidate clears detThresh', async () => {
      const emptyResults = buildDetectorResults()
      emptyResults['443'].data[1620] = 0
      emptyResults['468'].data[410] = 0
      ortMocks.detSession.run.mockResolvedValue(emptyResults)

      const faces = await provider.detectFaces(detectImage)

      expect(faces).toHaveLength(0)
    })
  })

  describe('getAlignedEmbedding', () => {
    let provider: ONNXProvider
    let alignImage: Buffer

    beforeAll(async () => {
      provider = new ONNXProvider()
      await provider.loadModel(
        RECOGNITION_MODEL_NAME,
        'models/insightface/w600k_mbf.onnx',
        {
          name: RECOGNITION_MODEL_NAME,
          embeddingSize: 512,
          landmarks: 0,
          speed: 0
        }
      )
      alignImage = await sharp({
        create: {
          width: 112,
          height: 112,
          channels: 3,
          background: { r: 200, g: 100, b: 50 }
        }
      })
        .png()
        .toBuffer()
    })

    it('warps to 112x112 and feeds a [1,3,112,112] tensor normalized (v/127.5-1.0)', async () => {
      const embedding512 = new Float32Array(512).fill(0.25)
      let capturedFeed: Record<string, ort.Tensor> | undefined
      ortMocks.recSession.run.mockImplementation(
        async (feeds: Record<string, ort.Tensor>) => {
          capturedFeed = feeds
          return {
            '516': new ort.Tensor('float32', embedding512, [1, 512])
          }
        }
      )

      const embedding = await provider.getAlignedEmbedding(
        alignImage,
        ARC_FACE_DESTINATION_LANDMARKS,
        RECOGNITION_MODEL_NAME
      )

      const feed = capturedFeed!['input.1']
      const feedData = feed.data as Float32Array
      expect(feed.dims).toEqual([1, 3, 112, 112])

      // mid pixel (56,56): solid 200/100/50 normalized as v/127.5 - 1.0
      const midPixel = 56 * 112 + 56
      expect(feedData[midPixel]).toBeCloseTo(200 / 127.5 - 1, 5)
      expect(feedData[112 * 112 + midPixel]).toBeCloseTo(100 / 127.5 - 1, 5)
      expect(feedData[2 * 112 * 112 + midPixel]).toBeCloseTo(50 / 127.5 - 1, 5)

      expect(embedding).toHaveLength(512)
    })

    it('throws when landmarks are degenerate (no similarity transform)', async () => {
      const degenerate: [number, number][] = [
        [10, 10],
        [10, 10],
        [10, 10],
        [10, 10],
        [10, 10]
      ]

      await expect(
        provider.getAlignedEmbedding(
          alignImage,
          degenerate,
          RECOGNITION_MODEL_NAME
        )
      ).rejects.toThrow(/similarity transform/)
    })
  })
})
