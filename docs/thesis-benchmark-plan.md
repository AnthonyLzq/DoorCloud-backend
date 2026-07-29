# Thesis-Grade Benchmark Improvements — Plan

## 1. Confidence Intervals

**Estado**: 1 corrida por modelo/dataset. Sin desviación estándar.

**Qué hacer**: Modificar el runner para que cada modelo/dataset se ejecute N veces (ej: 5) y reportar media ± std de AUC, EER y latencia.

```
runBenchmark({ dataset: 'lfw', models: ['buffalo-s'], repeats: 5 })
```

**Archivos**: `src/services/benchmark/runner.ts`, `storage.ts`, `scripts/histogram_for_metrics.py`

**Tiempo**: ~3h

---

## 2. ROC Curves Reales ✅

**Estado**: Completado. Ahora exportamos los puntos reales desde SQLite a `metrics/roc-points.csv` (1013 puntos sampleados, 51KB), y el script Python lee esos datos directamente en vez de aproximar syntheticamente.

**Archivos**: `scripts/histogram_for_metrics.py`, `metrics/roc-points.csv`

---

## 3. Cross-Validation

**Estado**: Usamos el split fijo de los datasets.

**Qué hacer**: No estamos entrenando modelos, solo evaluando. En vez de k-fold clásico, podemos hacer **subsampling aleatorio**: correr el mismo modelo en subsets aleatorios del dataset (80%, 90%, 100%) y medir la varianza del AUC.

```
runBenchmark({ dataset: 'lfw', models: ['buffalo-s'], subsample: 0.8 })
```

**Archivos**: `src/services/benchmark/runner.ts`, `dataset-loader.ts`

**Tiempo**: ~3h

---

## 4. Análisis Estadístico

**Estado**: No hay tests de significancia.

**Qué hacer**: Script Python que aplique:
- **Wilcoxon signed-rank test** entre distribuciones de AUC de cada par de modelos
- **McNemar's test** sobre predicciones por pares

```
python3 scripts/statistical-analysis.py
→ buffalo-l vs buffalo-m: p = 0.45 (no significativo)
→ buffalo-l vs buffalo-s: p < 0.001 (significativo)
```

**Archivos**: `scripts/statistical-analysis.py` (nuevo), `docs/benchmark-analysis.md`

**Tiempo**: ~2h

---

## 5. Demographics

**Estado**: No analizamos rendimiento por grupo demográfico.

**Qué hacer**: Necesitamos datasets con etiquetas demográficas. Opciones:
- **RFW (Racial Faces in the Wild)**: 4 grupos étnicos (Africano, Asiático, Caucásico, Indio)
- **MORPH**: Edad y género
- **Adience**: Edad y género

Estos datasets traen los metadatos demográficos. Habría que descargarlos, parsearlos y correr los mismos benchmarks segmentando por grupo.

**Archivos**: `scripts/download-demographic-datasets.sh`, `scripts/demographic-analysis.py`

**Tiempo**: ~6h (incluye descarga de datasets, ~2-5GB)

---

## Prioridad Sugerida

1. **ROC Curves reales** (1h) — quick win, ya tenemos los datos
2. **Confidence Intervals** (3h) — necesario para cualquier afirmación estadística
3. **Análisis Estadístico** (2h) — depende de #2 (necesita múltiples corridas)
4. **Demographics** (6h) — esfuerzo alto, datasets externos
5. **Cross-validation** (3h) — mejora pero no crítica si ya tenemos repeats

**Total**: ~15h de trabajo para tener un benchmark defendible en tesis.
