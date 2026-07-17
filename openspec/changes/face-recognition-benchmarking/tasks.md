# Face Recognition Benchmarking System - Implementation Tasks

## Overview
Desglose de tareas para implementar el sistema híbrido de benchmarking de face recognition.

**Estimated Total Time**: 9 días (1 día cleanup + 8 días benchmarking)
**Phases**: 6 (Phase 0: Cleanup + 5 phases de implementación)
**Dependencies**: P3 Operational Cleanup completado

---

## Phase 0: Code Cleanup & Security (1 día)

### Task 0.1: Remove Dead Code (tf.ts) ✅
- **Time**: 30 min
- **Files**: `src/tf.ts`, `src/lib/human/index.ts`
- **Actions**:
  - Delete `src/tf.ts` (código muerto que usa @vladmandic/face-api)
  - Verify no imports reference tf.ts
  - Update tests if needed
  - Run tests to ensure nothing breaks
- **Acceptance**: tf.ts eliminado, tests pasan
- **Commit**: `chore: remove dead code tf.ts`

### Task 0.2: Remove @tensorflow/tfjs-node Dependency ✅
- **Time**: 30 min
- **Files**: `package.json`, `pnpm-lock.yaml`
- **Actions**:
  - Remove `@tensorflow/tfjs-node` from dependencies
  - Run `pnpm install` to update lockfile
  - Verify no code imports tfjs-node
  - Run tests
- **Acceptance**: Dependency eliminada, 8 vulnerabilidades resueltas
- **Commit**: `chore: remove @tensorflow/tfjs-node dependency`

### Task 0.3: Fix Security Issues ✅
- **Time**: 1 hora
- **Files**: `src/network/http/routes/setup.ts`, `src/config/env.ts`
- **Actions**:
  - Add authentication to `/setup/*` endpoints (use SETUP_TOKEN)
  - Force CORS_ORIGINS in production (throw error if not set)
  - Validate userID to prevent NaN (add Number.isNaN check)
  - Add tests for security fixes
- **Acceptance**: Security issues resueltos, tests pasan
- **Commit**: `security: fix critical security vulnerabilities`

### Task 0.4: Remove Unused Dependencies ✅
- **Time**: 30 min
- **Files**: `package.json`, `src/`
- **Actions**:
  - Remove `@fastify/swagger` (installed but never used)
  - Remove `SETUP_TOKEN` from env validation (if not used after Task 0.3)
  - Remove `userResponseSchema` from schemas (defined but never used)
  - Run `pnpm install`
- **Acceptance**: Unused dependencies eliminadas
- **Commit**: `chore: remove unused dependencies and code`

### Task 0.5: Fix pub.ts Legacy Topic ✅
- **Time**: 30 min
- **Files**: `src/pub.ts`
- **Actions**:
  - Update pub.ts to use versioned topic `doorcloud/v1/photo/send`
  - Update payload format to JSON (not delimiter-based)
  - Test publishing works
- **Acceptance**: pub.ts usa topic versionado
- **Commit**: `fix: update pub.ts to use versioned MQTT topics`

---

## Phase 1: ONNX Runtime Setup (2 días)

### Task 1.1: Install Dependencies
- **Time**: 30 min
- **Files**: `package.json`
- **Actions**:
  - Agregar `onnxruntime-node` ^1.17.0
  - Agregar `sharp` ^0.33.0
  - Agregar `better-sqlite3` ^11.0.0 (para benchmarks)
  - Run `pnpm install`
- **Acceptance**: Dependencies instaladas sin errores
- **Commit**: `chore: install ONNX Runtime and image processing dependencies`

### Task 1.2: Download ONNX Models
- **Time**: 1 hora
- **Files**: `scripts/download-models.sh`, `models/`
- **Actions**:
  - Crear script para descargar modelos ONNX
  - Descargar InsightFace buffalo_l/m/s
  - Descargar MediaPipe FaceMesh
  - Validar integridad de modelos
- **Acceptance**: Modelos descargados y validados
- **Commit**: `chore: add model download script and initial ONNX models`

### Task 1.3: Implement ONNXProvider (Preprocessing)
- **Time**: 2 horas
- **Files**: `src/services/face-recognition/onnx-provider.ts`
- **Actions**:
  - Implementar método `preprocess(image: Buffer): Promise<ort.Tensor>`
  - Resize a 112x112 usando sharp
  - Normalizar a [-1, 1]
  - Convertir a Float32Array
  - Unit tests para preprocessing
- **Acceptance**: Preprocessing funciona con diferentes formatos de imagen
- **Commit**: `feat: implement ONNX image preprocessing pipeline`

### Task 1.4: Implement ONNXProvider (Inference)
- **Time**: 3 horas
- **Files**: `src/services/face-recognition/onnx-provider.ts`
- **Actions**:
  - Implementar `loadModel(name, path)`
  - Implementar `getEmbedding(image, model)`
  - Configurar ONNX Runtime session
  - Medir latencia de inference
  - Handle errors gracefully
  - Integration tests con InsightFace
- **Acceptance**: Can load InsightFace and get embeddings
- **Commit**: `feat: implement ONNX model loading and inference`

### Task 1.5: ONNXProvider Metrics & Registry
- **Time**: 1 hora
- **Files**: `src/services/face-recognition/onnx-provider.ts`
- **Actions**:
  - Implementar `listModels()`
  - Implementar `getMetrics(model)`
  - Track avg latency, request count
  - Unit tests
- **Acceptance**: Metrics tracked correctly
- **Commit**: `feat: add ONNX provider metrics and model registry`

---

## Phase 2: Python Child Process (2 días)

### Task 2.1: Create Python Server Script
- **Time**: 2 horas
- **Files**: `scripts/face_recognition_server.py`, `requirements.txt`
- **Actions**:
  - Crear script Python con stdin/stdout JSON protocol
  - Implementar `load_model(name, config)`
  - Implementar `get_embedding(image_bytes, model_name)`
  - Print 'READY' al iniciar
  - Error handling robusto
- **Acceptance**: Script corre y responde a requests básicos
- **Commit**: `feat: create Python face recognition server with IPC protocol`

### Task 2.2: Install Python Dependencies
- **Time**: 1 hora
- **Files**: `requirements.txt`, `scripts/install-python-deps.sh`
- **Actions**:
  - Crear requirements.txt con:
    - adaface
    - magface
    - opencv-python
    - Pillow
    - numpy
    - torch
    - torchvision
  - Crear script de instalación
  - Testear instalación
- **Acceptance**: Python dependencies instaladas
- **Commit**: `chore: add Python dependencies for face recognition models`

### Task 2.3: Implement PythonManager (Process Lifecycle)
- **Time**: 2 horas
- **Files**: `src/services/face-recognition/python-manager.ts`
- **Actions**:
  - Implementar `start()`: spawn Python process
  - Implementar `stop()`: graceful shutdown
  - Esperar señal READY
  - Handle process crashes
  - Auto-restart on failure
  - Unit tests
- **Acceptance**: Python process starts and stops correctly
- **Commit**: `feat: implement Python child process lifecycle management`

### Task 2.4: Implement PythonManager (IPC Protocol)
- **Time**: 3 horas
- **Files**: `src/services/face-recognition/python-manager.ts`
- **Actions**:
  - Implementar `call(method, ...args)`: send request via stdin
  - Implementar response handler: parse stdout JSON
  - Correlate requests with responses via ID
  - Handle timeouts (30s default)
  - Handle parse errors
  - Integration tests con Python script
- **Acceptance**: Can send requests and receive responses
- **Commit**: `feat: implement Python IPC protocol with request/response correlation`

### Task 2.5: PythonManager Model Management
- **Time**: 1 hora
- **Files**: `src/services/face-recognition/python-manager.ts`
- **Actions**:
  - Implementar `loadModel(name, config)`
  - Implementar `listModels()`
  - Implementar `getMetrics(model)`
  - Track latency including IPC overhead
  - Unit tests
- **Acceptance**: Models loaded and tracked correctly
- **Commit**: `feat: add Python model management and metrics tracking`

---

## Phase 3: Unified Service (1 día)

### Task 3.1: Implement FaceRecognitionService (Core)
- **Time**: 3 horas
- **Files**: `src/services/face-recognition/index.ts`
- **Actions**:
  - Implementar `init()`: initialize ONNXProvider and PythonManager
  - Implementar `shutdown()`: cleanup resources
  - Implementar `listModels()`: combine both providers
  - Implementar model registry (track approach per model)
  - Error handling
  - Unit tests
- **Acceptance**: Service initializes and lists models
- **Commit**: `feat: implement unified face recognition service core`

### Task 3.2: Implement FaceRecognitionService (Operations)
- **Time**: 3 horas
- **Files**: `src/services/face-recognition/index.ts`
- **Actions**:
  - Implementar `compare(image1, image2, model)`
  - Implementar `getEmbedding(image, model)`
  - Implementar `calculateSimilarity(e1, e2)`
  - Determine approach automatically (ONNX vs Python)
  - Measure latency
  - Integration tests
- **Acceptance**: Can compare faces using different models
- **Commit**: `feat: implement face comparison and embedding generation`

### Task 3.3: Implement FaceRecognitionService (Metrics)
- **Time**: 1 hora
- **Files**: `src/services/face-recognition/index.ts`
- **Actions**:
  - Implementar `getMetrics(model)`
  - Combine metrics from both providers
  - Unit tests
- **Acceptance**: Metrics exposed correctly
- **Commit**: `feat: expose unified metrics from ONNX and Python providers`

---

## Phase 4: Benchmark System (2 días)

### Task 4.1: Download Datasets
- **Time**: 2 horas
- **Files**: `scripts/download-datasets.sh`, `datasets/`
- **Actions**:
  - Crear script para descargar datasets
  - Descargar LFW (13,233 images, 6000 pairs)
  - Descargar CFP-FP (500 subjects)
  - Descargar AgeDB-30 (12,240 images)
  - Validar integridad
- **Acceptance**: Datasets descargados y validados
- **Commit**: `chore: add dataset download script and initial datasets`

### Task 4.2: Implement Dataset Loader
- **Time**: 2 horas
- **Files**: `src/services/benchmark/dataset-loader.ts`
- **Actions**:
  - Implementar `loadDataset(name)`
  - Parse LFW pairs.txt format
  - Parse CFP-FP format
  - Parse AgeDB format
  - Validate dataset structure
  - Unit tests
- **Acceptance**: Can load and parse datasets
- **Commit**: `feat: implement dataset loader for LFW, CFP-FP, and AgeDB`

### Task 4.3: Implement Metrics Calculation
- **Time**: 3 horas
- **Files**: `src/services/benchmark/metrics.ts`
- **Actions**:
  - Implementar `calculateROC(similarities, labels)`
  - Implementar `calculateTarAtFar(rocPoints, targetFar)`
  - Implementar `calculateEER(rocPoints)`
  - Implementar `calculateAUC(rocPoints)`
  - Unit tests con known values
- **Acceptance**: Metrics calculated correctly
- **Commit**: `feat: implement face recognition accuracy metrics calculation`

### Task 4.4: Implement Benchmark Runner
- **Time**: 4 horas
- **Files**: `src/services/benchmark/runner.ts`
- **Actions**:
  - Implementar `runBenchmark(options)`
  - Load dataset
  - For each model: run comparisons
  - Calculate metrics
  - Measure performance (latency, throughput)
  - Store results
  - Integration tests
- **Acceptance**: Can run benchmark on LFW dataset
- **Commit**: `feat: implement benchmark runner with metrics collection`

### Task 4.5: Implement Results Storage (SQLite)
- **Time**: 2 horas
- **Files**: `src/services/benchmark/storage.ts`, `data/benchmarks.db`
- **Actions**:
  - Create SQLite schema (benchmark_runs, benchmark_results, benchmark_pairs)
  - Implementar `saveResults(result)`
  - Implementar `getHistory(options)`
  - Implementar `getLeaderboard(options)`
  - Unit tests
- **Acceptance**: Results stored and queryable
- **Commit**: `feat: implement SQLite storage for benchmark results`

### Task 4.6: Implement Leaderboard Generation
- **Time**: 1 hora
- **Files**: `src/services/benchmark/leaderboard.ts`
- **Actions**:
  - Implementar `generateLeaderboard(options)`
  - Support filtering by dataset
  - Support sorting by metric
  - Support limiting results
  - Export to JSON/CSV/Markdown
  - Unit tests
- **Acceptance**: Leaderboard generated correctly
- **Commit**: `feat: implement leaderboard generation with filtering and sorting`

---

## Phase 5: Integration (1 día)

### Task 5.1: Integrate with DoorCloud
- **Time**: 2 horas
- **Files**: `src/services/user.ts`, `src/network/mqtt/routes/photo.ts`
- **Actions**:
  - Replace `@vladmandic/human` with `FaceRecognitionService`
  - Update `compareFaces()` to use new service
  - Keep same API (backward compatible)
  - Update tests
  - Integration tests
- **Acceptance**: DoorCloud uses new face recognition service
- **Commit**: `feat: integrate face recognition service with DoorCloud`

### Task 5.2: Add Benchmark API Endpoints
- **Time**: 2 horas
- **Files**: `src/network/http/routes/benchmark.ts`
- **Actions**:
  - Add `POST /api/benchmark/run` endpoint
  - Add `GET /api/benchmark/results` endpoint
  - Add `GET /api/benchmark/leaderboard` endpoint
  - Add validation and error handling
  - Integration tests
- **Acceptance**: Benchmark API endpoints work
- **Commit**: `feat: add HTTP API endpoints for benchmarking`

### Task 5.3: Documentation
- **Time**: 1 hora
- **Files**: `README.md`, `docs/face-recognition.md`
- **Actions**:
  - Update README with face recognition section
  - Create face-recognition.md with:
    - Architecture overview
    - Supported models
    - How to run benchmarks
    - How to add new models
    - Performance targets
  - Add examples
- **Acceptance**: Documentation complete
- **Commit**: `docs: add face recognition and benchmarking documentation`

### Task 5.4: Final Testing & Validation
- **Time**: 1 hora
- **Files**: Various
- **Actions**:
  - Run full test suite
  - Run benchmark on LFW
  - Validate results
  - Performance validation
  - Memory usage check
- **Acceptance**: All tests pass, benchmarks work
- **Commit**: `test: validate face recognition benchmarking system`

---

## Summary

| Phase | Tasks | Time | Status |
|-------|-------|------|--------|
| 0. Code Cleanup & Security | 5 | 1 día | ✅ Complete |
| 1. ONNX Runtime Setup | 5 | 2 días | 🔲 Pending |
| 2. Python Child Process | 5 | 2 días | 🔲 Pending |
| 3. Unified Service | 3 | 1 día | 🔲 Pending |
| 4. Benchmark System | 6 | 2 días | 🔲 Pending |
| 5. Integration | 4 | 1 día | 🔲 Pending |
| **Total** | **28** | **9 días** | 🔲 Pending |

## Dependencies

- ✅ P3 Operational Cleanup completado
- ✅ Node.js 22+ runtime
- ✅ Python 3.8+ instalado
- ✅ 4GB+ RAM disponible
- ✅ 5GB+ storage disponible

## Risk Mitigation

1. **ONNX models no disponibles**: Fallback a Python
2. **Python process crashes**: Auto-restart mechanism
3. **Memory limits**: Lazy loading + LRU cache
4. **Performance**: ONNX para modelos principales
5. **Integration issues**: Keep `@vladmandic/human` as fallback

## Success Criteria

- ✅ Sistema puede cargar 8-10 modelos
- ✅ Benchmarks corren en datasets estándar
- ✅ Métricas se guardan en SQLite
- ✅ Leaderboard generado automáticamente
- ✅ API unificada funciona
- ✅ Performance: <50ms latencia promedio (ONNX)
- ✅ Memoria: <2GB RAM total
