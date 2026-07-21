import { ONNXProvider } from './onnx-provider'
import { PythonManager } from './python-manager'

export interface ModelInfo {
  name: string
  approach: 'onnx' | 'python'
  embeddingSize: number
  landmarks?: number
  speed?: number
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
