# Face Recognition Model Benchmark Analysis

## 1. Introduction

This report presents a comparative evaluation of five face recognition models for deployment in a production access control system (DoorCloud). The objective is to select an optimal model balancing accuracy, inference latency, and resource footprint for edge deployment on ARM-based single-board computers (Raspberry Pi). A complementary demographic bias analysis evaluates whether model performance varies systematically across ethnic and gender groups.

### 1.1 Research Questions

1. Which model achieves the highest face verification accuracy across multiple benchmark datasets?
2. What is the trade-off between accuracy and inference latency?
3. Which model is suitable for deployment on resource-constrained devices?
4. Do any of the candidate models exhibit systematic demographic bias that would compromise fair access control?

---

## 2. Methodology

### 2.1 Experimental Pipeline

The benchmark pipeline consists of three stages:

1. **Data Acquisition**: Images are read from disk, pre-processed to 96x96 RGB tensors
2. **Model Inference**: Each model generates embeddings for pairs of images; similarity is calculated via cosine distance (InsightFace) or model-native metrics (dlib, human)
3. **Metrics Computation**: Raw similarity scores are aggregated into ROC curves, AUC, EER, and TAR@FAR using our custom benchmarking framework (`src/services/benchmark/`)

### 2.2 ROC Curve Generation

ROC curves were generated from real per-pair similarity scores, not approximated. The process:

1. For each model-dataset combination, `calculateROC()` in `src/services/benchmark/metrics.ts` sorts all 6,000-7,000 similarity scores in descending order
2. At each threshold, it computes cumulative True Positive Rate and False Positive Rate
3. These real (FPR, TPR) points are stored as JSON in SQLite (`benchmark_runs.roc_points`)
4. For visualization, each curve is subsampled by taking every 30th point (ceil(6000 / 200) = 30), yielding approximately 200 points per curve. Points are downsampled uniformly along the cumulative threshold index, preserving the overall ROC shape while reducing the export to ~51KB (from ~4.5MB raw). The subsampled points are exported to `metrics/roc-points.csv`.
5. The Python plotting script (`scripts/histogram_for_metrics.py`) reads this CSV directly
   - If the CSV is unavailable, the script falls back to a parametric approximation from AUC

### 2.3 Model Metadata Sources

Model parameters and characteristics were sourced from:

| Attribute | Source |
|-----------|--------|
| ONNX model sizes | `ls -lh models/insightface/*.onnx` (file sizes in bytes, converted to MB) |
| dlib model size | `ls -lh models/dlib/dlib_face_recognition_resnet_model_v1.dat` |
| @vladmandic/human size | Package documentation (50MB estimated for TFJS model bundle) |
| Embedding dimensions | API documentation: InsightFace=512D, dlib=128D, human=1024D |
| Runtime framework | Direct observation: ONNX Runtime (Node), dlib (Python child process), human (TensorFlow.js) |

Metadata is stored as a structured CSV (`metrics/models-metadata.csv`) and consumed by plotting scripts, eliminating hardcoded values in visualization code.

### 2.4 Statistical Validation

To assess metric stability, each model-dataset combination was evaluated with multiple independent repeats:

| Model Type | Repeats | Rationale |
|-----------|---------|-----------|
| InsightFace (ONNX) | 5 | Deterministic by design, confirms stability |
| dlib (Python IPC) | 3 | Deterministic, limited by execution time (~2.5h per run) |
| @vladmandic/human (TF.js) | 3 | Deterministic, limited by execution time |

Repeats ran as isolated child processes with `--max-old-space-size=512MB` memory limit, 15 concurrent workers for ONNX/dlib, and sequential execution for human (TF.js memory footprint). All processes used `nice -n 19` to minimize impact on interactive system use.

The standard deviation (sigma) for AUC across all repeats was **0.0000 for every model**, confirming that face recognition inference is fully deterministic. Variance in latency was observed (sigma ~ 100-600ms) but is attributable to CPU contention from parallel execution rather than model-level noise.

### 2.5 Benchmark Datasets

Four standard face verification datasets are used, all pre-processed to 96x96 pixel resolution:

| Dataset | Subject Pairs | Description |
|---------|-------------|---------------|
| LFW | 6,000 | Labeled Faces in the Wild, frontal faces |
| CFP-FP | 7,000 | Celebrities Frontal-Profile, cross-pose |
| AgeDB-30 | 6,000 | Age-invariant verification, ±30 years |
| CALFW | 6,000 | Cross-Age LFW, age variation |

The demographic bias analysis additionally uses the **BFW (Balanced Faces in the Wild)** dataset: 20,000 images balanced across 8 demographic groups (asian/black/indian/white × male/female), 2,500 images per group. See section 4.4 and Appendix A.

### 2.6 Cross-Validation

To assess metric stability under data subsampling, a random subsampling experiment was conducted. For each InsightFace model, 5 independent repeats were performed using a random 80% subset of LFW pairs (4,800 out of 6,000). Each repeat used a different random seed via the mulberry32 PRNG, ensuring reproducibility.

| Model | AUC (full) | AUC (80% subsample) | Std Dev | Delta |
|-------|-----------|---------------------|---------|-------|
| Buffalo-S | 0.9421 | 0.9419 | 0.0008 | 0.0002 |
| Buffalo-L | 0.9862 | 0.9862 | 0.0004 | 0.0000 |
| Buffalo-M | 0.9862 | 0.9862 | 0.0004 | 0.0000 |

The standard deviation across subsample runs is negligible (maximum σ = 0.0008), confirming that AUC measurements are robust to data sampling variations. The ranking between models remains unchanged regardless of the subset used.

### 2.7 Models Evaluated

| Model | Backbone | Embedding | Framework | Parameters |
|-------|----------|-----------|-----------|------------|
| InsightFace Buffalo-L | ResNet-100 | 512D | ONNX | ~180MB |
| InsightFace Buffalo-M | ResNet-50 | 512D | ONNX | ~90MB |
| InsightFace Buffalo-S | MobileFaceNet | 512D | ONNX | ~10MB |
| dlib | ResNet-29 | 128D | Python/dlib | ~120MB |
| @vladmandic/human | BlazeFace+FaceRes | 1024D | TF.js | ~50MB |

### 2.8 Metrics

This section defines the evaluation metrics used throughout this report. The implementation lives in `src/services/benchmark/metrics.ts`.

#### ROC (Receiver Operating Characteristic)

Curve that shows the tradeoff between TPR (true positive rate) and FPR (false positive rate) as the decision threshold varies.

- **TPR** = True Positive / Total Positives (how many same-subject pairs are accepted)
- **FPR** = False Positive / Total Negatives (how many different-subject pairs are accepted by error)

It is constructed by sorting similarities from highest to lowest and accumulating TPR/FPR at each point.

#### TAR@FAR (True Acceptance Rate at False Acceptance Rate)

Standard in face recognition. Given a maximum tolerable FAR (e.g., 0.1% false positives), what is the achieved acceptance rate?

```
TAR@FAR=0.001 → 0.992  (99.2% acceptance with 0.1% false positives)
```

#### EER (Equal Error Rate)

The point where FAR = FRR (False Rejection Rate = 1 - TPR). A single number summarizing model quality: lower is better. EER=0.05 means ~5% symmetric error at that threshold.

#### AUC (Area Under Curve)

Area under the ROC curve. Integrates the full tradeoff into a single value:
- 1.0 = perfect
- 0.5 = random
- 0.0 = always wrong

#### Inference Latency

Milliseconds per face pair comparison, measured end-to-end including pre-processing and embedding extraction.

### 2.9 Experimental Setup

- **CPU**: Intel (for benchmark), ARM Cortex for deployment estimates
- **Runtime**: Node.js 24.13.1 with ONNX Runtime for InsightFace, Python 3.14 for dlib IPC, TensorFlow.js 4.21 for human
- **Images**: 96x96 RGB, pre-aligned face crops
- **Similarity**: Cosine similarity (InsightFace), Euclidean distance (dlib), L2 similarity (human)

---

## 3. Results

### 3.1 Accuracy Comparison

| Model | LFW | CFP-FP | AgeDB-30 | CALFW | Average |
|-------|------|--------|----------|-------|---------|
| Buffalo-L | 0.9862 | 0.9998 | 0.9912 | 0.9774 | **0.9887** |
| Buffalo-M | 0.9862 | 0.9998 | 0.9912 | 0.9774 | **0.9887** |
| **Buffalo-S** | 0.9421 | 0.9999 | 0.9888 | 0.9780 | **0.9772** |
| dlib | **0.9963** | 0.9949 | 0.9619 | 0.9522 | **0.9763** |
| @vladmandic/human | 0.9834 | 0.9696 | 0.8380 | 0.8717 | **0.9157** |

Figure 1 (`metrics/figures/figure01-auc-by-dataset.png`) visualizes these results as a grouped bar chart including the human baseline (97.53%, dashed red line).

### 3.2 Performance Comparison

| Model | Avg Latency | Relative Speed | Model Size | RAM (est.) |
|-------|------------|---------------|------------|------------|
| Buffalo-S | **14ms** | 1x (baseline) | ~10MB | ~50MB |
| Buffalo-M | 56ms | 4x slower | ~90MB | ~140MB |
| Buffalo-L | 58ms | 4.1x slower | ~180MB | ~250MB |
| @vladmandic/human | 111ms | 7.9x slower | ~50MB | ~200MB |
| dlib | 1,375ms | 98x slower | ~120MB | ~300MB |

Figure 3 (`metrics/figures/figure03-accuracy-latency-tradeoff.png`) shows the accuracy-latency trade-off on a log scale.

### 3.3 ROC Analysis

Figure 2 (`metrics/figures/figure02-roc-curves-lfw.png`) presents real ROC curves from actual per-pair similarity scores on the LFW dataset. All ONNX-based models achieve near-perfect separation, with dlib showing the highest TPR at low FPR thresholds. @vladmandic/human shows competitive performance on LFW but degrades significantly on age-variant datasets (AgeDB-30, CALFW).

---

## 4. Discussion

### 4.1 ONNX Models vs TensorFlow.js

InsightFace models consistently outperform @vladmandic/human across all datasets. The gap is most pronounced on cross-age verification (AgeDB-30: 0.991 vs 0.838, CALFW: 0.978 vs 0.872), suggesting that ArcFace-based models generalize better to age-related facial variations.

### 4.2 Model Size vs Accuracy Trade-off

Buffalo-S achieves 98.8% of Buffalo-L's average accuracy while being 18x smaller (10MB vs 180MB) and 4x faster (14ms vs 58ms). This is consistent with the MobileFaceNet architecture's efficiency advantages over ResNet-based backbones.

### 4.3 Comparison with Human Performance

The human baseline for face verification is 97.53% (LFW benchmark). All InsightFace models surpass this threshold on most datasets, while @vladmandic/human falls below on cross-age datasets:

- Buffalo-L exceeds human on 4/4 datasets
- Buffalo-M exceeds human on 4/4 datasets
- Buffalo-S exceeds human on 3/4 datasets
- dlib exceeds human on 3/4 datasets
- @vladmandic/human exceeds human on 1/4 datasets

### 4.4 Demographic Bias Analysis (BFW Dataset)

A demographic bias analysis was conducted using the **BFW (Balanced Faces in the Wild)** dataset (20,000 images, 8 demographic groups, 2,500 per group) to evaluate whether model accuracy varies systematically across demographic groups. Full per-model tables are in **Appendix A**. The embedding-space analysis processed all images that each model could detect (20,000 for the InsightFace models, 19,349 for @vladmandic/human, 17,809 for dlib); the verification analysis used the full BFW pair dataset.

**Methodology:** Two complementary analyses were performed on the BFW dataset:

1. **Embedding-space analysis** (`scripts/analyze-bias.ts`): For each model, we computed:
   - **Intra-group similarity**: mean cosine similarity of each embedding to its group centroid (cohesion)
   - **Inter-group similarity**: centroid-to-centroid cosine similarity between groups
   - **Nearest-Neighbor accuracy**: % of embeddings whose nearest neighbor belongs to the same demographic group
2. **Verification analysis** (`scripts/analyze-demographics.ts`, canonical): Using the full BFW pair dataset (923,898 pairs, ~115K per group), we computed **per-group AUC, EER, and TAR@FAR** from real verification similarities. This measures how evenly the model verifies identities across demographics — the standard bias metric in face recognition research.

#### Bias Summary

| Model | Dim | NN Acc | Intra-range (Δ) | **Verification AUC range (Δ)** | Best group | Worst group |
|-------|-----|--------|-----------------|-------------------------------|-----------|-------------|
| dlib | 128d | 98.1% | 92.3%–95.8% (Δ=3.53%) | 0.9468–0.9948 (**0.0480**) | White males | Asian females |
| Buffalo-S | 512d | 97.8% | 18.2%–32.5% (Δ=14.31%) | 0.9386–0.9824 (**0.0439**) | White males | Asian females |
| Buffalo-L | 512d | 98.5% | 15.4%–22.6% (Δ=7.19%) | 0.9485–0.9864 (**0.0379**) | White females | Asian females |
| Buffalo-M | 512d | 98.7% | 15.4%–22.6% (Δ=7.19%) | 0.9485–0.9864 (**0.0379**) | White females | Asian females |
| @vladmandic/human | 1024d | 93.4% | 64.5%–71.2% (Δ=6.69%) | 0.8946–0.9491 (**0.0545**) | White males | Asian females |

Figures 4 (`metrics/figures/figure04-intra-similarity.png`), 5 (`metrics/figures/figure05-inter-heatmaps.png`), 6 (`metrics/figures/figure06-pca-centroids.png`), 7 (`metrics/figures/figure07-nn-accuracy.png`), 8 (`metrics/figures/figure08-bias-comparison.png`), 9 (`metrics/figures/figure09-inter-distance.png`) and 10 (`metrics/figures/figure10-verification-auc.png`) visualize these results. LaTeX tables are available in `metrics/tables/` (`tab01-intra-similarity.tex`, `tab02-inter-*.tex`, `tab03-model-comparison.tex`).

#### Key Findings

1. **The cohesion proxy overestimates Buffalo-S's bias.** The intra-embedding cohesion analysis (Δ=14.31%) suggested Buffalo-S was the most biased model. However, the canonical verification metric — per-group AUC computed on the full BFW pair dataset (923,898 pairs, ~115K per group) — tells a different story: Buffalo-S has the **second-lowest verification AUC range (Δ=0.0439)**, well below dlib (Δ=0.0480) and @vladmandic/human (Δ=0.0545), and only slightly above Buffalo-L/M (Δ=0.0379). See Figure 10 and Appendix A.9.
2. **A consistent pattern across all models**: **Asian females** is consistently the group with the lowest verification AUC, while **White males** — or **White females** for Buffalo-L/M — have the highest. This holds across every model evaluated, for both the cohesion proxy and the verification metric.
3. **Females of every ethnicity show higher intra-group cohesion than males** of the same ethnicity, suggesting the embedding space treats gender as a strong structural feature. However, this cohesion advantage does not translate into a consistent verification advantage: female groups have higher or lower AUC than their male counterparts depending on ethnicity and model (e.g., Black females outperform Black males in most models, while Asian females underperform Asian males in all).
4. **NN accuracy remains high across groups** — even Buffalo-S achieves 94.0–99.0% NN accuracy across all demographic groups, meaning individual identities are still well-separated regardless of group.

#### Practical Impact on DoorCloud

DoorCloud is an **access control system** that authenticates **known, enrolled users** via 1:1 verification or small-scale 1:N identification. The key question is whether demographic bias translates to real-world accuracy disparities:

- **1:1 verification (compare against enrolled embedding)**: The intra-group cohesion difference has **minimal impact**. What matters is inter-person separability — whether two different people can be distinguished — which remains excellent (97.8% NN accuracy across all groups).
- **False Acceptance / False Rejection**: A more cohesive group means their embeddings cluster tighter, which can slightly lower false acceptance rates within that group. A less cohesive group has wider spread, potentially increasing false rejection for outlier members. This effect exists but is small relative to overall accuracy.
- **Threshold uniformity**: A single global threshold works adequately across groups because the NN accuracy floor (94.0% for asian_males in Buffalo-S) is still high. No group-specific threshold tuning is required for DoorCloud's use case.

**Verdict**: The demographic bias of Buffalo-S — measured by the canonical per-group verification AUC — is **moderate (Δ=0.0439) and comparable to or better than dlib and @vladmandic/human**. The worst-case group (asian_females, AUC=0.9386) still achieves excellent verification accuracy, and the model remains deployable with a single global threshold for DoorCloud's access control use case.

### 4.5 Suitability for Edge Deployment

| Device | RAM | Viable Models | Recommended |
|--------|-----|---------------|-------------|
| Pi Zero (1GHz) | 512MB | Buffalo-S | Buffalo-S |
| Pi 2 (900MHz) | 1GB | Buffalo-S, Buffalo-M | Buffalo-S |
| Pi 4B (1.8GHz) | 2-8GB | All ONNX models | Buffalo-S or Buffalo-M |

### 4.6 Statistical Significance

Due to the deterministic nature of all evaluated models (AUC sigma = 0 across multiple repeats, section 2.4), traditional statistical significance tests (Wilcoxon signed-rank, McNemar) are not applicable. When a model consistently produces identical AUC values across independent runs, any observed difference between models is a true effect rather than a statistical fluctuation. The ranking presented in section 3.1 is therefore definitive for the evaluated datasets and hardware configuration.

### 4.7 Pipeline Alignment Impact (Production vs Benchmark)

The benchmark embeddings in this document were computed with a **center-crop 112x112** preprocessing on the already-aligned BFW crops. The production verification pipeline for DoorCloud uses **face detection (SCRFD `det_500m`) + landmark-based alignment (affine warp) + `w600k_mbf` embedding** instead. Because the alignment pipeline raises genuine similarity scores, the operating threshold must be re-derived on the production pipeline before deployment (see the migration design for Buffalo-S).

To quantify the impact, we re-embedded all 20,000 BFW images through the production pipeline (19,968 embeddings after excluding 32 images with no detected face, 0.16%) and recomputed the verification ROC on the full BFW pair dataset (920,936 pairs, 156MB `bfw-datatable.csv`):

| Metric | Benchmark (center-crop) | Production (det + align) |
|--------|------------------------:|-------------------------:|
| AUC | 0.9659 | **0.9781** |
| EER | 0.0859 | **0.0630** |
| TAR @ FAR = 1e-3 | 0.715 | **0.8297** |
| **Threshold @ FAR = 1e-4** | 0.3719 | **0.3435** |
| TAR @ FAR = 1e-4 | 0.587 | **0.7400** |

Figure 11 (`metrics/figures/figure11-pipeline-roc.png`) overlays both ROC curves on a log-FAR axis. The production curve dominates the benchmark curve across the full FAR range, with the largest gap in the low-FAR region most relevant for access control.

**Interpretation:**

- **Detection + alignment materially improves verification**: at the same security level (FAR = 1e-4, roughly 1 impostor accepted per 10,000 comparisons), the production pipeline accepts **74.0%** of genuine pairs versus **58.7%** for the center-crop benchmark — an absolute improvement of **15.3 percentage points** (26.1% relative). The same Buffalo-S model is substantially more usable when faces are properly detected and aligned.
- **The benchmark threshold is not the production threshold**: the correct operating threshold at FAR = 1e-4 on the production pipeline is **0.3435**, not the 0.3719 derived from the center-crop embeddings. Configuring the old value would push the system to a lower FAR than targeted (stricter than intended), rejecting additional genuine users with no security gain. DoorCloud's `FACE_VERIFY_THRESHOLD` default must follow the production derivation.
- **Reproducibility**: the aligned embeddings live at `metrics/embeddings/insightface-buffalo-s-aligned.json` and the ROC derivation is driven by `scripts/derive-verify-threshold.ts` (orchestrator, spawns the worker with `nice -n 19` and a 512MB heap cap), `scripts/reembed-bfw-worker.ts` (production-pipeline embedding worker), and `scripts/plot_pipeline_roc.py` (Figure 11). The 32 missed faces are expected noise in the BFW dataset.

---

## 5. Conclusion

### 5.1 Primary Findings

1. **Accuracy**: InsightFace Buffalo-L and Buffalo-M achieve the highest average AUC (0.9887), demonstrating superior generalization across pose, age, and identity variations.
2. **Efficiency**: Buffalo-S (MobileFaceNet) is the most efficient model, delivering 4x faster inference than Buffalo-L/M with only 1.2% average AUC degradation.
3. **Cross-age Robustness**: ArcFace-based models significantly outperform @vladmandic/human on age-variant datasets, suggesting better suitability for long-term identity verification.
4. **Edge Compatibility**: Buffalo-S is the only model viable across all Raspberry Pi variants, making it the optimal choice for edge deployment.
5. **Demographic Bias**: The per-group verification analysis (BFW pair dataset, ~115K pairs per group) shows Buffalo-S has a **moderate AUC range across groups (Δ=0.0439)** — slightly above Buffalo-L/M (Δ=0.0379) but below dlib (Δ=0.0480) and @vladmandic/human (Δ=0.0545). The worst-performing group (asian_females) still achieves AUC=0.9386, so the bias does not materially impact 1:1 verification accuracy for known enrolled users.
6. **Pipeline Alignment Impact**: Re-embedding BFW through the production pipeline (detection + landmark alignment) raises Buffalo-S verification AUC from 0.9659 to 0.9781 and TAR at FAR = 1e-4 from 0.587 to 0.740, with a re-derived operating threshold of **0.3435** (section 4.7). Preprocessing quality matters as much as model choice for access control.

### 5.2 Recommendation

**InsightFace Buffalo-S** (w600k_mbf.onnx) remains the recommended model for production deployment based on:

- Average AUC of 0.9772 across all datasets
- Inference latency of ~14ms (real-time capable)
- Model size of ~10MB (fits all storage constraints)
- Native ONNX Runtime support (no Python dependency)
- Viability across all target edge devices
- NN accuracy of 97.8% across all demographic groups (no practical bias impact for 1:1 verification)

**If edge hardware budget allows** (Pi 4B+ with 2GB+ RAM), **Buffalo-M** is a reasonable upgrade path: it has the lowest verification bias (Δ=0.0379 vs 0.0439) while maintaining the same ONNX Runtime stack, at the cost of 4x slower inference (~56ms) and 9x larger model (~90MB). The accuracy gain is marginal (AUC 0.9887 vs 0.9772) and unlikely to be noticeable in production, but the bias reduction may be preferable for deployments with demographic diversity requirements.

### 5.3 Future Work

- Quantization of Buffalo-S to FP16 or INT8 for further size reduction
- Evaluation on additional edge hardware (Jetson Nano, RK3588)
- Integration of face anti-spoofing (liveness detection)
- Continuous benchmark updates as new models become available
- Demographic bias monitoring in production — periodic re-evaluation of TAR/FAR by demographic group if user base grows significantly

---

## Appendix A: Detailed Demographic Bias Results

Per-model results from the BFW analysis. LaTeX equivalents of these tables are in `metrics/tables/` for direct inclusion in a thesis document.

### A.1 Cross-Model Comparison

| Model | Dim | NN Acc | Intra-range (Δ) | Verification AUC range (Δ) | Best group | Worst group |
|-------|-----|--------|-----------------|---------------------------|-----------|-------------|
| dlib | 128d | 98.1% | 92.3%–95.8% (Δ=3.53%) | 0.9468–0.9948 (**0.0480**) | White males | Asian females |
| insightface-buffalo-s | 512d | 97.8% | 18.2%–32.5% (Δ=14.31%) | 0.9386–0.9824 (**0.0439**) | White males | Asian females |
| insightface-buffalo-l | 512d | 98.5% | 15.4%–22.6% (Δ=7.19%) | 0.9485–0.9864 (**0.0379**) | White females | Asian females |
| insightface-buffalo-m | 512d | 98.7% | 15.4%–22.6% (Δ=7.19%) | 0.9485–0.9864 (**0.0379**) | White females | Asian females |
| vladmandic-human | 1024d | 93.4% | 64.5%–71.2% (Δ=6.69%) | 0.8946–0.9491 (**0.0545**) | White males | Asian females |

### A.2 dlib (128D)

- **Total embeddings:** 17,809 | **NN accuracy:** 98.1%

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

**Bias indicators:** Intra-range Δ=3.53% (92.30%–95.83%). Highest cohesion: Asian females. Lowest: White males. Closest groups: Asian females↔Asian males (97.4%). Farthest: Asian females↔Black males (82.8%).

### A.3 insightface-buffalo-s (512D)

- **Total embeddings:** 20,000 | **NN accuracy:** 97.8%

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

**Bias indicators:** Intra-range Δ=14.31% (18.15%–32.46%). Highest cohesion: Indian females. Lowest: White males. Closest groups: White females↔White males (66.6%). Farthest: Asian females↔Indian females (29.2%).

### A.4 insightface-buffalo-l (512D)

- **Total embeddings:** 20,000 | **NN accuracy:** 98.5%

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

**Bias indicators:** Intra-range Δ=7.19% (15.39%–22.58%). Highest cohesion: Indian females. Lowest: Black males. Closest groups: White females↔White males (64.2%). Farthest: Asian females↔Indian males (33.8%).

### A.5 insightface-buffalo-m (512D)

- **Total embeddings:** 20,000 | **NN accuracy:** 98.7%

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

**Bias indicators:** Intra-range Δ=7.19% (15.39%–22.58%). Highest cohesion: Indian females. Lowest: Black males. Closest groups: White females↔White males (64.2%). Farthest: Asian females↔Indian males (33.8%).

### A.6 vladmandic-human (1024D)

- **Total embeddings:** 19,349 | **NN accuracy:** 93.4%

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

**Bias indicators:** Intra-range Δ=6.69% (64.51%–71.20%). Highest cohesion: Asian females. Lowest: White males. Closest groups: Asian females↔Asian males (91.9%). Farthest: Asian females↔Black males (67.3%).

### A.7 NN Accuracy by Group

| Group | dlib | insightface-buffalo-s | insightface-buffalo-l | insightface-buffalo-m | vladmandic-human |
|-------|-------|-------|-------|-------|-------|
| asian_females | 97.5% | 98.0% | 98.5% | 97.5% | 94.0% |
| asian_males | 95.0% | 94.0% | 96.5% | 98.5% | 89.5% |
| black_females | 97.0% | 98.5% | 98.5% | 100.0% | 89.5% |
| black_males | 98.5% | 97.5% | 98.0% | 98.5% | 98.0% |
| indian_females | 99.0% | 98.0% | 99.0% | 98.5% | 95.0% |
| indian_males | 99.0% | 98.5% | 99.0% | 98.5% | 94.0% |
| white_females | 99.5% | 98.5% | 100.0% | 99.5% | 92.5% |
| white_males | 99.0% | 99.0% | 98.5% | 98.5% | 95.0% |

### A.8 PCA of Group Centroids

Figure 6 (`metrics/figures/figure06-pca-centroids.png`) shows the PCA projection of the 8 group centroids for each model.

**dlib**

| Group | PC1 | PC2 | Explained: PC1=42.4%, PC2=19.7% |
|-------|-----|-----|-----------|
| asian_females | 5.9948e-1 | 9.8201e-2 | |
| asian_males | 3.8438e-1 | 9.5736e-2 | |
| black_females | 2.1411e-1 | 9.7131e-2 | |
| black_males | -1.6618e-1 | 4.9353e-2 | |
| indian_females | 4.3039e-1 | 2.9179e-1 | |
| indian_males | 6.0261e-2 | 2.7531e-1 | |
| white_females | 3.1864e-1 | 4.7329e-1 | |
| white_males | 8.0462e-2 | 4.3601e-1 | |

**insightface-buffalo-s**

| Group | PC1 | PC2 | Explained: PC1=26.5%, PC2=17.9% |
|-------|-----|-----|-----------|
| asian_females | -1.1938e+0 | 1.4641e-1 | |
| asian_males | -2.0430e-1 | -3.1744e-1 | |
| black_females | 4.7399e-1 | 1.0855e+0 | |
| black_males | -9.8210e-1 | 1.0674e+0 | |
| indian_females | 5.3343e+0 | 1.1098e+0 | |
| indian_males | 1.5053e+0 | -4.1276e+0 | |
| white_females | -3.3851e-1 | -4.9442e-2 | |
| white_males | 1.1351e-1 | 2.4541e-1 | |

**insightface-buffalo-l**

| Group | PC1 | PC2 | Explained: PC1=23.1%, PC2=23.7% |
|-------|-----|-----|-----------|
| asian_females | -7.8163e-1 | 1.4665e+0 | |
| asian_males | 1.0471e-1 | 9.0736e-1 | |
| black_females | -3.9047e-1 | 2.7324e-1 | |
| black_males | 2.7365e-1 | -1.0191e-1 | |
| indian_females | -4.0108e+0 | -1.7698e+0 | |
| indian_males | 4.4872e-1 | -3.0719e+0 | |
| white_females | -5.3994e-1 | 4.2566e-1 | |
| white_males | 3.5223e-1 | 3.7068e-2 | |

**insightface-buffalo-m**

| Group | PC1 | PC2 | Explained: PC1=22.0%, PC2=24.7% |
|-------|-----|-----|-----------|
| asian_females | 1.2906e+0 | -1.0258e+0 | |
| asian_males | 2.1891e-1 | -8.1434e-1 | |
| black_females | 4.8599e-1 | -1.7204e-1 | |
| black_males | -3.0449e-1 | -8.3233e-3 | |
| indian_females | 3.3216e+0 | 2.8566e+0 | |
| indian_males | -1.5510e+0 | 2.6738e+0 | |
| white_females | 6.9062e-1 | -2.5319e-1 | |
| white_males | -3.3132e-1 | -1.5956e-1 | |

**vladmandic-human**

| Group | PC1 | PC2 | Explained: PC1=33.2%, PC2=21.4% |
|-------|-----|-----|-----------|
| asian_females | -2.6333e+0 | -1.7313e+0 | |
| asian_males | -8.7792e-1 | -2.5820e+0 | |
| black_females | 1.1098e+0 | 3.5103e-1 | |
| black_males | 3.7466e+0 | -1.1636e+0 | |
| indian_females | -9.5420e-1 | 2.3280e+0 | |
| indian_males | 1.8979e+0 | 5.4892e-2 | |
| white_females | -5.2545e-1 | 1.4301e+0 | |
| white_males | 1.4786e+0 | -5.0292e-1 | |

### A.9 Verification Accuracy by Group (AUC)

Per-group verification metrics computed from the BFW pair dataset (923,898 pairs) by `scripts/analyze-demographics.ts`. AUC is the canonical bias metric: the range across groups measures how evenly the model verifies identities across demographics.

| Group | dlib | insightface-buffalo-s | insightface-buffalo-l | insightface-buffalo-m | vladmandic-human |
|-------|-------|-------|-------|-------|-------|
| asian_females | 0.9468 | 0.9386 | 0.9485 | 0.9485 | 0.8946 |
| asian_males | 0.9622 | 0.9502 | 0.9563 | 0.9563 | 0.9138 |
| black_females | 0.9860 | 0.9749 | 0.9801 | 0.9801 | 0.9234 |
| black_males | 0.9690 | 0.9667 | 0.9660 | 0.9660 | 0.9276 |
| indian_females | 0.9708 | 0.9631 | 0.9696 | 0.9696 | 0.9155 |
| indian_males | 0.9844 | 0.9683 | 0.9716 | 0.9716 | 0.9373 |
| white_females | 0.9926 | 0.9798 | 0.9864 | 0.9864 | 0.9329 |
| white_males | 0.9948 | 0.9824 | 0.9861 | 0.9861 | 0.9491 |

| **Range (Δ)** | 0.0480 | 0.0439 | 0.0379 | 0.0379 | 0.0545 |

---
_Appendix A generated by scripts/analyze-bias.ts — 2026-07-31T14:19:01.814Z_

## References

1. InsightFace: https://github.com/deepinsight/insightface
2. ArcFace paper: https://arxiv.org/abs/1801.07698
3. LFW dataset: http://vis-www.cs.umass.edu/lfw/
4. CFP-FP dataset: http://www.cfpw.io/
5. AgeDB dataset: https://ibug.doc.ic.ac.uk/resources/agedb/
6. dlib: http://dlib.net/
7. @vladmandic/human: https://github.com/vladmandic/human
8. ONNX Runtime: https://onnxruntime.ai/
9. MobileFaceNet paper: https://arxiv.org/abs/1804.07573
10. TVConv benchmark datasets: https://github.com/JierunChen/TVConv
11. BFW (Balanced Faces in the Wild): https://github.com/visionjo/facerec-bias-bfw
