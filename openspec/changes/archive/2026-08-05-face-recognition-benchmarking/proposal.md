# Face Recognition Benchmarking System - Proposal

## Summary
Implementar un sistema de benchmarking para comparar múltiples modelos de face recognition, usando una arquitectura híbrida que combina ONNX Runtime en Node.js (para modelos compatibles) y Python child processes (para modelos sin soporte ONNX).

## Motivation
- **Contexto**: DoorCloud actualmente usa `@vladmandic/human` (MediaPipe BlazeFace) para face recognition
- **Problema**: No hay forma de comparar diferentes modelos para encontrar el óptimo para nuestro caso de uso
- **Oportunidad**: Existen modelos state-of-the-art (InsightFace, AdaFace, MagFace) que podrían mejorar accuracy
- **Restricción**: No todos los modelos tienen soporte ONNX para Node.js

## Goals
1. Comparar 8-10 modelos de face recognition en datasets estándar (LFW, CFP-FP, AgeDB-30)
2. Medir accuracy (TAR@FAR=0.001, AUC, EER) y performance (latencia, throughput, memoria)
3. Generar leaderboard interno para selección de modelo
4. Mantener `@vladmandic/human` como baseline de referencia
5. Arquitectura unificada que abstraiga el approach (ONNX vs Python)

## Non-Goals
- Entrenar modelos propios (solo inference y benchmarking)
- Reemplazar el sistema actual de producción inmediatamente
- Soporte para modelos que requieran GPU (solo CPU por ahora)
- Integración con servicios cloud de face recognition

## Technical Approach

### Arquitectura Híbrida
```
FaceRecognitionService (Node.js)
    ├── ONNXProvider (modelos compatibles)
    │   ├── InsightFace buffalo_l/m/s
    │   ├── MediaPipe FaceMesh
    │   └── dlib (parcial)
    │
    └── PythonManager (child process)
        ├── AdaFace
        ├── MagFace
        ├── OpenFace
        ├── CosFace
        ├── Sub-Center ArcFace
        └── Partial FC
```

### Comunicación
- **ONNX Runtime**: Directo en Node.js, sin overhead IPC
- **Python**: Child process con IPC vía stdin/stdout (JSON)
- **Interfaz unificada**: `FaceRecognitionService` abstrae el approach

### Modelos a Benchmarkear
| Modelo | Approach | Accuracy (LFW) | Speed (CPU) | Size |
|--------|----------|----------------|-------------|------|
| InsightFace buffalo_l | ONNX | 99.83% | ~20ms | 300MB |
| MediaPipe FaceMesh | ONNX | ~99.5% | ~5ms | 50MB |
| dlib | ONNX (parcial) | 99.38% | ~50ms | 25MB |
| AdaFace | Python | 99.77% | ~25ms | 250MB |
| MagFace | Python | 99.78% | ~30ms | 300MB |
| OpenFace | Python | ~99.2% | ~45ms | 200MB |
| CosFace | Python | ~99.5% | ~25ms | 250MB |
| Sub-Center ArcFace | Python | ~99.6% | ~20ms | 300MB |
| Partial FC | Python | ~99.7% | ~20ms | 350MB |
| @vladmandic/human | ONNX (baseline) | ~95% | ~30ms | 100MB |

### Datasets
- **LFW** (Labeled Faces in the Wild) - 13,000 imágenes
- **CFP-FP** (Celebrities in Frontal-Profile) - 500 sujetos
- **AgeDB-30** - Envejecimiento, mismo sujeto diferentes edades
- **CASIA-WebFace** - 500K imágenes (opcional, para testing real)

### Métricas
**Accuracy:**
- TAR@FAR=0.001 (True Accept Rate @ False Accept Rate)
- AUC (Area Under ROC Curve)
- EER (Equal Error Rate)

**Performance:**
- Latencia (ms por imagen)
- Throughput (imágenes/segundo)
- Uso de memoria (MB)
- Tiempo de carga del modelo

## Success Criteria
1. ✅ Sistema puede cargar y ejecutar 8-10 modelos
2. ✅ Benchmarks corren en datasets estándar
3. ✅ Métricas se guardan en SQLite
4. ✅ Leaderboard interno generado automáticamente
5. ✅ API unificada para comparación de modelos
6. ✅ Performance: <50ms latencia promedio (ONNX models)
7. ✅ Memoria: <2GB RAM total (todos los modelos cargados)

## Risks & Mitigations

### Risk 1: Python child process overhead
- **Impact**: Latencia adicional 25-50ms vs ONNX directo
- **Mitigation**: Usar ONNX para modelos principales (InsightFace, MediaPipe)
- **Fallback**: Mantener Python solo para benchmarking, no producción

### Risk 2: Modelos ONNX no disponibles
- **Impact**: Algunos modelos solo disponibles en PyTorch
- **Mitigation**: Usar Python child process para esos modelos
- **Fallback**: Convertir modelos a ONNX manualmente (trabajo futuro)

### Risk 3: Consumo de memoria
- **Impact**: 8-10 modelos cargados = 2-3GB RAM
- **Mitigation**: Cargar modelos bajo demanda, no todos simultáneamente
- **Fallback**: Benchmark secuencial en lugar de paralelo

### Risk 4: Complejidad de integración
- **Impact**: Dos runtimes (Node.js + Python) = más puntos de fallo
- **Mitigation**: Interfaz unificada, manejo robusto de errores
- **Fallback**: Fallback a modelo baseline si falla un modelo

## Dependencies
- `onnxruntime-node` ^1.17.0
- `sharp` ^0.33.0 (preprocessing de imágenes)
- Python 3.8+ con:
  - `adaface` package
  - `magface` package
  - `opencv-python`
  - `Pillow`
  - `numpy`
  - `torch` (para modelos PyTorch)

## Timeline
- **Fase 1**: ONNX Runtime setup (2 días)
- **Fase 2**: Python child process (2 días)
- **Fase 3**: Unified service (1 día)
- **Fase 4**: Benchmark system (2 días)
- **Fase 5**: Integration con DoorCloud (1 día)
- **Total**: ~8 días

## Rollback Plan
Si el sistema híbrido no funciona como esperado:
1. Mantener `@vladmandic/human` como sistema de producción
2. Usar el benchmarking solo para análisis, no integración
3. Considerar migrar todo a Python si ONNX no es viable

## Future Work
- Soporte para GPU (CUDA)
- Entrenamiento de modelos custom
- Integración con servicios cloud (AWS Rekognition, Azure Face API)
- Dashboard web para visualización de benchmarks
- Automated CI/CD para benchmarks en cada PR
