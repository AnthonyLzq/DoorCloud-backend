# Face Recognition Architecture - Hybrid Approach

## Overview
Arquitectura híbrida que usa ONNX Runtime para Node.js (modelos compatibles) y Python child processes (modelos sin ONNX), con interfaz unificada.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│              DoorCloud Backend (Node.js)                │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │      FaceRecognitionService (Unified API)        │   │
│  │  - compare(image1, image2, modelName)            │   │
│  │  - getEmbedding(image, modelName)                │   │
│  │  - benchmark(datasetName, modelNames[])          │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                              │
│              ┌───────────┴───────────┐                  │
│              │                       │                  │
│    ┌─────────▼─────────┐   ┌────────▼────────┐          │
│    │  ONNX Runtime     │   │ Python Manager  │          │
│    │  (Direct)         │   │ (Child Process) │          │
│    │                   │   │                 │          │
│    │  • InsightFace    │   │  • AdaFace      │          │
│    │  • MediaPipe      │   │  • MagFace      │          │
│    │  • dlib (parcial) │   │  • OpenFace     │          │
│    │                   │   │  • Custom       │          │
│    └───────────────────┘   └─────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

---

## Modelos por Approach

### ONNX Runtime (Node.js directo)
| Modelo | ONNX Available | Speed (CPU) | Size | Landmarks |
|--------|---------------|-------------|------|-----------|
| InsightFace buffalo_l | ✅ Yes | ~20ms | 300MB | 106 |
| InsightFace buffalo_m | ✅ Yes | ~15ms | 150MB | 106 |
| InsightFace buffalo_s | ✅ Yes | ~10ms | 80MB | 106 |
| MediaPipe FaceMesh | ✅ Yes | ~5ms | 50MB | 468 |
| dlib (partial) | ⚠️ Limited | ~50ms | 25MB | 68 |

### Python Child Process
| Modelo | ONNX Available | Speed (CPU) | Size | Landmarks |
|--------|---------------|-------------|------|-----------|
| AdaFace | ❌ No | ~25ms | 250MB | 68 |
| MagFace | ❌ No | ~30ms | 300MB | 68 |
| OpenFace | ❌ No | ~45ms | 200MB | 68 |
| CosFace | ❌ No | ~25ms | 250MB | 68 |
| Sub-Center ArcFace | ❌ No | ~20ms | 300MB | 106 |
| Partial FC | ❌ No | ~20ms | 350MB | 106 |
| FaceNet (PyTorch) | ❌ No | ~40ms | 100MB | 68 |
| Custom models | ❌ No | varies | varies | varies |

---

## Implementación

### 1. Unified Interface

```typescript
// src/services/face-recognition/types.ts
export interface FaceRecognitionModel {
  name: string
  approach: 'onnx' | 'python'
  embeddingSize: number
  landmarks: number
  speed: number // ms per image
}

export interface CompareResult {
  similarity: number
  model: string
  approach: 'onnx' | 'python'
  latency: number // ms
}

export interface FaceRecognitionService {
  compare(
    image1: Buffer,
    image2: Buffer,
    modelName?: string
  ): Promise<CompareResult>
  
  getEmbedding(
    image: Buffer,
    modelName?: string
  ): Promise<Float32Array>
  
  listModels(): FaceRecognitionModel[]
  
  benchmark(
    datasetPath: string,
    modelNames?: string[]
  ): Promise<BenchmarkResult[]>
}
```

### 2. ONNX Runtime Implementation

```typescript
// src/services/face-recognition/onnx-provider.ts
import * as ort from 'onnxruntime-node'
import { readFileSync } from 'fs'
import sharp from 'sharp'

interface ONNXModel {
  session: ort.InferenceSession
  metadata: FaceRecognitionModel
}

export class ONNXProvider {
  private models: Map<string, ONNXModel> = new Map()

  async loadModel(name: string, modelPath: string): Promise<void> {
    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all'
    })

    this.models.set(name, {
      session,
      metadata: {
        name,
        approach: 'onnx',
        embeddingSize: 512, // varía por modelo
        landmarks: 106,
        speed: 0
      }
    })
  }

  async getEmbedding(image: Buffer, modelName: string): Promise<Float32Array> {
    const model = this.models.get(modelName)
    if (!model) throw new Error(`Model ${modelName} not loaded`)

    // Preprocess: resize to 112x112, normalize
    const preprocessed = await this.preprocess(image)
    
    // Create tensor
    const tensor = new ort.Tensor('float32', preprocessed, [1, 3, 112, 112])
    
    // Run inference
    const startTime = performance.now()
    const results = await model.session.run({ input: tensor })
    const latency = performance.now() - startTime

    // Update speed metric
    model.metadata.speed = latency

    return results.output.data as Float32Array
  }

  private async preprocess(image: Buffer): Promise<Float32Array> {
    // Resize to 112x112
    const resized = await sharp(image)
      .resize(112, 112)
      .raw()
      .toBuffer()

    // Normalize to [-1, 1] and convert to Float32Array
    const float32 = new Float32Array(3 * 112 * 112)
    for (let i = 0; i < resized.length; i++) {
      float32[i] = (resized[i] / 127.5) - 1.0
    }

    return float32
  }

  listModels(): FaceRecognitionModel[] {
    return Array.from(this.models.values()).map(m => m.metadata)
  }
}
```

### 3. Python Child Process Manager

```typescript
// src/services/face-recognition/python-manager.ts
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

interface PythonRequest {
  id: number
  method: string
  args: any[]
  resolve: (value: any) => void
  reject: (error: Error) => void
}

export class PythonManager extends EventEmitter {
  private process: ChildProcess | null = null
  private requestId = 0
  private pendingRequests: Map<number, PythonRequest> = new Map()
  private scriptPath: string

  constructor(scriptPath: string) {
    super()
    this.scriptPath = scriptPath
  }

  async start(): Promise<void> {
    this.process = spawn('python3', [this.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (data) => {
      this.handleResponse(data.toString())
    })

    this.process.stderr?.on('data', (data) => {
      console.error('Python error:', data.toString())
    })

    this.process.on('exit', (code) => {
      console.log(`Python process exited with code ${code}`)
      this.process = null
    })

    // Wait for ready signal
    await this.waitForReady()
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
  }

  async call(method: string, ...args: any[]): Promise<any> {
    if (!this.process) throw new Error('Python process not started')

    const id = ++this.requestId
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { id, method, args, resolve, reject })
      
      const request = JSON.stringify({ id, method, args })
      this.process!.stdin!.write(request + '\n')
    })
  }

  private handleResponse(data: string): void {
    const lines = data.trim().split('\n')
    
    for (const line of lines) {
      try {
        const response = JSON.parse(line)
        const { id, result, error } = response
        
        const pending = this.pendingRequests.get(id)
        if (!pending) continue

        this.pendingRequests.delete(id)

        if (error) {
          pending.reject(new Error(error))
        } else {
          pending.resolve(result)
        }
      } catch (e) {
        console.error('Failed to parse Python response:', line)
      }
    }
  }

  private async waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      const checkReady = (data: Buffer) => {
        if (data.toString().includes('READY')) {
          this.process!.stdout!.removeListener('data', checkReady)
          resolve()
        }
      }
      this.process!.stdout!.on('data', checkReady)
    })
  }
}
```

### 4. Python Script (Backend)

```python
# scripts/face_recognition_server.py
import sys
import json
import numpy as np
from typing import Dict, Any

# Model imports
try:
    from adaface.models import load_model as load_adaface
    ADAFACE_AVAILABLE = True
except ImportError:
    ADAFACE_AVAILABLE = False

try:
    from magface.models import load_model as load_magface
    MAGFACE_AVAILABLE = True
except ImportError:
    MAGFACE_AVAILABLE = False

# Model registry
models: Dict[str, Any] = {}

def load_model(name: str, config: Dict[str, Any]) -> None:
    """Load a model into memory"""
    if name == 'adaface' and ADAFACE_AVAILABLE:
        models[name] = load_adaface(config.get('model_path'))
    elif name == 'magface' and MAGFACE_AVAILABLE:
        models[name] = load_magface(config.get('model_path'))
    else:
        raise ValueError(f"Model {name} not available")

def get_embedding(image_bytes: bytes, model_name: str) -> list:
    """Get face embedding from image"""
    import cv2
    from PIL import Image
    import io
    
    # Decode image
    image = Image.open(io.BytesIO(image_bytes))
    image_np = np.array(image)
    
    # Convert RGB to BGR if needed
    if len(image_np.shape) == 3 and image_np.shape[2] == 3:
        image_np = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)
    
    # Get embedding
    model = models.get(model_name)
    if not model:
        raise ValueError(f"Model {model_name} not loaded")
    
    embedding = model.get_embedding(image_np)
    return embedding.tolist()

def handle_request(request: Dict[str, Any]) -> Dict[str, Any]:
    """Handle incoming request"""
    method = request['method']
    args = request['args']
    
    try:
        if method == 'load_model':
            load_model(*args)
            return {'result': 'ok'}
        
        elif method == 'get_embedding':
            image_bytes = bytes(args[0])
            model_name = args[1]
            embedding = get_embedding(image_bytes, model_name)
            return {'result': embedding}
        
        else:
            return {'error': f'Unknown method: {method}'}
    
    except Exception as e:
        return {'error': str(e)}

def main():
    """Main loop"""
    print('READY', flush=True)
    
    for line in sys.stdin:
        try:
            request = json.loads(line.strip())
            response = handle_request(request)
            response['id'] = request['id']
            print(json.dumps(response), flush=True)
        except Exception as e:
            print(json.dumps({'error': str(e)}), flush=True)

if __name__ == '__main__':
    main()
```

### 5. Unified Service

```typescript
// src/services/face-recognition/index.ts
import { ONNXProvider } from './onnx-provider'
import { PythonManager } from './python-manager'
import { FaceRecognitionModel, CompareResult } from './types'

export class FaceRecognitionService {
  private onnxProvider: ONNXProvider
  private pythonManager: PythonManager
  private modelRegistry: Map<string, 'onnx' | 'python'> = new Map()

  constructor() {
    this.onnxProvider = new ONNXProvider()
    this.pythonManager = new PythonManager('./scripts/face_recognition_server.py')
  }

  async init(): Promise<void> {
    // Load ONNX models
    await this.onnxProvider.loadModel(
      'insightface-buffalo-l',
      './models/insightface/buffalo_l.onnx'
    )
    this.modelRegistry.set('insightface-buffalo-l', 'onnx')

    await this.onnxProvider.loadModel(
      'mediapipe',
      './models/mediapipe/face_mesh.onnx'
    )
    this.modelRegistry.set('mediapipe', 'onnx')

    // Start Python process and load models
    await this.pythonManager.start()
    
    await this.pythonManager.call('load_model', 'adaface', {
      model_path: './models/adaface/adaface_ms1mv2_mobilenet_v2.pt'
    })
    this.modelRegistry.set('adaface', 'python')

    await this.pythonManager.call('load_model', 'magface', {
      model_path: './models/magface/magface_resnet100.pt'
    })
    this.modelRegistry.set('magface', 'python')
  }

  async compare(
    image1: Buffer,
    image2: Buffer,
    modelName: string = 'insightface-buffalo-l'
  ): Promise<CompareResult> {
    const approach = this.modelRegistry.get(modelName)
    if (!approach) throw new Error(`Model ${modelName} not registered`)

    const startTime = performance.now()
    
    let embedding1: Float32Array
    let embedding2: Float32Array

    if (approach === 'onnx') {
      embedding1 = await this.onnxProvider.getEmbedding(image1, modelName)
      embedding2 = await this.onnxProvider.getEmbedding(image2, modelName)
    } else {
      const emb1 = await this.pythonManager.call(
        'get_embedding',
        Array.from(image1),
        modelName
      )
      embedding1 = new Float32Array(emb1)

      const emb2 = await this.pythonManager.call(
        'get_embedding',
        Array.from(image2),
        modelName
      )
      embedding2 = new Float32Array(emb2)
    }

    const similarity = this.cosineSimilarity(embedding1, embedding2)
    const latency = performance.now() - startTime

    return {
      similarity,
      model: modelName,
      approach,
      latency
    }
  }

  async getEmbedding(
    image: Buffer,
    modelName: string = 'insightface-buffalo-l'
  ): Promise<Float32Array> {
    const approach = this.modelRegistry.get(modelName)
    if (!approach) throw new Error(`Model ${modelName} not registered`)

    if (approach === 'onnx') {
      return await this.onnxProvider.getEmbedding(image, modelName)
    } else {
      const embedding = await this.pythonManager.call(
        'get_embedding',
        Array.from(image),
        modelName
      )
      return new Float32Array(embedding)
    }
  }

  listModels(): FaceRecognitionModel[] {
    const onnxModels = this.onnxProvider.listModels()
    // TODO: get Python models metadata
    return onnxModels
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  async shutdown(): Promise<void> {
    await this.pythonManager.stop()
  }
}
```

---

## Performance Comparison

| Approach | Latency | Throughput | Memory | Setup Complexity |
|----------|---------|------------|--------|------------------|
| ONNX (Node.js) | 10-20ms | 50-100 img/s | 300-500MB | Low |
| Python Child | 25-50ms | 20-40 img/s | 500-800MB | Medium |
| HTTP API | 30-60ms | 15-30 img/s | 500-800MB | High |
| gRPC | 20-40ms | 25-50 img/s | 500-800MB | High |

---

## Implementation Plan

### Phase 1: ONNX Runtime Setup (2 días)
1. Instalar `onnxruntime-node` y `sharp`
2. Descargar modelos ONNX (InsightFace buffalo_l, MediaPipe)
3. Implementar `ONNXProvider` con preprocessing
4. Tests básicos de inference

### Phase 2: Python Child Process (2 días)
1. Crear `scripts/face_recognition_server.py`
2. Implementar `PythonManager` con IPC
3. Instalar dependencias Python (adaface, magface, etc.)
4. Tests de comunicación Node.js ↔ Python

### Phase 3: Unified Service (1 día)
1. Implementar `FaceRecognitionService` unificado
2. Model registry (ONNX vs Python)
3. Cosine similarity y métricas
4. Tests de integración

### Phase 4: Benchmark System (2 días)
1. Descargar datasets (LFW, CFP-FP, AgeDB-30)
2. Implementar benchmark runner
3. Guardar resultados en SQLite
4. Leaderboard interno

### Phase 5: Integration with DoorCloud (1 día)
1. Reemplazar `@vladmandic/human` con `FaceRecognitionService`
2. Actualizar endpoints de reconocimiento
3. Tests end-to-end
4. Documentación

---

## Dependencies

### Node.js
```json
{
  "dependencies": {
    "onnxruntime-node": "^1.17.0",
    "sharp": "^0.33.0"
  }
}
```

### Python
```txt
# requirements.txt
adaface==1.0.0
magface==1.0.0
opencv-python==4.8.0
Pillow==10.0.0
numpy==1.24.0
torch==2.0.0
torchvision==0.15.0
```

---

## Trade-offs

### ONNX Runtime (Node.js)
✅ **Pros:**
- Todo en Node.js (un solo servicio)
- Sin overhead de IPC
- Más rápido (10-20ms)
- Menos memoria
- Fácil de deployar

❌ **Cons:**
- Solo modelos con ONNX disponibles
- Menos flexibilidad para custom models
- Debugging más difícil

### Python Child Process
✅ **Pros:**
- Acceso a todos los modelos PyTorch
- Más flexibilidad
- Fácil agregar custom models
- Ecosistema ML completo

❌ **Cons:**
- Overhead de IPC (25-50ms)
- Más memoria (500-800MB)
- Dos procesos a manejar
- Más complejo de debuggear

### Recomendación
Usar **ONNX para modelos principales** (InsightFace, MediaPipe) y **Python para benchmarking** de modelos avanzados (AdaFace, MagFace). Esto da lo mejor de ambos mundos.

---

## Next Steps

1. **Validar ONNX Runtime**: Hacer prototype con InsightFace ONNX
2. **Testear performance**: Medir latencia en tu máquina
3. **Decidir modelos**: Cuáles usar en ONNX vs Python
4. **Implementar Phase 1**: ONNX Runtime setup
5. **Implementar Phase 2**: Python child process
6. **Integration**: Reemplazar `@vladmandic/human`

---

## References

- ONNX Runtime Node.js: https://onnxruntime.ai/docs/api/nodejs/
- InsightFace ONNX models: https://github.com/deepinsight/insightface/tree/master/model_zoo
- MediaPipe: https://google.github.io/mediapipe/
- AdaFace: https://github.com/mk-minchul/AdaFace
- MagFace: https://github.com/IrvingMeng/MagFace
