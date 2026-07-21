# Benchmark Metrics

## ROC (Receiver Operating Characteristic)

Curva que muestra el tradeoff entre TPR (true positive rate) y FPR (false positive rate) al variar el umbral de decision.

- **TPR** = True Positive / Total Positives (cuantos mismos acepto)
- **FPR** = False Positive / Total Negatives (cuantos diferentes acepto por error)

Se construye ordenando las similitudes de mayor a menor y acumulando TPR/FPR en cada punto.

## TAR@FAR (True Acceptance Rate at False Acceptance Rate)

Estandar en face recognition. Dado un FAR maximo tolerable (ej: 0.1% de falsos positivos), cual es la tasa de acierto?

```
TAR@FAR=0.001 → 0.992  (99.2% de acierto con 0.1% de falsos)
```

## EER (Equal Error Rate)

Punto donde FAR = FRR (False Rejection Rate = 1 - TPR). Un solo numero que resume calidad del modelo: mas bajo es mejor. EER=0.05 significa ~5% de error simetrico en ese umbral.

## AUC (Area Under Curve)

Area bajo la curva ROC. Integra el tradeoff completo en un solo valor:
- 1.0 = perfecto
- 0.5 = aleatorio
- 0.0 = siempre erra

## Referencia

Implementacion en `src/services/benchmark/metrics.ts`.
