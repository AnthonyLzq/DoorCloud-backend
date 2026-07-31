import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as ort from 'onnxruntime-node'
import sharp from 'sharp'
import type { DecodedFace } from './face-detection'
import {
  ARC_FACE_DESTINATION_LANDMARKS,
  DEFAULT_DETECTION_THRESHOLD,
  DEFAULT_NMS_THRESHOLD,
  decodeOutputs,
  estimateSimilarityTransform,
  nonMaximumSuppression,
  warpAffine
} from './face-detection'

export interface ONNXModelMetadata {
  name: string
  embeddingSize: number
  landmarks: number
  approach: 'onnx'
  speed: number
}

/**
 * InsightFace Buffalo-S is a model PACK, not a single file.
 * Both models are required for the verification pipeline:
 * - det_500m  : SCRFD detector — locates the face and returns 5 facial
 *               landmarks used to align the crop (no embedding).
 * - w600k_mbf : MobileFaceNet recognizer — ArcFace 512D embedding from the
 *               aligned 112x112 crop.
 * The benchmark used only the recognizer with center-crop because its
 * datasets are pre-aligned; production photos are not, hence the detector.
 */
export const DETECTOR_MODEL_NAME = 'det_500m'
export const RECOGNITION_MODEL_NAME = 'w600k_mbf'

export const DETECTOR_INPUT_SIZE = { width: 640, height: 640 } as const

export const DETECTOR_OUTPUT_NAMES: ReadonlyArray<{
  stride: number
  scores: string
  boxes: string
  landmarks: string
}> = [
  { stride: 8, scores: '443', boxes: '446', landmarks: '449' },
  { stride: 16, scores: '468', boxes: '471', landmarks: '474' },
  { stride: 32, scores: '493', boxes: '496', landmarks: '499' }
]

export type FaceDetection = DecodedFace

const WARP_OUTPUT_WIDTH = 112
const WARP_OUTPUT_HEIGHT = 112

function computeLetterboxDimensions(
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number
): { resizedWidth: number; resizedHeight: number; detScale: number } {
  const imageRatio = height / width
  const targetRatio = targetHeight / targetWidth

  if (imageRatio > targetRatio) {
    const resizedHeight = targetHeight
    const resizedWidth = Math.round(resizedHeight / imageRatio)
    return { resizedWidth, resizedHeight, detScale: resizedHeight / height }
  }

  const resizedWidth = targetWidth
  const resizedHeight = Math.round(resizedWidth * imageRatio)
  return { resizedWidth, resizedHeight, detScale: resizedHeight / height }
}

function buildDetectorInput(
  paddedRgb: Uint8Array,
  targetWidth: number,
  targetHeight: number
): ort.Tensor {
  const channelSize = targetWidth * targetHeight
  const float32Data = new Float32Array(3 * channelSize)

  for (let i = 0; i < channelSize; i++) {
    float32Data[i] = (paddedRgb[i * 3] - 127.5) / 128
    float32Data[channelSize + i] = (paddedRgb[i * 3 + 1] - 127.5) / 128
    float32Data[2 * channelSize + i] = (paddedRgb[i * 3 + 2] - 127.5) / 128
  }

  return new ort.Tensor('float32', float32Data, [
    1,
    3,
    targetWidth,
    targetHeight
  ])
}

function buildRecognitionInput(rgb112: Uint8Array): ort.Tensor {
  const channelSize = WARP_OUTPUT_WIDTH * WARP_OUTPUT_HEIGHT
  const float32Data = new Float32Array(3 * channelSize)

  for (let i = 0; i < channelSize; i++) {
    float32Data[i] = rgb112[i * 3] / 127.5 - 1.0
    float32Data[channelSize + i] = rgb112[i * 3 + 1] / 127.5 - 1.0
    float32Data[2 * channelSize + i] = rgb112[i * 3 + 2] / 127.5 - 1.0
  }

  return new ort.Tensor('float32', float32Data, [1, 3, 112, 112])
}

export class ONNXProvider {
  private models: Map<string, ort.InferenceSession> = new Map()
  private metadata: Map<string, ONNXModelMetadata> = new Map()
  private metrics: Map<string, { totalLatency: number; requestCount: number }> =
    new Map()

  async loadModel(
    name: string,
    modelPath: string,
    metadata: Omit<ONNXModelMetadata, 'approach'>
  ): Promise<void> {
    const absolutePath = resolve(process.cwd(), modelPath)

    if (!existsSync(absolutePath)) {
      throw new Error(`Model not found: ${modelPath}`)
    }

    try {
      const session = await ort.InferenceSession.create(absolutePath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all'
      })

      this.models.set(name, session)
      this.metadata.set(name, { ...metadata, approach: 'onnx' })
      this.metrics.set(name, { totalLatency: 0, requestCount: 0 })
    } catch (error) {
      throw new Error(
        `Failed to load model ${name}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  async getEmbedding(image: Buffer, modelName: string): Promise<Float32Array> {
    const session = this.models.get(modelName)
    if (!session) {
      throw new Error(`Model not loaded: ${modelName}`)
    }

    const startTime = performance.now()

    try {
      // Preprocess image
      const tensor = await this.preprocess(image)

      // Get input name from session
      const inputName = session.inputNames[0]

      // Run inference
      const feeds: Record<string, ort.Tensor> = {}
      feeds[inputName] = tensor
      const results = await session.run(feeds)

      // Get output (embedding)
      const outputName = session.outputNames[0]
      const output = results[outputName]

      if (!output?.data) {
        throw new Error('No output from model inference')
      }

      // Update metrics
      const latency = performance.now() - startTime
      const metric = this.metrics.get(modelName)!
      metric.totalLatency += latency
      metric.requestCount++

      // Update speed in metadata
      const meta = this.metadata.get(modelName)!
      meta.speed = metric.totalLatency / metric.requestCount

      return output.data as Float32Array
    } catch (error) {
      throw new Error(
        `Inference failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  async detectFaces(
    image: Buffer,
    opts: { detThresh?: number; nmsThresh?: number } = {}
  ): Promise<FaceDetection[]> {
    const session = this.models.get(DETECTOR_MODEL_NAME)
    if (!session) {
      throw new Error(`Model not loaded: ${DETECTOR_MODEL_NAME}`)
    }

    const detThresh = opts.detThresh ?? DEFAULT_DETECTION_THRESHOLD
    const nmsThresh = opts.nmsThresh ?? DEFAULT_NMS_THRESHOLD
    const targetWidth = DETECTOR_INPUT_SIZE.width
    const targetHeight = DETECTOR_INPUT_SIZE.height

    const { data, info } = await sharp(image)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const { width, height } = info

    const { resizedWidth, resizedHeight, detScale } =
      computeLetterboxDimensions(width, height, targetWidth, targetHeight)

    const resized = await sharp(data, {
      raw: { width, height, channels: 3 }
    })
      .resize(resizedWidth, resizedHeight, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer()

    const padded = new Uint8Array(targetWidth * targetHeight * 3)
    for (let y = 0; y < resizedHeight; y++) {
      padded.set(
        resized.subarray(y * resizedWidth * 3, (y + 1) * resizedWidth * 3),
        y * targetWidth * 3
      )
    }

    const inputName = session.inputNames[0]
    const feeds: Record<string, ort.Tensor> = {}
    feeds[inputName] = buildDetectorInput(padded, targetWidth, targetHeight)
    const results = await session.run(feeds)

    let decodedFaces: DecodedFace[] = []
    for (const outputGroup of DETECTOR_OUTPUT_NAMES) {
      const scoresData = results[outputGroup.scores].data as Float32Array
      const boxesData = results[outputGroup.boxes].data as Float32Array
      const landmarksData = results[outputGroup.landmarks].data as Float32Array
      decodedFaces = decodedFaces.concat(
        decodeOutputs(
          scoresData,
          boxesData,
          landmarksData,
          outputGroup.stride,
          DETECTOR_INPUT_SIZE,
          detThresh
        )
      )
    }

    return nonMaximumSuppression(decodedFaces, nmsThresh).map(face => ({
      bbox: [
        face.bbox[0] / detScale,
        face.bbox[1] / detScale,
        face.bbox[2] / detScale,
        face.bbox[3] / detScale
      ] as [number, number, number, number],
      score: face.score,
      landmarks: face.landmarks.map(([x, y]): [number, number] => [
        x / detScale,
        y / detScale
      ])
    }))
  }

  async getAlignedEmbedding(
    image: Buffer,
    landmarks: ReadonlyArray<readonly [number, number]>,
    modelName: string
  ): Promise<Float32Array> {
    const session = this.models.get(modelName)
    if (!session) {
      throw new Error(`Model not loaded: ${modelName}`)
    }

    const { data, info } = await sharp(image)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const { width, height } = info

    const matrix = estimateSimilarityTransform(
      landmarks,
      ARC_FACE_DESTINATION_LANDMARKS
    )
    if (!matrix) {
      throw new Error('Failed to estimate similarity transform from landmarks')
    }

    const warped = warpAffine(
      data,
      width,
      height,
      matrix,
      WARP_OUTPUT_WIDTH,
      WARP_OUTPUT_HEIGHT
    )

    const inputName = session.inputNames[0]
    const feeds: Record<string, ort.Tensor> = {}
    feeds[inputName] = buildRecognitionInput(warped)
    const results = await session.run(feeds)

    const outputName = session.outputNames[0]
    const output = results[outputName]
    if (!output?.data) {
      throw new Error('No output from model inference')
    }

    return output.data as Float32Array
  }

  async preprocess(image: Buffer): Promise<ort.Tensor> {
    try {
      // Resize to 112x112 and convert to raw pixel data
      const { data, info } = await sharp(image)
        .resize(112, 112, {
          fit: 'cover',
          position: 'center'
        })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      // Convert to Float32Array and normalize to [-1, 1]
      const float32Data = new Float32Array(3 * 112 * 112)

      // Sharp returns data in RGB order, interleaved
      // ONNX expects CHW format (Channel, Height, Width)
      const { width, height } = info

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelIndex = (y * width + x) * 3
          const r = data[pixelIndex]
          const g = data[pixelIndex + 1]
          const b = data[pixelIndex + 2]

          // Normalize to [-1, 1]
          float32Data[0 * height * width + y * width + x] = r / 127.5 - 1.0 // R channel
          float32Data[1 * height * width + y * width + x] = g / 127.5 - 1.0 // G channel
          float32Data[2 * height * width + y * width + x] = b / 127.5 - 1.0 // B channel
        }
      }

      // Create tensor with shape [1, 3, 112, 112]
      return new ort.Tensor('float32', float32Data, [1, 3, 112, 112])
    } catch (error) {
      throw new Error(
        `Image preprocessing failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  listModels(): ONNXModelMetadata[] {
    return Array.from(this.metadata.values())
  }

  hasModel(name: string): boolean {
    return this.models.has(name)
  }

  getMetrics(
    modelName: string
  ): { avgLatency: number; requestCount: number } | null {
    const metric = this.metrics.get(modelName)
    if (!metric || metric.requestCount === 0) {
      return null
    }

    return {
      avgLatency: metric.totalLatency / metric.requestCount,
      requestCount: metric.requestCount
    }
  }

  async unloadModel(name: string): Promise<void> {
    this.models.delete(name)
    this.metadata.delete(name)
    this.metrics.delete(name)
  }
}
