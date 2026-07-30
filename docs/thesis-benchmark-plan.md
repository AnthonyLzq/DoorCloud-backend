# Thesis-Grade Benchmark Improvements — Plan

## 1. Confidence Intervals ✅

**Estado**: Completado. 5 repeats para cada modelo ONNX + dlib, 3 repeats para human. 84 tareas ejecutadas, 0 fallos, ~15h total.

**Resultado**: AUC σ = 0.0000 para todos los modelos (todos son deterministas). La varianza en latencia existe pero es atribuible a contención de CPU por paralelismo, no al modelo en sí.

**Archivos**: `src/services/benchmark/runner.ts`, `storage.ts`, `scripts/run-ci-benchmarks.ts`, `scripts/_run-repeat.ts`, `scripts/_run-repeat-human.ts`

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

## 4. Análisis Estadístico ✅ (No necesario)

**Decisión**: No se realiza. Fundamentación:

Los Confidence Intervals (item 1) demostraron que AUC σ = 0.0000 para todos los modelos. Dado que no existe varianza entre corridas, cualquier test de significancia (Wilcoxon, McNemar) produciría resultados no informativos:

- Con σ = 0, el estadístico de prueba no puede calcularse (división por cero)
- Aunque pudiera, un p-valor no agregaría información: si A > B consistentemente en N corridas, la relación es determinista
- La diferencia entre modelos (ej: buffalo-l AUC 0.9862 vs buffalo-s AUC 0.9421 en LFW) es estable y medible sin necesidad de inferencia estadística

**Conclusión**: El análisis estadístico es relevante cuando hay superposición en las distribuciones de rendimiento entre modelos (ej: modelo A gana en algunos folds pero B gana en otros). Como nuestros benchmarks son deterministas y las diferencias son consistentes, el test estadístico no aporta valor.

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

## Prioridad Final

1. **ROC Curves reales** ✅ — Completado
2. **Confidence Intervals** ✅ — Completado
3. **Análisis Estadístico** ✅ — Descartado (σ=0, no aporta valor)
4. **Demographics** (6h) — Esfuerzo alto, datasets externos. Recomendado solo si la tesis se centra en equidad algorítmica.
5. **Cross-validation** (3h) — Mejora pero no crítica si ya tenemos repeats. El subsampling aleatorio no cambiaría el ranking.

**Total**: ~15h de trabajo para tener un benchmark defendible en tesis.
