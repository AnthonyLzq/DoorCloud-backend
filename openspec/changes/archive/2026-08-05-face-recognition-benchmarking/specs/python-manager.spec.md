# Python Manager Specification

## Overview
Componente responsable de gestionar child processes de Python para ejecutar modelos de face recognition que no tienen soporte ONNX en Node.js.

## Requirements

### REQ-1: Process Lifecycle
- **SHALL** spawn Python process al inicializar
- **SHALL** esperar señal READY del proceso Python
- **SHALL** manejar graceful shutdown del proceso
- **SHALL** detectar crashes y reiniciar automáticamente
- **SHALL** limitar a un solo proceso Python (multiplexing)

**Acceptance Criteria:**
```typescript
const manager = new PythonManager('./scripts/face_recognition_server.py')
await manager.start()
expect(manager.isRunning()).toBe(true)

await manager.stop()
expect(manager.isRunning()).toBe(false)
```

### REQ-2: Request/Response Protocol
- **SHALL** enviar requests como JSON vía stdin
- **SHALL** recibir responses como JSON vía stdout
- **SHALL** correlacionar requests con responses via ID
- **SHALL** manejar timeouts (default: 30s)
- **SHALL** manejar errores de parseo gracefully

**Acceptance Criteria:**
```typescript
// Request format
{
  "id": 1,
  "method": "get_embedding",
  "args": [imageBytes, "adaface"]
}

// Response format
{
  "id": 1,
  "result": [0.1, 0.2, ...], // embedding
  "error": null
}
```

### REQ-3: Model Management
- **SHALL** cargar modelos Python bajo demanda
- **SHALL** mantener registry de modelos cargados
- **SHALL** proveer metadata de cada modelo
- **SHALL** manejar errores de carga gracefully

**Acceptance Criteria:**
```typescript
await manager.loadModel('adaface', {
  model_path: './models/adaface/adaface_ms1mv2_mobilenet_v2.pt'
})

const models = manager.listModels()
expect(models).toContain('adaface')
```

### REQ-4: Inference Execution
- **SHALL** ejecutar inference vía child process
- **SHALL** medir latencia de cada inference (incluyendo IPC)
- **SHALL** convertir embeddings a Float32Array
- **SHALL** manejar errores de inference gracefully

**Acceptance Criteria:**
```typescript
const embedding = await manager.getEmbedding(imageBuffer, 'adaface')
expect(embedding).toBeInstanceOf(Float32Array)
expect(embedding.length).toBe(512)
```

### REQ-5: Error Handling
- **SHALL** capturar stderr del proceso Python
- **SHALL** loguear errores de Python
- **SHALL** reiniciar proceso si crash
- **SHALL** retornar errores al caller

**Acceptance Criteria:**
```typescript
try {
  await manager.getEmbedding(invalidImage, 'nonexistent-model')
} catch (error) {
  expect(error.message).toContain('Model not found')
}
```

### REQ-6: Performance Tracking
- **SHALL** registrar latencia de cada request (incluyendo IPC)
- **SHALL** calcular promedio de latencia por modelo
- **SHALL** trackear número de requests
- **SHALL** exponer métricas vía API

**Acceptance Criteria:**
```typescript
const metrics = manager.getMetrics('adaface')
expect(metrics.avgLatency).toBeDefined()
expect(metrics.requestCount).toBeGreaterThan(0)
```

## Technical Details

### Python Script Interface
```python
# scripts/face_recognition_server.py
import sys
import json

def main():
    print('READY', flush=True)
    
    for line in sys.stdin:
        request = json.loads(line.strip())
        response = handle_request(request)
        print(json.dumps(response), flush=True)

def handle_request(request):
    method = request['method']
    args = request['args']
    
    if method == 'load_model':
        return load_model(*args)
    elif method == 'get_embedding':
        return get_embedding(*args)
    else:
        return {'error': f'Unknown method: {method}'}
```

### IPC Protocol
```typescript
// Send request
const request = {
  id: ++this.requestId,
  method: 'get_embedding',
  args: [Array.from(imageBuffer), modelName]
}
this.process.stdin.write(JSON.stringify(request) + '\n')

// Receive response
this.process.stdout.on('data', (data) => {
  const response = JSON.parse(data.toString())
  const pending = this.pendingRequests.get(response.id)
  pending.resolve(response.result)
})
```

### Supported Models
| Model | Python Package | Embedding Size | Landmarks | Notes |
|-------|---------------|----------------|-----------|-------|
| AdaFace | `adaface` | 512 | 68 | Quality-aware |
| MagFace | `magface` | 512 | 68 | Magnitude-aware |
| OpenFace | `openface` | 128 | 68 | Classic |
| CosFace | `cosface` | 512 | 68 | Large margin |
| Sub-Center ArcFace | `insightface` | 512 | 106 | Noisy data |
| Partial FC | `insightface` | 512 | 106 | Scalable |

### Python Dependencies
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

## Error Handling

### Process Crash Recovery
```typescript
this.process.on('exit', (code) => {
  if (code !== 0) {
    console.error('Python process crashed, restarting...')
    setTimeout(() => this.start(), 1000)
  }
})
```

### Timeout Handling
```typescript
const timeout = setTimeout(() => {
  pending.reject(new Error('Request timeout'))
  this.pendingRequests.delete(id)
}, 30000)
```

### Error Propagation
```typescript
if (response.error) {
  pending.reject(new Error(response.error))
} else {
  pending.resolve(response.result)
}
```

## Performance Targets
- **Latencia IPC**: <5ms overhead
- **Latencia total**: <50ms por imagen (incluyendo IPC)
- **Throughput**: >20 imágenes/segundo
- **Memoria**: <1GB (proceso Python)
- **Startup time**: <5s (incluyendo carga de modelos)

## Testing Strategy
- **Unit tests**: Protocol handling, error cases
- **Integration tests**: End-to-end con Python process
- **Performance tests**: IPC overhead, latency
- **Error tests**: Process crash, timeout, invalid input

## Security Considerations
- **Input validation**: Validar que imageBuffer sea válido
- **Path traversal**: Validar model_path en Python
- **Resource limits**: Limitar tamaño de requests
- **Process isolation**: Python corre en proceso separado

## Future Enhancements
- gRPC en lugar de stdin/stdout (mejor performance)
- Múltiples procesos Python (paralelismo)
- Model hot-reloading
- Health checks
- Metrics export (Prometheus)

## Dependencies
- Python 3.8+
- Node.js child_process module
- JSON serialization
