import {
  DEFAULT_VERIFY_THRESHOLD,
  MAX_STORED_PHOTOS,
  VERIFY_FETCH_TIMEOUT_MS
} from 'config/constants'
import type { FaceDetection } from './onnx-provider'
import {
  DETECTOR_MODEL_NAME,
  ONNXProvider,
  RECOGNITION_MODEL_NAME
} from './onnx-provider'
import { PythonManager } from './python-manager'

export { DEFAULT_VERIFY_THRESHOLD, MAX_STORED_PHOTOS, VERIFY_FETCH_TIMEOUT_MS }

const DETECTOR_MODEL_PATH = 'models/insightface/det_500m.onnx'
const RECOGNITION_MODEL_PATH = 'models/insightface/w600k_mbf.onnx'

export interface VerifyStoredPhoto {
  name: string
  url: string
}

export interface VerifyResult {
  match: boolean
  name?: string
  similarity?: number
  reason?: 'no-face' | 'no-match' | 'match'
}

export interface ModelInfo {
  name: string
  approach: 'onnx' | 'python'
  embeddingSize: number
  landmarks?: number
  speed?: number
}

export interface CompareResult {
  similarity: number
  model: string
  approach: 'onnx' | 'python'
  latency: number
}

export interface EmbeddingResult {
  embedding: Float32Array
  model: string
  approach: 'onnx' | 'python'
  latency: number
}

export interface ModelMetrics {
  avgLatency: number
  requestCount: number
  approach: 'onnx' | 'python'
}

export class FaceRecognitionService {
  private onnxProvider: ONNXProvider
  private pythonManager: PythonManager
  private modelRegistry: Map<string, 'onnx' | 'python'> = new Map()
  private initialized: boolean = false
  private mode: 'onnx' | 'hybrid' = 'hybrid'

  constructor() {
    this.onnxProvider = new ONNXProvider()
    this.pythonManager = new PythonManager()
  }

  /**
   * Initializes the face recognition service
   *
   * In 'hybrid' mode (default) starts the Python process and prepares both
   * providers for use. In 'onnx' mode loads the detector and recognizer once
   * without spawning Python, keeping Python available for benchmark scripts.
   * Must be called before any other operations.
   */
  async init(opts: { mode?: 'onnx' | 'hybrid' } = {}): Promise<void> {
    if (this.initialized) {
      throw new Error('FaceRecognitionService already initialized')
    }

    this.mode = opts.mode ?? 'hybrid'
    console.log(
      `[FaceRecognitionService] Initializing service (mode: ${this.mode})...`
    )

    if (this.mode === 'onnx') {
      await this.onnxProvider.loadModel(
        DETECTOR_MODEL_NAME,
        DETECTOR_MODEL_PATH,
        {
          name: DETECTOR_MODEL_NAME,
          embeddingSize: 0,
          landmarks: 5,
          speed: 0
        }
      )
      await this.onnxProvider.loadModel(
        RECOGNITION_MODEL_NAME,
        RECOGNITION_MODEL_PATH,
        {
          name: RECOGNITION_MODEL_NAME,
          embeddingSize: 512,
          landmarks: 0,
          speed: 0
        }
      )
      this.modelRegistry.set(DETECTOR_MODEL_NAME, 'onnx')
      this.modelRegistry.set(RECOGNITION_MODEL_NAME, 'onnx')
      this.initialized = true
      console.log('[FaceRecognitionService] Service initialized (onnx mode)')
      return
    }

    // Start Python process
    try {
      await this.pythonManager.start()
      console.log('[FaceRecognitionService] Python process started')
    } catch (error) {
      throw new Error(
        `Failed to start Python process: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    this.initialized = true
    console.log('[FaceRecognitionService] Service initialized successfully')
  }

  /**
   * Shuts down the face recognition service
   *
   * Releases ONNX sessions in onnx mode. In hybrid mode stops the Python
   * process. Always clears the model registry.
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return
    }

    console.log('[FaceRecognitionService] Shutting down service...')

    if (this.mode === 'onnx') {
      await this.onnxProvider.unloadModel(DETECTOR_MODEL_NAME)
      await this.onnxProvider.unloadModel(RECOGNITION_MODEL_NAME)
    } else {
      try {
        await this.pythonManager.stop()
        console.log('[FaceRecognitionService] Python process stopped')
      } catch (error) {
        console.error(
          `[FaceRecognitionService] Error stopping Python process: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    this.modelRegistry.clear()
    this.initialized = false
    console.log('[FaceRecognitionService] Service shut down')
  }

  /**
   * Lists all available models from both providers
   *
   * Combines models from ONNXProvider and PythonManager into a unified list.
   */
  async listModels(): Promise<ModelInfo[]> {
    this.ensureInitialized()

    const models: ModelInfo[] = []

    // Get ONNX models
    const onnxModels = this.onnxProvider.listModels()
    for (const model of onnxModels) {
      models.push({
        name: model.name,
        approach: 'onnx',
        embeddingSize: model.embeddingSize,
        landmarks: model.landmarks,
        speed: model.speed
      })
    }

    // Get Python models (only when hybrid mode has a live Python process)
    if (this.mode === 'hybrid' && this.pythonManager.isReady()) {
      const pythonModelNames = await this.pythonManager.listModels()
      for (const modelName of pythonModelNames) {
        // Python models have embedding size 128 (dlib) by default
        // TODO: Get actual metadata from Python process
        models.push({
          name: modelName,
          approach: 'python',
          embeddingSize: 128
        })
      }
    }

    return models
  }

  /**
   * Loads a face recognition model
   *
   * Routes to the correct provider based on the approach type.
   *
   * @param name - Unique model name
   * @param approach - Provider type ('onnx' or 'python')
   * @param config - Model configuration
   *   For ONNX: { path: string, embeddingSize: number, landmarks?: number }
   *   For Python: { type: string, path: string }
   */
  async loadModel(
    name: string,
    approach: 'onnx' | 'python',
    config: {
      path: string
      embeddingSize?: number
      landmarks?: number
      type?: string
    }
  ): Promise<void> {
    this.ensureInitialized()

    if (approach === 'onnx') {
      await this.onnxProvider.loadModel(name, config.path, {
        name,
        embeddingSize: config.embeddingSize ?? 512,
        landmarks: config.landmarks ?? 0,
        speed: 0
      })
    } else {
      await this.pythonManager.loadModel(name, {
        type: config.type ?? 'dlib',
        path: config.path
      })
    }

    this.modelRegistry.set(name, approach)
  }

  /**
   * Checks if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Gets the face embedding from an image using the specified model
   *
   * Automatically determines whether to use ONNX or Python based on the model.
   *
   * @param image - Image buffer
   * @param modelName - Model name to use
   * @returns Embedding result with latency measurement
   */
  async getEmbedding(
    image: Buffer,
    modelName: string
  ): Promise<EmbeddingResult> {
    this.ensureInitialized()

    const startTime = performance.now()
    const approach = this.determineApproach(modelName)

    let embedding: Float32Array

    if (approach === 'onnx') {
      embedding = await this.onnxProvider.getEmbedding(image, modelName)
    } else {
      if (!this.pythonManager.isReady()) {
        throw new Error(
          `Python process not started. Model '${modelName}' requires the hybrid backend; initialize with mode 'hybrid'.`
        )
      }
      // Convert buffer to base64 for Python
      const imageBase64 = image.toString('base64')
      const embeddingArray = await this.pythonManager.getEmbedding(
        imageBase64,
        modelName
      )
      embedding = new Float32Array(embeddingArray)
    }

    const latency = performance.now() - startTime

    return {
      embedding,
      model: modelName,
      approach,
      latency
    }
  }

  /**
   * Compares two face images using the specified model
   *
   * Gets embeddings for both images and calculates cosine similarity.
   *
   * @param image1 - First image buffer
   * @param image2 - Second image buffer
   * @param modelName - Model name to use
   * @returns Comparison result with similarity score and latency
   */
  async compare(
    image1: Buffer,
    image2: Buffer,
    modelName: string
  ): Promise<CompareResult> {
    this.ensureInitialized()

    const startTime = performance.now()

    const [result1, result2] = await Promise.all([
      this.getEmbedding(image1, modelName),
      this.getEmbedding(image2, modelName)
    ])

    const similarity = this.calculateSimilarity(
      result1.embedding,
      result2.embedding
    )
    const latency = performance.now() - startTime

    return {
      similarity,
      model: modelName,
      approach: result1.approach,
      latency
    }
  }

  /**
   * Verifies a probe image against stored user photos
   *
   * Detects and embeds the highest-scoring probe face, then compares it
   * against each stored photo (downloaded in parallel with a per-fetch
   * timeout, capped at `maxPhotos`, default `MAX_STORED_PHOTOS`), returning
   * the first cosine similarity at or above the threshold.
   *
   * @param image - Probe image buffer
   * @param storedPhotos - Stored user photos to compare against
   * @param opts - Options with an optional similarity threshold and max photos
   * @returns Verify result with match flag and reason
   */
  async verify(
    image: Buffer,
    storedPhotos: VerifyStoredPhoto[],
    opts: { threshold?: number; maxPhotos?: number } = {}
  ): Promise<VerifyResult> {
    this.ensureInitialized()

    const threshold = opts.threshold ?? DEFAULT_VERIFY_THRESHOLD
    const maxPhotos = opts.maxPhotos ?? MAX_STORED_PHOTOS

    let probeEmbedding: Float32Array
    try {
      const probeFaces = await this.onnxProvider.detectFaces(image)
      if (probeFaces.length === 0) {
        console.log(
          '[FaceRecognitionService] verify: no face detected in probe image'
        )
        return { match: false, reason: 'no-face' }
      }

      const probeFace = this.selectHighestScoringFace(probeFaces)
      probeEmbedding = await this.onnxProvider.getAlignedEmbedding(
        image,
        probeFace.landmarks,
        RECOGNITION_MODEL_NAME
      )
    } catch (error) {
      console.warn(
        `[FaceRecognitionService] verify: failed to process probe image: ${error instanceof Error ? error.message : String(error)}`
      )
      return { match: false, reason: 'no-face' }
    }

    let bestSimilarity = -Infinity
    let comparedAny = false

    const storedCandidates = storedPhotos.slice(0, maxPhotos)

    const downloadedPhotos = await Promise.allSettled(
      storedCandidates.map(async photo => {
        const controller = new AbortController()
        const timer = setTimeout(
          () => controller.abort(),
          VERIFY_FETCH_TIMEOUT_MS
        )
        try {
          const response = await fetch(photo.url, {
            signal: controller.signal
          })
          if (!response.ok) {
            console.warn(
              `[FaceRecognitionService] verify: failed to fetch stored photo ${photo.url} (status ${response.status})`
            )
            return null
          }
          return {
            photo,
            storedImage: Buffer.from(await response.arrayBuffer())
          }
        } catch (error) {
          console.warn(
            `[FaceRecognitionService] verify: error fetching stored photo ${photo.url}: ${error instanceof Error ? error.message : String(error)}`
          )
          return null
        } finally {
          clearTimeout(timer)
        }
      })
    )

    for (const result of downloadedPhotos) {
      if (result.status === 'rejected' || !result.value) continue
      const { photo, storedImage } = result.value

      let storedEmbedding: Float32Array
      try {
        const storedFaces = await this.onnxProvider.detectFaces(storedImage)
        if (storedFaces.length === 0) {
          console.log(
            `[FaceRecognitionService] verify: no face detected in stored photo for ${photo.name}`
          )
          continue
        }

        const storedFace = this.selectHighestScoringFace(storedFaces)
        storedEmbedding = await this.onnxProvider.getAlignedEmbedding(
          storedImage,
          storedFace.landmarks,
          RECOGNITION_MODEL_NAME
        )
      } catch (error) {
        console.warn(
          `[FaceRecognitionService] verify: failed to process stored photo ${photo.name}: ${error instanceof Error ? error.message : String(error)}`
        )
        continue
      }

      const similarity = this.calculateSimilarity(
        probeEmbedding,
        storedEmbedding
      )
      comparedAny = true
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity
      }

      if (similarity >= threshold) {
        console.log(
          `[FaceRecognitionService] verify: match for ${photo.name} (similarity ${similarity.toFixed(4)})`
        )
        return {
          match: true,
          name: photo.name,
          similarity,
          reason: 'match'
        }
      }
    }

    console.log(
      `[FaceRecognitionService] verify: no match (best similarity ${comparedAny ? bestSimilarity.toFixed(4) : 'none'})`
    )
    return comparedAny
      ? { match: false, similarity: bestSimilarity, reason: 'no-match' }
      : { match: false, reason: 'no-match' }
  }

  /**
   * Picks the most confident face detection from a list
   *
   * @param faces - Detected faces, expected to be non-empty
   * @returns The face with the highest score
   */
  private selectHighestScoringFace(faces: FaceDetection[]): FaceDetection {
    return faces.reduce((best, face) => (face.score > best.score ? face : best))
  }

  /**
   * Calculates cosine similarity between two embeddings
   *
   * @param embedding1 - First embedding
   * @param embedding2 - Second embedding
   * @returns Similarity score between -1 and 1
   */
  calculateSimilarity(
    embedding1: Float32Array,
    embedding2: Float32Array
  ): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error(
        `Embedding size mismatch: ${embedding1.length} vs ${embedding2.length}`
      )
    }

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      norm1 += embedding1[i] * embedding1[i]
      norm2 += embedding2[i] * embedding2[i]
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2)

    if (magnitude === 0) {
      return 0
    }

    return dotProduct / magnitude
  }

  /**
   * Gets performance metrics for a specific model
   *
   * Combines metrics from both ONNX and Python providers.
   *
   * @param modelName - Model name
   * @returns Model metrics or null if no data available
   */
  getMetrics(modelName: string): ModelMetrics | null {
    this.ensureInitialized()

    const approach = this.determineApproach(modelName)

    if (approach === 'onnx') {
      const metrics = this.onnxProvider.getMetrics(modelName)
      if (!metrics) return null

      return {
        avgLatency: metrics.avgLatency,
        requestCount: metrics.requestCount,
        approach: 'onnx'
      }
    } else {
      const metrics = this.pythonManager.getMetrics(modelName)
      if (!metrics) return null

      return {
        avgLatency: metrics.avgLatency,
        requestCount: metrics.requestCount,
        approach: 'python'
      }
    }
  }

  /**
   * Determines which approach to use for a model (ONNX or Python)
   *
   * Checks the model registry first, then defaults to ONNX if the model
   * is loaded in ONNXProvider, otherwise Python.
   */
  private determineApproach(modelName: string): 'onnx' | 'python' {
    // Check registry first
    const registered = this.modelRegistry.get(modelName)
    if (registered) {
      return registered
    }

    // Check if model is loaded in ONNX provider
    if (this.onnxProvider.hasModel(modelName)) {
      this.modelRegistry.set(modelName, 'onnx')
      return 'onnx'
    }

    // Default to Python
    this.modelRegistry.set(modelName, 'python')
    return 'python'
  }

  /**
   * Ensures the service is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'FaceRecognitionService not initialized. Call init() first.'
      )
    }
  }
}

/**
 * Shared FaceRecognitionService instance
 *
 * The server owns the lifecycle (init in start, shutdown in stop) and
 * consumers such as UserServices use this same initialized instance.
 */
export const faceRecognitionService = new FaceRecognitionService()
