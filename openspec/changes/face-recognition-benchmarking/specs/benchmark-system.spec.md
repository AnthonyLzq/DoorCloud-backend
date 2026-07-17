# Benchmark System Specification

## Overview
Sistema responsable de ejecutar benchmarks de face recognition en datasets estándar, medir métricas de accuracy y performance, y generar leaderboard interno.

## Requirements

### REQ-1: Dataset Management
- **SHALL** soportar datasets estándar (LFW, CFP-FP, AgeDB-30)
- **SHALL** descargar datasets automáticamente si no existen
- **SHALL** validar integridad de datasets descargados
- **SHALL** parsear formatos de dataset (pairs.txt, folds, etc.)
- **SHALL** soportar datasets custom (futuro)

**Acceptance Criteria:**
```typescript
const dataset = await benchmarkSystem.loadDataset('lfw')
expect(dataset.pairs.length).toBe(6000) // LFW tiene 6000 pairs
expect(dataset.images.length).toBeGreaterThan(0)
```

### REQ-2: Benchmark Execution
- **SHALL** ejecutar benchmark para uno o múltiples modelos
- **SHALL** procesar todas las pairs del dataset
- **SHALL** calcular similarity para cada pair
- **SHALL** medir latencia de cada inference
- **SHALL** soportar ejecución paralela (modelos independientes)

**Acceptance Criteria:**
```typescript
const results = await benchmarkSystem.runBenchmark({
  dataset: 'lfw',
  models: ['insightface-buffalo-l', 'adaface', 'mediapipe']
})
expect(results.length).toBe(3)
expect(results[0].pairs.length).toBe(6000)
```

### REQ-3: Accuracy Metrics
- **SHALL** calcular TAR@FAR=0.001 (True Accept Rate @ False Accept Rate)
- **SHALL** calcular AUC (Area Under ROC Curve)
- **SHALL** calcular EER (Equal Error Rate)
- **SHALL** calcular accuracy con threshold óptimo
- **SHALL** generar ROC curve data

**Acceptance Criteria:**
```typescript
const metrics = benchmarkSystem.calculateAccuracy(similarities, labels)
expect(metrics.tarAtFar001).toBeGreaterThan(0.95)
expect(metrics.auc).toBeGreaterThan(0.95)
expect(metrics.eer).toBeLessThan(0.05)
```

### REQ-4: Performance Metrics
- **SHALL** medir latencia promedio por inference
- **SHALL** medir latencia p95 y p99
- **SHALL** calcular throughput (imágenes/segundo)
- **SHALL** trackear uso de memoria
- **SHALL** medir tiempo de carga del modelo

**Acceptance Criteria:**
```typescript
const perfMetrics = benchmarkSystem.calculatePerformance(latencies)
expect(perfMetrics.avgLatency).toBeLessThan(50) // ms
expect(perfMetrics.throughput).toBeGreaterThan(20) // img/s
expect(perfMetrics.memoryUsage).toBeDefined()
```

### REQ-5: Results Storage
- **SHALL** guardar resultados en SQLite
- **SHALL** almacenar métricas de accuracy y performance
- **SHALL** almacenar metadata del benchmark (fecha, dataset, modelos)
- **SHALL** permitir consultar resultados históricos
- **SHALL** permitir comparar resultados entre runs

**Acceptance Criteria:**
```typescript
await benchmarkSystem.saveResults(benchmarkRun)
const history = await benchmarkSystem.getHistory({
  dataset: 'lfw',
  model: 'insightface-buffalo-l'
})
expect(history.length).toBeGreaterThan(0)
```

### REQ-6: Leaderboard Generation
- **SHALL** generar leaderboard basado en métricas
- **SHALL** rankear modelos por accuracy (TAR@FAR=0.001)
- **SHALL** incluir métricas de performance
- **SHALL** soportar filtrado por dataset
- **SHALL** exportar leaderboard (JSON, CSV, Markdown)

**Acceptance Criteria:**
```typescript
const leaderboard = await benchmarkSystem.generateLeaderboard({
  dataset: 'lfw',
  sortBy: 'tarAtFar001',
  limit: 10
})
expect(leaderboard.length).toBeLessThanOrEqual(10)
expect(leaderboard[0].tarAtFar001).toBeGreaterThan(leaderboard[1].tarAtFar001)
```

## Technical Details

### Dataset Schema
```typescript
interface Dataset {
  name: string
  pairs: Array<{
    image1: string
    image2: string
    samePerson: boolean
  }>
  images: string[]
  metadata: {
    totalImages: number
    totalPairs: number
    positivePairs: number
    negativePairs: number
  }
}
```

### Benchmark Result Schema
```typescript
interface BenchmarkResult {
  id: string
  dataset: string
  model: string
  timestamp: Date
  accuracy: {
    tarAtFar001: number
    auc: number
    eer: number
    accuracy: number
    threshold: number
  }
  performance: {
    avgLatency: number
    p95Latency: number
    p99Latency: number
    throughput: number
    memoryUsage: number
    modelLoadTime: number
  }
  pairs: Array<{
    image1: string
    image2: string
    samePerson: boolean
    similarity: number
    latency: number
  }>
}
```

### ROC Curve Calculation
```typescript
function calculateROC(similarities: number[], labels: boolean[]) {
  const thresholds = generateThresholds(0, 1, 1000)
  const rocPoints = thresholds.map(threshold => {
    const predictions = similarities.map(s => s >= threshold)
    const tp = predictions.filter((p, i) => p && labels[i]).length
    const fp = predictions.filter((p, i) => p && !labels[i]).length
    const fn = predictions.filter((p, i) => !p && labels[i]).length
    const tn = predictions.filter((p, i) => !p && !labels[i]).length
    
    return {
      threshold,
      tar: tp / (tp + fn), // True Accept Rate
      far: fp / (fp + tn)  // False Accept Rate
    }
  })
  
  return rocPoints
}
```

### TAR@FAR=0.001 Calculation
```typescript
function calculateTarAtFar(rocPoints: ROCPoint[], targetFar: number = 0.001) {
  // Encontrar punto donde FAR <= targetFar
  const validPoints = rocPoints.filter(p => p.far <= targetFar)
  if (validPoints.length === 0) return 0
  
  // Retornar TAR máximo en ese rango
  return Math.max(...validPoints.map(p => p.tar))
}
```

### EER Calculation
```typescript
function calculateEER(rocPoints: ROCPoint[]) {
  // EER es donde TAR = 1 - FAR (o FRR = FAR)
  let minDiff = Infinity
  let eer = 0
  
  for (const point of rocPoints) {
    const frr = 1 - point.tar
    const diff = Math.abs(point.far - frr)
    
    if (diff < minDiff) {
      minDiff = diff
      eer = (point.far + frr) / 2
    }
  }
  
  return eer
}
```

### SQLite Schema
```sql
CREATE TABLE benchmark_runs (
  id TEXT PRIMARY KEY,
  dataset TEXT NOT NULL,
  model TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT -- JSON
);

CREATE TABLE benchmark_results (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES benchmark_runs(id),
  tar_at_far_001 REAL,
  auc REAL,
  eer REAL,
  accuracy REAL,
  threshold REAL,
  avg_latency REAL,
  p95_latency REAL,
  p99_latency REAL,
  throughput REAL,
  memory_usage REAL,
  model_load_time REAL
);

CREATE TABLE benchmark_pairs (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES benchmark_runs(id),
  image1 TEXT,
  image2 TEXT,
  same_person BOOLEAN,
  similarity REAL,
  latency REAL
);
```

## Supported Datasets

### LFW (Labeled Faces in the Wild)
- **Images**: 13,233
- **Pairs**: 6,000 (3,000 positive, 3,000 negative)
- **Format**: pairs.txt
- **Download**: http://vis-www.cs.umass.edu/lfw/

### CFP-FP (Celebrities in Frontal-Profile)
- **Images**: 500 subjects × 10 images
- **Pairs**: 700 pairs (frontal vs profile)
- **Format**: Custom format
- **Download**: http://www.cfpw.io/

### AgeDB-30
- **Images**: 12,240 images
- **Pairs**: 600 pairs (same person, 30 years apart)
- **Format**: Custom format
- **Download**: https://ibug.doc.ic.ac.uk/resources/agedb/

## Performance Targets
- **Benchmark execution**: <10 min para LFW (6000 pairs)
- **ROC calculation**: <1s
- **Results storage**: <5s
- **Leaderboard generation**: <1s

## Testing Strategy
- **Unit tests**: ROC calculation, EER, TAR@FAR
- **Integration tests**: End-to-end benchmark con dataset pequeño
- **Performance tests**: Benchmark execution time
- **Data tests**: Dataset parsing, validation

## Error Handling
- **Dataset not found**: Descargar automáticamente o error claro
- **Invalid pair**: Skipear pair, loguear warning
- **Model failure**: Skipear modelo, continuar con otros
- **Storage failure**: Retry con backoff, error si persiste

## Future Enhancements
- Dashboard web para visualización
- Automated benchmarks en CI/CD
- Statistical significance testing
- Confidence intervals
- Cross-validation support
- Custom metrics support
