import { ONNXProvider } from './onnx-provider'
import { PythonManager } from './python-manager'

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

  constructor() {
    this.onnxProvider = new ONNXProvider()
    this.pythonManager = new PythonManager()
  }

  /**
   * Initializes the face recognition service
   *
   * Starts the Python process and prepares both providers for use.
   * Must be called before any other operations.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      throw new Error('FaceRecognitionService already initialized')
    }

    console.log('[FaceRecognitionService] Initializing service...')

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
   * Stops the Python process and releases all resources.
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return
    }

    console.log('[FaceRecognitionService] Shutting down service...')

    try {
      await this.pythonManager.stop()
      console.log('[FaceRecognitionService] Python process stopped')
    } catch (error) {
      console.error(
        `[FaceRecognitionService] Error stopping Python process: ${error instanceof Error ? error.message : String(error)}`
      )
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

    // Get Python models
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

    return models
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
