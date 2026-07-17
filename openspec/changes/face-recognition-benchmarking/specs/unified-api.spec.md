# Unified API Specification

## Overview
API unificada que abstrae el approach (ONNX vs Python) y provee una interfaz consistente para face recognition, benchmarking y comparación de modelos.

## Requirements

### REQ-1: Service Initialization
- **SHALL** inicializar ONNXProvider con modelos configurados
- **SHALL** inicializar PythonManager con script Python
- **SHALL** cargar modelos por defecto al iniciar
- **SHALL** manejar errores de inicialización gracefully
- **SHALL** proveer método shutdown para cleanup

**Acceptance Criteria:**
```typescript
const service = new FaceRecognitionService()
await service.init()
expect(service.listModels().length).toBeGreaterThan(0)

await service.shutdown()
```

### REQ-2: Model Selection
- **SHALL** permitir seleccionar modelo por nombre
- **SHALL** usar modelo por defecto si no se especifica
- **SHALL** validar que el modelo existe
- **SHALL** determinar automáticamente el approach (ONNX vs Python)
- **SHALL** listar modelos disponibles con metadata

**Acceptance Criteria:**
```typescript
const models = service.listModels()
expect(models).toContainEqual({
  name: 'insightface-buffalo-l',
  approach: 'onnx',
  embeddingSize: 512,
  landmarks: 106
})

const model = service.getModel('adaface')
expect(model.approach).toBe('python')
```

### REQ-3: Face Comparison
- **SHALL** comparar dos imágenes usando modelo especificado
- **SHALL** retornar similarity score (0-1)
- **SHALL** medir latencia de comparación
- **SHALL** manejar errores (no face detected, invalid image)
- **SHALL** soportar diferentes formatos de entrada (Buffer, base64, path)

**Acceptance Criteria:**
```typescript
const result = await service.compare(image1, image2, 'insightface-buffalo-l')
expect(result.similarity).toBeGreaterThanOrEqual(0)
expect(result.similarity).toBeLessThanOrEqual(1)
expect(result.model).toBe('insightface-buffalo-l')
expect(result.approach).toBe('onnx')
expect(result.latency).toBeDefined()
```

### REQ-4: Embedding Generation
- **SHALL** generar embedding para una imagen
- **SHALL** usar modelo especificado o default
- **SHALL** retornar embedding como Float32Array
- **SHALL** medir latencia de generación
- **SHALL** validar que embedding tenga tamaño correcto

**Acceptance Criteria:**
```typescript
const embedding = await service.getEmbedding(image, 'adaface')
expect(embedding).toBeInstanceOf(Float32Array)
expect(embedding.length).toBe(512)
```

### REQ-5: Similarity Calculation
- **SHALL** calcular cosine similarity entre dos embeddings
- **SHALL** retornar score en rango [0, 1]
- **SHALL** soportar diferentes órdenes de Minkowski distance
- **SHALL** ser determinístico (mismo input = mismo output)

**Acceptance Criteria:**
```typescript
const similarity = service.calculateSimilarity(embedding1, embedding2)
expect(similarity).toBeGreaterThanOrEqual(0)
expect(similarity).toBeLessThanOrEqual(1)

// Determinism
const sim1 = service.calculateSimilarity(e1, e2)
const sim2 = service.calculateSimilarity(e1, e2)
expect(sim1).toBe(sim2)
```

### REQ-6: Benchmark Integration
- **SHALL** integrar con BenchmarkSystem
- **SHALL** proveer método para correr benchmarks
- **SHALL** retornar resultados estructurados
- **SHALL** soportar múltiples modelos simultáneamente
- **SHALL** guardar resultados automáticamente

**Acceptance Criteria:**
```typescript
const results = await service.runBenchmark({
  dataset: 'lfw',
  models: ['insightface-buffalo-l', 'adaface']
})
expect(results.length).toBe(2)
expect(results[0].accuracy.tarAtFar001).toBeDefined()
```

### REQ-7: Leaderboard Access
- **SHALL** proveer acceso al leaderboard
- **SHALL** soportar filtrado por dataset
- **SHALL** soportar ordenamiento por métrica
- **SHALL** limitar resultados
- **SHALL** exportar en diferentes formatos

**Acceptance Criteria:**
```typescript
const leaderboard = await service.getLeaderboard({
  dataset: 'lfw',
  sortBy: 'tarAtFar001',
  limit: 10
})
expect(leaderboard.length).toBeLessThanOrEqual(10)
```

### REQ-8: Error Handling
- **SHALL** validar inputs (image, model name)
- **SHALL** manejar errores de face detection
- **SHALL** manejar errores de modelo no encontrado
- **SHALL** manejar errores de Python process
- **SHALL** proveer mensajes de error claros

**Acceptance Criteria:**
```typescript
try {
  await service.compare(invalidImage, validImage, 'nonexistent-model')
} catch (error) {
  expect(error).toBeInstanceOf(FaceRecognitionError)
  expect(error.message).toContain('Model not found')
}
```

### REQ-9: Metrics Exposure
- **SHALL** exponer métricas de performance por modelo
- **SHALL** incluir latencia promedio, p95, p99
- **SHALL** incluir throughput
- **SHALL** incluir uso de memoria
- **SHALL** actualizar métricas en tiempo real

**Acceptance Criteria:**
```typescript
const metrics = service.getMetrics('insightface-buffalo-l')
expect(metrics.avgLatency).toBeDefined()
expect(metrics.p95Latency).toBeDefined()
expect(metrics.throughput).toBeDefined()
expect(metrics.requestCount).toBeGreaterThan(0)
```

## Technical Details

### Service Interface
```typescript
export interface FaceRecognitionService {
  // Lifecycle
  init(): Promise<void>
  shutdown(): Promise<void>
  
  // Model management
  listModels(): FaceRecognitionModel[]
  getModel(name: string): FaceRecognitionModel | undefined
  
  // Core operations
  compare(
    image1: Buffer | string,
    image2: Buffer | string,
    modelName?: string
  ): Promise<CompareResult>
  
  getEmbedding(
    image: Buffer | string,
    modelName?: string
  ): Promise<Float32Array>
  
  calculateSimilarity(
    embedding1: Float32Array,
    embedding2: Float32Array,
    order?: number
  ): number
  
  // Benchmarking
  runBenchmark(options: BenchmarkOptions): Promise<BenchmarkResult[]>
  getLeaderboard(options: LeaderboardOptions): Promise<LeaderboardEntry[]>
  
  // Metrics
  getMetrics(modelName: string): ModelMetrics
}
```

### Type Definitions
```typescript
export interface FaceRecognitionModel {
  name: string
  approach: 'onnx' | 'python'
  embeddingSize: number
  landmarks: number
  speed: number // ms per image (avg)
  memoryUsage: number // MB
}

export interface CompareResult {
  similarity: number
  model: string
  approach: 'onnx' | 'python'
  latency: number // ms
  embedding1?: Float32Array
  embedding2?: Float32Array
}

export interface BenchmarkOptions {
  dataset: string
  models?: string[]
  parallel?: boolean
}

export interface LeaderboardOptions {
  dataset?: string
  sortBy?: 'tarAtFar001' | 'auc' | 'eer' | 'throughput'
  limit?: number
}

export interface ModelMetrics {
  avgLatency: number
  p95Latency: number
  p99Latency: number
  throughput: number
  memoryUsage: number
  requestCount: number
}
```

### Default Configuration
```typescript
const DEFAULT_CONFIG = {
  defaultModel: 'insightface-buffalo-l',
  onnxModels: [
    'insightface-buffalo-l',
    'insightface-buffalo-m',
    'insightface-buffalo-s',
    'mediapipe',
    'dlib'
  ],
  pythonModels: [
    'adaface',
    'magface',
    'openface',
    'cosface',
    'subcenter-arcface',
    'partial-fc'
  ],
  pythonScript: './scripts/face_recognition_server.py',
  modelsDir: './models',
  similarityThreshold: 0.5,
  requestTimeout: 30000 // ms
}
```

### Similarity Calculation
```typescript
calculateSimilarity(
  a: Float32Array,
  b: Float32Array,
  order: number = 2
): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same length')
  }
  
  if (order === 2) {
    // Cosine similarity
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
  } else {
    // Minkowski distance
    let sum = 0
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(Math.abs(a[i] - b[i]), order)
    }
    return 1 / (1 + Math.pow(sum, 1 / order))
  }
}
```

## Error Types
```typescript
export class FaceRecognitionError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'FaceRecognitionError'
  }
}

export class ModelNotFoundError extends FaceRecognitionError {
  constructor(modelName: string) {
    super(`Model not found: ${modelName}`, 'MODEL_NOT_FOUND')
  }
}

export class FaceDetectionError extends FaceRecognitionError {
  constructor() {
    super('No face detected in image', 'FACE_NOT_DETECTED')
  }
}

export class InvalidImageError extends FaceRecognitionError {
  constructor(reason: string) {
    super(`Invalid image: ${reason}`, 'INVALID_IMAGE')
  }
}

export class PythonProcessError extends FaceRecognitionError {
  constructor(reason: string) {
    super(`Python process error: ${reason}`, 'PYTHON_PROCESS_ERROR')
  }
}
```

## Usage Examples

### Basic Comparison
```typescript
const service = new FaceRecognitionService()
await service.init()

const result = await service.compare(
  './photos/user1.jpg',
  './photos/user2.jpg',
  'insightface-buffalo-l'
)

console.log(`Similarity: ${result.similarity}`)
console.log(`Match: ${result.similarity > 0.5}`)

await service.shutdown()
```

### Multi-Model Comparison
```typescript
const models = ['insightface-buffalo-l', 'adaface', 'mediapipe']
const results = await Promise.all(
  models.map(model => service.compare(img1, img2, model))
)

const bestMatch = results.reduce((best, curr) =>
  curr.similarity > best.similarity ? curr : best
)

console.log(`Best model: ${bestMatch.model} (${bestMatch.similarity})`)
```

### Benchmark Execution
```typescript
const results = await service.runBenchmark({
  dataset: 'lfw',
  models: ['insightface-buffalo-l', 'adaface', 'magface'],
  parallel: true
})

const leaderboard = await service.getLeaderboard({
  dataset: 'lfw',
  sortBy: 'tarAtFar001',
  limit: 10
})

console.log('Top 10 models:')
leaderboard.forEach((entry, i) => {
  console.log(`${i + 1}. ${entry.model}: ${entry.tarAtFar001}`)
})
```

## Performance Targets
- **Initialization**: <5s (carga de modelos)
- **Comparison**: <50ms (ONNX), <100ms (Python)
- **Embedding generation**: <30ms (ONNX), <60ms (Python)
- **Similarity calculation**: <1ms
- **Leaderboard generation**: <1s

## Testing Strategy
- **Unit tests**: Similarity calculation, error handling
- **Integration tests**: End-to-end con modelos reales
- **Performance tests**: Latencia, throughput
- **Error tests**: Invalid inputs, missing models, process crashes

## Future Enhancements
- Batch comparison (múltiples imágenes)
- Face detection + recognition pipeline
- Model hot-reloading
- Dynamic model loading/unloading
- REST API wrapper
- WebSocket support para streaming
