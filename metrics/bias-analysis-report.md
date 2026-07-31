# Demographic Bias Analysis — BFW Dataset

Analysis of **5 models** across **8 demographic groups** using the BFW (Balanced Faces in the Wild) dataset.

## Summary

| Model | Dim | Total | NN Acc | Groups balanced? |
|-------|-----|-------|--------|-----------------|
| dlib | 128d | 17809 | 98.9% | ⚠️ 1994–2375 |
| insightface-buffalo-s | 512d | 20000 | 97.9% | ✅ Yes |
| insightface-buffalo-l | 512d | 20000 | 99.0% | ✅ Yes |
| insightface-buffalo-m | 512d | 20000 | 98.6% | ✅ Yes |
| vladmandic-human | 1024d | 19349 | 92.8% | ⚠️ 2324–2474 |

**Best performing (highest NN accuracy):** insightface-buffalo-l (99.0%)

## dlib

- **Dimensions:** 128d
- **Total embeddings:** 17809
- **NN classification accuracy:** 98.9%

### Intra-group Similarity (cohesion)

| Group | Count | Mean Intra-Sim | Std Intra-Sim | Mean Magnitude | Variance (mean) |
|-------|-------|----------------|---------------|----------------|-----------------|
| asian_females | 2289 | 95.83% | 1.15% | 1.4297 | 1.322e-3 |
| asian_males | 2188 | 94.57% | 1.65% | 1.3941 | 1.622e-3 |
| black_females | 2300 | 93.69% | 1.31% | 1.4501 | 2.029e-3 |
| black_males | 1994 | 94.35% | 1.66% | 1.3482 | 1.578e-3 |
| indian_females | 2375 | 94.89% | 1.38% | 1.4688 | 1.695e-3 |
| indian_males | 2192 | 93.06% | 1.33% | 1.3542 | 1.945e-3 |
| white_females | 2325 | 93.37% | 1.06% | 1.5174 | 2.327e-3 |
| white_males | 2146 | 92.30% | 1.26% | 1.4341 | 2.397e-3 |

### Inter-group Similarity (centroid cosine, %)

| | asian females | asian males | black females | black males | indian females | indian males | white females | white males |
|---|---|---|---|---|---|---|---|---|
| asian females | 100.0 | 97.4 | 92.5 | 82.8 | 94.7 | 88.6 | 92.9 | 89.0 |
| asian males | 97.4 | 100.0 | 92.6 | 88.4 | 93.5 | 93.4 | 92.7 | 93.5 |
| black females | 92.5 | 92.6 | 100.0 | 93.7 | 95.1 | 93.0 | 94.8 | 91.1 |
| black males | 82.8 | 88.4 | 93.7 | 100.0 | 86.2 | 93.3 | 88.4 | 92.2 |
| indian females | 94.7 | 93.5 | 95.1 | 86.2 | 100.0 | 94.1 | 94.9 | 91.5 |
| indian males | 88.6 | 93.4 | 93.0 | 93.3 | 94.1 | 100.0 | 92.4 | 96.6 |
| white females | 92.9 | 92.7 | 94.8 | 88.4 | 94.9 | 92.4 | 100.0 | 95.8 |
| white males | 89.0 | 93.5 | 91.1 | 92.2 | 91.5 | 96.6 | 95.8 | 100.0 |

### Bias Indicators

- **Intra-similarity range:** 92.30% – 95.83% (Δ = 3.53%)
- **Group with highest cohesion:** asian females (95.83%)
- **Group with lowest cohesion:** white males (92.30%)
- **Closest groups:** asian_females ↔ asian_males (97.4%)
- **Farthest groups:** asian_females ↔ black_males (82.8%)

### Nearest-Neighbor Accuracy by Group

| Group | Same-group NN | Other-group NN | Accuracy |
|-------|---------------|---------------|----------|
| asian_females | 198 | 2 | 99.0% |
| asian_males | 197 | 3 | 98.5% |
| black_females | 197 | 3 | 98.5% |
| black_males | 198 | 2 | 99.0% |
| indian_females | 200 | 0 | 100.0% |
| indian_males | 199 | 1 | 99.5% |
| white_females | 196 | 4 | 98.0% |
| white_males | 197 | 3 | 98.5% |

## insightface-buffalo-s

- **Dimensions:** 512d
- **Total embeddings:** 20000
- **NN classification accuracy:** 97.9%

### Intra-group Similarity (cohesion)

| Group | Count | Mean Intra-Sim | Std Intra-Sim | Mean Magnitude | Variance (mean) |
|-------|-------|----------------|---------------|----------------|-----------------|
| asian_females | 2500 | 28.59% | 8.38% | 18.8920 | 6.489e-1 |
| asian_males | 2500 | 24.59% | 9.38% | 20.0769 | 7.507e-1 |
| black_females | 2500 | 25.93% | 8.16% | 20.9032 | 8.058e-1 |
| black_males | 2500 | 24.14% | 8.62% | 21.0505 | 8.255e-1 |
| indian_females | 2500 | 32.46% | 9.44% | 20.4904 | 7.413e-1 |
| indian_males | 2500 | 26.36% | 8.62% | 21.6648 | 8.622e-1 |
| white_females | 2500 | 23.62% | 9.24% | 19.9443 | 7.406e-1 |
| white_males | 2500 | 18.15% | 8.64% | 20.9390 | 8.385e-1 |

### Inter-group Similarity (centroid cosine, %)

| | asian females | asian males | black females | black males | indian females | indian males | white females | white males |
|---|---|---|---|---|---|---|---|---|
| asian females | 100.0 | 49.6 | 33.1 | 41.7 | 29.2 | 35.4 | 44.9 | 46.1 |
| asian males | 49.6 | 100.0 | 29.9 | 42.7 | 38.1 | 41.2 | 49.8 | 57.6 |
| black females | 33.1 | 29.9 | 100.0 | 34.6 | 36.8 | 35.0 | 52.4 | 51.5 |
| black males | 41.7 | 42.7 | 34.6 | 100.0 | 29.8 | 30.9 | 48.8 | 59.8 |
| indian females | 29.2 | 38.1 | 36.8 | 29.8 | 100.0 | 42.1 | 35.9 | 47.0 |
| indian males | 35.4 | 41.2 | 35.0 | 30.9 | 42.1 | 100.0 | 45.6 | 46.8 |
| white females | 44.9 | 49.8 | 52.4 | 48.8 | 35.9 | 45.6 | 100.0 | 66.6 |
| white males | 46.1 | 57.6 | 51.5 | 59.8 | 47.0 | 46.8 | 66.6 | 100.0 |

### Bias Indicators

- **Intra-similarity range:** 18.15% – 32.46% (Δ = 14.31%)
- **Group with highest cohesion:** indian females (32.46%)
- **Group with lowest cohesion:** white males (18.15%)
- **Closest groups:** white_females ↔ white_males (66.6%)
- **Farthest groups:** asian_females ↔ indian_females (29.2%)

### Nearest-Neighbor Accuracy by Group

| Group | Same-group NN | Other-group NN | Accuracy |
|-------|---------------|---------------|----------|
| asian_females | 195 | 5 | 97.5% |
| asian_males | 194 | 6 | 97.0% |
| black_females | 197 | 3 | 98.5% |
| black_males | 194 | 6 | 97.0% |
| indian_females | 198 | 2 | 99.0% |
| indian_males | 197 | 3 | 98.5% |
| white_females | 194 | 6 | 97.0% |
| white_males | 198 | 2 | 99.0% |

## insightface-buffalo-l

- **Dimensions:** 512d
- **Total embeddings:** 20000
- **NN classification accuracy:** 99.0%

### Intra-group Similarity (cohesion)

| Group | Count | Mean Intra-Sim | Std Intra-Sim | Mean Magnitude | Variance (mean) |
|-------|-------|----------------|---------------|----------------|-----------------|
| asian_females | 2500 | 19.44% | 7.72% | 21.6245 | 8.869e-1 |
| asian_males | 2500 | 18.63% | 7.79% | 22.3782 | 9.525e-1 |
| black_females | 2500 | 17.96% | 8.01% | 23.3915 | 1.041e+0 |
| black_males | 2500 | 15.39% | 8.07% | 23.4845 | 1.059e+0 |
| indian_females | 2500 | 22.58% | 8.79% | 23.1296 | 9.993e-1 |
| indian_males | 2500 | 19.57% | 7.79% | 23.8628 | 1.077e+0 |
| white_females | 2500 | 17.96% | 7.87% | 22.7601 | 9.850e-1 |
| white_males | 2500 | 15.51% | 7.40% | 23.0491 | 1.019e+0 |

### Inter-group Similarity (centroid cosine, %)

| | asian females | asian males | black females | black males | indian females | indian males | white females | white males |
|---|---|---|---|---|---|---|---|---|
| asian females | 100.0 | 62.5 | 51.8 | 45.4 | 45.9 | 33.8 | 53.2 | 47.2 |
| asian males | 62.5 | 100.0 | 52.3 | 57.5 | 44.0 | 43.7 | 57.6 | 59.7 |
| black females | 51.8 | 52.3 | 100.0 | 54.9 | 47.8 | 43.6 | 58.9 | 52.7 |
| black males | 45.4 | 57.5 | 54.9 | 100.0 | 43.9 | 48.0 | 54.8 | 59.2 |
| indian females | 45.9 | 44.0 | 47.8 | 43.9 | 100.0 | 47.2 | 51.8 | 42.8 |
| indian males | 33.8 | 43.7 | 43.6 | 48.0 | 47.2 | 100.0 | 42.3 | 48.9 |
| white females | 53.2 | 57.6 | 58.9 | 54.8 | 51.8 | 42.3 | 100.0 | 64.2 |
| white males | 47.2 | 59.7 | 52.7 | 59.2 | 42.8 | 48.9 | 64.2 | 100.0 |

### Bias Indicators

- **Intra-similarity range:** 15.39% – 22.58% (Δ = 7.19%)
- **Group with highest cohesion:** indian females (22.58%)
- **Group with lowest cohesion:** black males (15.39%)
- **Closest groups:** white_females ↔ white_males (64.2%)
- **Farthest groups:** asian_females ↔ indian_males (33.8%)

### Nearest-Neighbor Accuracy by Group

| Group | Same-group NN | Other-group NN | Accuracy |
|-------|---------------|---------------|----------|
| asian_females | 196 | 4 | 98.0% |
| asian_males | 197 | 3 | 98.5% |
| black_females | 198 | 2 | 99.0% |
| black_males | 198 | 2 | 99.0% |
| indian_females | 198 | 2 | 99.0% |
| indian_males | 198 | 2 | 99.0% |
| white_females | 199 | 1 | 99.5% |
| white_males | 200 | 0 | 100.0% |

## insightface-buffalo-m

- **Dimensions:** 512d
- **Total embeddings:** 20000
- **NN classification accuracy:** 98.6%

### Intra-group Similarity (cohesion)

| Group | Count | Mean Intra-Sim | Std Intra-Sim | Mean Magnitude | Variance (mean) |
|-------|-------|----------------|---------------|----------------|-----------------|
| asian_females | 2500 | 19.44% | 7.72% | 21.6245 | 8.869e-1 |
| asian_males | 2500 | 18.63% | 7.79% | 22.3782 | 9.525e-1 |
| black_females | 2500 | 17.96% | 8.01% | 23.3915 | 1.041e+0 |
| black_males | 2500 | 15.39% | 8.07% | 23.4845 | 1.059e+0 |
| indian_females | 2500 | 22.58% | 8.79% | 23.1296 | 9.993e-1 |
| indian_males | 2500 | 19.57% | 7.79% | 23.8628 | 1.077e+0 |
| white_females | 2500 | 17.96% | 7.87% | 22.7601 | 9.850e-1 |
| white_males | 2500 | 15.51% | 7.40% | 23.0491 | 1.019e+0 |

### Inter-group Similarity (centroid cosine, %)

| | asian females | asian males | black females | black males | indian females | indian males | white females | white males |
|---|---|---|---|---|---|---|---|---|
| asian females | 100.0 | 62.5 | 51.8 | 45.4 | 45.9 | 33.8 | 53.2 | 47.2 |
| asian males | 62.5 | 100.0 | 52.3 | 57.5 | 44.0 | 43.7 | 57.6 | 59.7 |
| black females | 51.8 | 52.3 | 100.0 | 54.9 | 47.8 | 43.6 | 58.9 | 52.7 |
| black males | 45.4 | 57.5 | 54.9 | 100.0 | 43.9 | 48.0 | 54.8 | 59.2 |
| indian females | 45.9 | 44.0 | 47.8 | 43.9 | 100.0 | 47.2 | 51.8 | 42.8 |
| indian males | 33.8 | 43.7 | 43.6 | 48.0 | 47.2 | 100.0 | 42.3 | 48.9 |
| white females | 53.2 | 57.6 | 58.9 | 54.8 | 51.8 | 42.3 | 100.0 | 64.2 |
| white males | 47.2 | 59.7 | 52.7 | 59.2 | 42.8 | 48.9 | 64.2 | 100.0 |

### Bias Indicators

- **Intra-similarity range:** 15.39% – 22.58% (Δ = 7.19%)
- **Group with highest cohesion:** indian females (22.58%)
- **Group with lowest cohesion:** black males (15.39%)
- **Closest groups:** white_females ↔ white_males (64.2%)
- **Farthest groups:** asian_females ↔ indian_males (33.8%)

### Nearest-Neighbor Accuracy by Group

| Group | Same-group NN | Other-group NN | Accuracy |
|-------|---------------|---------------|----------|
| asian_females | 198 | 2 | 99.0% |
| asian_males | 198 | 2 | 99.0% |
| black_females | 197 | 3 | 98.5% |
| black_males | 197 | 3 | 98.5% |
| indian_females | 197 | 3 | 98.5% |
| indian_males | 195 | 5 | 97.5% |
| white_females | 199 | 1 | 99.5% |
| white_males | 197 | 3 | 98.5% |

## vladmandic-human

- **Dimensions:** 1024d
- **Total embeddings:** 19349
- **NN classification accuracy:** 92.8%

### Intra-group Similarity (cohesion)

| Group | Count | Mean Intra-Sim | Std Intra-Sim | Mean Magnitude | Variance (mean) |
|-------|-------|----------------|---------------|----------------|-----------------|
| asian_females | 2474 | 71.20% | 5.19% | 10.8665 | 5.798e-2 |
| asian_males | 2402 | 68.48% | 6.09% | 11.2051 | 6.650e-2 |
| black_females | 2461 | 69.16% | 5.46% | 11.5804 | 6.951e-2 |
| black_males | 2324 | 70.21% | 5.44% | 11.9123 | 7.213e-2 |
| indian_females | 2468 | 69.78% | 5.87% | 11.1901 | 6.402e-2 |
| indian_males | 2365 | 65.32% | 5.13% | 11.2561 | 7.267e-2 |
| white_females | 2464 | 66.12% | 5.26% | 11.1443 | 6.983e-2 |
| white_males | 2391 | 64.51% | 5.11% | 11.5332 | 7.782e-2 |

### Inter-group Similarity (centroid cosine, %)

| | asian females | asian males | black females | black males | indian females | indian males | white females | white males |
|---|---|---|---|---|---|---|---|---|
| asian females | 100.0 | 91.9 | 80.3 | 67.3 | 80.4 | 71.3 | 79.8 | 71.6 |
| asian males | 91.9 | 100.0 | 79.9 | 77.1 | 76.9 | 82.2 | 79.0 | 83.8 |
| black females | 80.3 | 79.9 | 100.0 | 89.9 | 83.6 | 79.5 | 84.9 | 74.1 |
| black males | 67.3 | 77.1 | 89.9 | 100.0 | 70.3 | 84.2 | 72.7 | 79.5 |
| indian females | 80.4 | 76.9 | 83.6 | 70.3 | 100.0 | 82.7 | 84.2 | 74.5 |
| indian males | 71.3 | 82.2 | 79.5 | 84.2 | 82.7 | 100.0 | 77.3 | 90.5 |
| white females | 79.8 | 79.0 | 84.9 | 72.7 | 84.2 | 77.3 | 100.0 | 83.8 |
| white males | 71.6 | 83.8 | 74.1 | 79.5 | 74.5 | 90.5 | 83.8 | 100.0 |

### Bias Indicators

- **Intra-similarity range:** 64.51% – 71.20% (Δ = 6.69%)
- **Group with highest cohesion:** asian females (71.20%)
- **Group with lowest cohesion:** white males (64.51%)
- **Closest groups:** asian_females ↔ asian_males (91.9%)
- **Farthest groups:** asian_females ↔ black_males (67.3%)

### Nearest-Neighbor Accuracy by Group

| Group | Same-group NN | Other-group NN | Accuracy |
|-------|---------------|---------------|----------|
| asian_females | 184 | 16 | 92.0% |
| asian_males | 174 | 26 | 87.0% |
| black_females | 186 | 14 | 93.0% |
| black_males | 192 | 8 | 96.0% |
| indian_females | 186 | 14 | 93.0% |
| indian_males | 185 | 15 | 92.5% |
| white_females | 187 | 13 | 93.5% |
| white_males | 190 | 10 | 95.0% |

## Cross-Model Comparison

| Model | Dim | NN Acc | Intra-range (Δ) | Best group | Worst group |
|-------|-----|--------|-----------------|-----------|-------------|
| dlib | 128d | 98.9% | 92.3% – 95.8% (Δ=3.53%) | asian females | white males |
| insightface-buffalo-s | 512d | 97.9% | 18.2% – 32.5% (Δ=14.31%) | indian females | white males |
| insightface-buffalo-l | 512d | 99.0% | 15.4% – 22.6% (Δ=7.19%) | indian females | black males |
| insightface-buffalo-m | 512d | 98.6% | 15.4% – 22.6% (Δ=7.19%) | indian females | black males |
| vladmandic-human | 1024d | 92.8% | 64.5% – 71.2% (Δ=6.69%) | asian females | white males |

## PCA of Group Centroids

### dlib

| Group | PC1 | PC2 | Explained: PC1=42.4%, PC2=19.9% |
|-------|-----|-----|-----------|
| asian_females | 5.9954e-1 | 3.1631e-2 | |
| asian_males | 3.8430e-1 | 8.7713e-2 | |
| black_females | 2.1450e-1 | -1.0923e-1 | |
| black_males | -1.6596e-1 | -6.4192e-2 | |
| indian_females | 4.3049e-1 | 1.1448e-1 | |
| indian_males | 6.0131e-2 | 1.9975e-1 | |
| white_females | 3.1855e-1 | 2.9288e-1 | |
| white_males | 8.0125e-2 | 3.7310e-1 | |

### insightface-buffalo-s

| Group | PC1 | PC2 | Explained: PC1=26.5%, PC2=18.3% |
|-------|-----|-----|-----------|
| asian_females | 1.1837e+0 | 1.0944e+0 | |
| asian_males | 1.9473e-1 | 1.2047e+0 | |
| black_females | -4.5493e-1 | -2.6354e+0 | |
| black_males | 9.7789e-1 | -7.2665e-1 | |
| indian_females | -5.3403e+0 | -3.1323e-1 | |
| indian_males | -1.5029e+0 | 3.3060e+0 | |
| white_females | 3.4283e-1 | -3.8915e-1 | |
| white_males | -1.1326e-1 | -2.7812e-1 | |

### insightface-buffalo-l

| Group | PC1 | PC2 | Explained: PC1=25.0%, PC2=21.6% |
|-------|-----|-----|-----------|
| asian_females | 7.8630e-1 | 1.3978e+0 | |
| asian_males | 7.5590e-1 | 3.3879e-1 | |
| black_females | 8.6303e-2 | 5.5462e-1 | |
| black_males | 5.7501e-2 | -2.7084e-1 | |
| indian_females | -3.3189e+0 | 2.7067e+0 | |
| indian_males | -2.3399e+0 | -2.1655e+0 | |
| white_females | 1.3080e-1 | 8.0383e-1 | |
| white_males | 2.0843e-1 | -2.5780e-1 | |

### insightface-buffalo-m

| Group | PC1 | PC2 | Explained: PC1=24.8%, PC2=21.8% |
|-------|-----|-----|-----------|
| asian_females | 9.5047e-1 | -1.4852e+0 | |
| asian_males | 7.9998e-1 | -3.6603e-1 | |
| black_females | 1.3859e-1 | -3.9302e-1 | |
| black_males | 2.4217e-2 | 3.3381e-1 | |
| indian_females | -3.0278e+0 | -3.1243e+0 | |
| indian_males | -2.5619e+0 | 1.6925e+0 | |
| white_females | 2.0742e-1 | -6.4061e-1 | |
| white_males | 1.7553e-1 | 3.4827e-1 | |

### vladmandic-human

| Group | PC1 | PC2 | Explained: PC1=33.2%, PC2=22.6% |
|-------|-----|-----|-----------|
| asian_females | 2.6793e+0 | 2.3094e+0 | |
| asian_males | 8.7033e-1 | 1.9348e+0 | |
| black_females | -9.7213e-1 | 2.6702e+0 | |
| black_males | -3.6601e+0 | 2.9246e+0 | |
| indian_females | 1.0194e+0 | -5.7772e-1 | |
| indian_males | -1.9221e+0 | -4.9872e-1 | |
| white_females | 5.6230e-1 | -4.0778e-1 | |
| white_males | -1.5460e+0 | -9.6066e-1 | |

## Conclusions

- **Intra-group similarity range** varies by model: 3.53% – 14.31% across models. A lower range means more uniform treatment of demographic groups.
- **Nearest-neighbor accuracy** ranges from 92.8% to 99.0%. Higher values suggest the model finds demographic features more discriminative.
- **Model with most demographic bias (highest intra-range):** insightface-buffalo-s

---
_Generated by metrics/analyze-bias.ts — 2026-07-30T23:05:55.943Z_
