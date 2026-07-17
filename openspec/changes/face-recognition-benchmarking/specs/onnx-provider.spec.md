# ONNX Provider Specification

## Overview
Componente responsable de cargar y ejecutar modelos de face recognition en formato ONNX directamente en Node.js, sin necesidad de Python.

## Requirements

### REQ-1: Model Loading
- **SHALL** cargar modelos ONNX desde el filesystem
- **SHALL** validar que el modelo existe y es legible
- **SHALL** inicializar ONNX Runtime con configuración óptima
- **SHALL** soportar múltiples modelos simultáneamente
- **SHALL** manejar errores de carga gracefully

**Acceptance Criteria:**
```typescript
const provider = new ONNXProvider()
await provider.loadModel('insightface-buffalo-l', './models/buffalo_l.onnx')
expect(provider.hasModel('insightface-buffalo-l')).toBe(true)
```

### REQ-2: Image Preprocessing
- **SHALL** redimensionar imágenes a 112x112 (estándar face recognition)
- **SHALL** normalizar valores de píxeles a rango [-1, 1]
- **SHALL** convertir imágenes a formato RGB si necesario
- **SHALL** manejar diferentes formatos de entrada (Buffer, base64, file path)
- **SHALL** usar `sharp` para procesamiento eficiente

**Acceptance Criteria:**
```typescript
const tensor = await provider.preprocess(imageBuffer)
expect(tensor.shape).toEqual([1, 3, 112, 112])
expect(tensor.data.every(v => v >= -1 && v <= 1)).toBe(true)
```

### REQ-3: Inference Execution
- **SHALL** ejecutar inference en CPU usando ONNX Runtime
- **SHALL** medir latencia de cada inference
- **SHALL** retornar embeddings como Float32Array
- **SHALL** manejar errores de inference gracefully
- **SHALL** soportar batch processing (futuro)

**Acceptance Criteria:**
```typescript
const embedding = await provider.getEmbedding(imageBuffer, 'insightface-buffalo-l')
expect(embedding).toBeInstanceOf(Float32Array)
expect(embedding.length).toBe(512) // o 128 según modelo
```

### REQ-4: Performance Tracking
- **SHALL** registrar latencia de cada inference
- **SHALL** calcular promedio de latencia por modelo
- **SHALL** trackear uso de memoria (opcional)
- **SHALL** exponer métricas vía API

**Acceptance Criteria:**
```typescript
const metrics = provider.getMetrics('insightface-buffalo-l')
expect(metrics.avgLatency).toBeLessThan(50) // ms
expect(metrics.inferenceCount).toBeGreaterThan(0)
```

### REQ-5: Model Registry
- **SHALL** mantener registry de modelos cargados
- **SHALL** proveer metadata de cada modelo (embedding size, landmarks, etc.)
- **SHALL** permitir listar modelos disponibles
- **SHALL** permitir descargar modelos no cargados

**Acceptance Criteria:**
```typescript
const models = provider.listModels()
expect(models).toContainEqual({
  name: 'insightface-buffalo-l',
  embeddingSize: 512,
  landmarks: 106,
  approach: 'onnx'
})
```

## Technical Details

### ONNX Runtime Configuration
```typescript
const session = await ort.InferenceSession.create(modelPath, {
  executionProviders: ['cpu'],
  graphOptimizationLevel: 'all',
  intraOpNumThreads: 4
})
```

### Image Preprocessing Pipeline
```typescript
async preprocess(image: Buffer): Promise<ort.Tensor> {
  // 1. Resize to 112x112
  const resized = await sharp(image)
    .resize(112, 112)
    .raw()
    .toBuffer()
  
  // 2. Normalize to [-1, 1]
  const float32 = new Float32Array(3 * 112 * 112)
  for (let i = 0; i < resized.length; i++) {
    float32[i] = (resized[i] / 127.5) - 1.0
  }
  
  // 3. Create tensor
  return new ort.Tensor('float32', float32, [1, 3, 112, 112])
}
```

### Supported Models
| Model | Input Shape | Output Shape | Embedding Size |
|-------|-------------|--------------|----------------|
| InsightFace buffalo_l | [1, 3, 112, 112] | [1, 512] | 512 |
| InsightFace buffalo_m | [1, 3, 112, 112] | [1, 512] | 512 |
| InsightFace buffalo_s | [1, 3, 112, 112] | [1, 512] | 512 |
| MediaPipe FaceMesh | [1, 3, 112, 112] | [1, 128] | 128 |
| dlib (partial) | [1, 3, 150, 150] | [1, 128] | 128 |

## Error Handling
- **Model not found**: Throw `ModelNotFoundError`
- **Invalid image**: Throw `InvalidImageError`
- **Inference failed**: Log error, return null
- **Memory limit**: Unload least recently used model

## Performance Targets
- **Latencia**: <20ms por imagen (InsightFace)
- **Throughput**: >50 imágenes/segundo
- **Memoria**: <500MB por modelo
- **Startup time**: <2s para cargar modelo

## Testing Strategy
- **Unit tests**: Preprocessing, inference, metrics
- **Integration tests**: End-to-end con imágenes reales
- **Performance tests**: Latencia, throughput, memory
- **Error tests**: Invalid inputs, missing models

## Dependencies
- `onnxruntime-node` ^1.17.0
- `sharp` ^0.33.0

## Future Enhancements
- GPU support (CUDA execution provider)
- Batch processing
- Model caching
- Automatic model download
- Quantization support (INT8)
