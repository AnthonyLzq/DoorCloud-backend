import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as ort from 'onnxruntime-node'
import sharp from 'sharp'

export interface ONNXModelMetadata {
  name: string
  embeddingSize: number
  landmarks: number
  approach: 'onnx'
  speed: number
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
