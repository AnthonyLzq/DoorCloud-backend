# Design: Migrate face recognition from @vladmandic/human to InsightFace Buffalo-S

## Overview

Replace `@vladmandic/human` (L2 similarity, threshold > 0.5) with an ONNX-only
Buffalo-S pipeline (`det_500m.onnx` detection + `w600k_mbf.onnx` recognition)
in the MQTT photo flow. Implements `FaceRecognitionService.verify()` and rewires
`UserServices.sendPhotoThroughWhatsapp` to use it, keeping the `{match, name}`
contract and `metrics/matchPhoto.csv` format. Python and lib/human remain
available for benchmark scripts but are removed from the production startup path.

Satisfies RF-1..RF-6 (specs/face-verification/spec.md). All design numbers below
were derived from real data in this repo (`metrics/embeddings/`,
`datasets/tmp/BFW-Release/`, `datasets/lfw/`) and validated.

## Goals / Non-Goals

**Goals**
- Full-ONNX verify in production: detect → align → embed → cosine → threshold.
- ROC-derived, env-configurable threshold (RF-4).
- ONNX-only lifecycle from `Server.start` (RF-5), `user.ts` via `verify()` (RF-6).

**Non-Goals**
- Removing `PythonManager` or `lib/human` (benchmark baseline, out of scope).
- Group-specific thresholds (single global threshold adequate, per proposal).
- Optimizing the detector beyond correctness (14ms is already sufficient).

## Architecture

```
MQTT photo topic ──> photo.ts ──> UserServices.sendPhotoThroughWhatsapp
                                      │  verify(buffer, storedPhotos)
                                      ▼
                              FaceRecognitionService.verify()
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                     ▼
           ONNXProvider.detectFaces()         ONNXProvider.getAlignedEmbedding()
           det_500m 640x640, letterbox        w600k_mbf 112x112, ArcFace warp
           SCRFD decode + NMS                 cosine vs probe, threshold
                    │                                     │
                    └───────── shared ort sessions ───────┘
                                      │
                                      ▼
                          {match, name, similarity?, reason?}
                                      │
                        matchPhoto.csv + WhatsApp result
```

## Components

| File | Responsibility |
|------|----------------|
| `src/services/face-recognition/onnx-provider.ts` | + `detectFaces()`, `getAlignedEmbedding()`, warp helper; keeps `getEmbedding`/`preprocess` for benchmark scripts |
| `src/services/face-recognition/index.ts` | + `verify()`, ONNX-only `init({ mode })`, threshold application |
| `src/services/user.ts` | `compareFaces` → `FRS.verify()`; keep CSV + `{match,name}` |
| `src/network/server.ts` | human `init` → `FRS.init({ mode: 'onnx' })` |
| `src/config/env.ts` | + `FACE_VERIFY_THRESHOLD` (Zod) |
| `src/services/face-recognition/face-detection.ts` | (new) pure functions: decode + NMS + similarity-warp math |
| `test/` | new verify/face-detection/threshold unit tests |

## Architecture Decisions

| Decision | Options | Tradeoff | Decision |
|----------|---------|----------|----------|
| D1 Threshold default | (a) LFW-derived, (b) BFW-derived, (c) arbitrary | LFW = easy (3000 negs, coarse at FAR 1e-4); BFW = 681K negatives, real aligned-crop embeddings, matches production shape | **0.37** = BFW FAR=1e-4 threshold (0.3719) |
| D2 Detection location | (a) Node SCRFD, (b) Python, (c) lib/human | Node = +alignment math risk, no IPC latency; Python = reuses benchmark but keeps dead process; human = unchanged but heavy dep | **(a) Node SCRFD** |
| D3 verify input shape | (a) verify fetches URLs, (b) user.ts fetches → buffers | (a) mirrors compareFaces, single fetch impl; (b) more testable, service stays pure | **(a) verify accepts URLs**, fetches internally |
| D4 Multi-face | (a) first, (b) max-score, (c) reject | max-score = most confident, deterministic | **(b) max-score face** |
| D5 Concurrency | (a) Promise.all, (b) sequential early-exit | CPU-bound ort serializes anyway; sequential exits on first match | **(b) sequential + early-exit**, cap = 10 stored photos (env override) |
| D6 Alignment math | (a) manual warpAffine JS, (b) sharp.affine | sharp.affine output size is bbox-driven (verified 400x200 for scale-2) — not fixed 112x112; manual warp = exact cv2.warpAffine equiv, 12K px | **(a) manual bilinear warp**, border=0 |

### Threshold derivation (real data)

| Source | Dataset | Pairs | AUC | EER |
|--------|---------|-------|-----|-----|
| `metrics/embeddings/insightface-buffalo-s.json` + BFW table | BFW | 923,898 | 0.9659 | 0.0859 |
| Re-run `w600k_mbf` on LFW pairs | LFW | 6,000 | 0.9421 (matches docs) | 0.1277 |

BFW threshold at target FAR (buffalo-s, 681K negative pairs):

| FAR target | Similarity threshold | TAR |
|------------|---------------------|-----|
| 1e-2       | 0.238               | 0.828 |
| 1e-3       | 0.313               | 0.715 |
| **1e-4**   | **0.372**           | 0.587 |
| 1e-5       | 0.422               | 0.460 |

Door access control → **target FAR = 1e-4, default `FACE_VERIFY_THRESHOLD = 0.37`**
(rounded from 0.3719). Impostor stats: p99=0.238, p99.9=0.313, max=0.66.

> **Note on proposal's "TAR@FAR=0.001=0.992"**: that figure is the docs'
> *illustrative* example in the metrics definition (benchmark-analysis.md:118),
> not a buffalo-s measurement. Real LFW TAR@FAR=1e-3 on the current
> (unaligned) pipeline is 0.41. The new alignment pipeline raises genuine
> scores; threshold MUST be re-derived on the aligned pipeline before the
> production flip (see Rollout).

## Data Flow

```
verify(buffer, [{name, url}...], threshold):
  probe = detect(buffer)                        # det_500m, 640x640
  if !probe: log 'no face detected' → {match:false, reason:'no-face'}
  probeEmb = alignAndEmbed(buffer, probe.landmarks)   # warp + w600k_mbf
  for each stored photo (sequential, cap=10):
    det = detect(fetch(url))
    if !det: log 'no face in stored photo' → continue
    emb = alignAndEmbed(urlBuffer, det.landmarks)
    sim = cosine(probeEmb, emb)
    if sim >= threshold: return {match:true, name, similarity:sim}
  return {match:false, similarity:bestSim, reason:'no-match'}
```

### Detector (`det_500m.onnx`) — validated

- Input `input.1`: `[1,3,640,640]` float32, **RGB**, normalized `(v-127.5)/128`.
- Preprocess: letterbox resize (aspect-preserve + zero-pad to 640), NOT fit:fill.
- Outputs (9): per stride {8,16,32} → scores `[N,1]`, bboxes `[N,4]`, kpss `[N,10]`,
  `N = (640/stride)^2 × 2` (num_anchors=2): 12800 / 3200 / 800. Names: 443/446/449
  (s8), 468/471/474 (s16), 493/496/499 (s32).
- Decode (`scrfd.py` distance2bbox/distance2kps): `pred *= stride`; anchor centers
  `(mgrid[:h,:w][::-1]*stride)` duplicated ×2; `x1=cx-d0, y1=cy-d1, x2=cx+d2, y2=cy+d3`;
  kps per landmark `(cx+d[2i], cy+d[2i+1])`. Scale back by `det_scale` to original
  image coords. `det_thresh=0.5`, `nms_thresh=0.4`, NMS with `+1` in area terms.

### Alignment (ArcFace 112) — validated

- `arcface_dst = [[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]]`.
- Estimate similarity transform (Umeyama, 4-DOF) from detected 5 landmarks → dst;
  `M` 2x3. Warp: for each output pixel `(x,y)` in 112x112, sample input at
  `M⁻¹·(x,y,1)` bilinear, out-of-bounds → 0 (matches `borderValue=0`).
- Recognizer normalization: reuse existing `preprocess` `(v/127.5 - 1.0)`, RGB→CHW
  (verified against docs AUC).

## Interfaces / Contracts

```ts
// onnx-provider.ts (new)
interface FaceDetection { bbox: [number, number, number, number]; score: number; landmarks: [number, number][] } // 5 pts, original coords
detectFaces(image: Buffer, opts?: { detThresh?: number; nmsThresh?: number }): Promise<FaceDetection[]>
getAlignedEmbedding(image: Buffer, landmarks: [number, number][], modelName: string): Promise<Float32Array>

// index.ts (new)
interface VerifyStoredPhoto { name: string; url: string }
interface VerifyResult { match: boolean; name?: string; similarity?: number; reason?: 'no-face' | 'no-match' | 'match' }
verify(image: Buffer, storedPhotos: VerifyStoredPhoto[], opts?: { threshold?: number }): Promise<VerifyResult>
init(opts?: { mode?: 'onnx' | 'hybrid' }): Promise<void>   // onnx: no python spawn, loads det+rec
shutdown(): Promise<void>                                  // release sessions; no-op if onnx mode python absent

// user.ts — keeps contract
const frs = ... // injected or module singleton
const result = await frs.verify(bufferPhoto, urlPhotosFromUser.map((url, i) => ({ name: photosFromUser[i].split('/')[1].split('-')[0], url })))
appendFileSync(..., `\n${result.match ? 1 : 0},${diffTimeInSeconds(timeBefore, timeAfter)}`)
sendPhotoDetectionResultThroughWhatsapp({ success: result.match, name: result.name, ... })  // unchanged shape
```

## Config (RF-4)

```ts
const optionalFloat = (name: string, default: number, min: number, max: number) => /* Zod preprocess pattern, mirrors optionalInteger */
FACE_VERIFY_THRESHOLD: optionalFloat('FACE_VERIFY_THRESHOLD', 0.37, 0, 1)
// optional later: FACE_VERIFY_MAX_PHOTOS (default 10) if cap needs tuning
```

`FACE_VERIFY_THRESHOLD=banana` → Zod startup error (RF-4 scenario).
`=0.55` → threshold 0.55. Unset → 0.37.

## Lifecycle (RF-5)

- `Server.start()`: replace `await init(this.#app.log)` (human) with
  `const frs = new FaceRecognitionService(); await frs.init({ mode: 'onnx' })` —
  loads `det_500m` + `w600k_mbf` once via `ONNXProvider.loadModel`, no Python.
- `Server.stop()`: call `frs.shutdown()` (session release, python no-op).
- `FRS.init()` with mode `'onnx'`: skip `pythonManager.start()`; guard Python
  calls in `getEmbedding`/`listModels` when python is not started (benchmark
  scripts keep passing `mode:'hybrid'`).
- `lib/human` untouched; `MODELS_CDN_URL` stays for scripts.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `verify()` no-face → `{match:false, reason:'no-face'}` no throw (RF-2) | mock `ONNXProvider.detectFaces` → `[]` |
| Unit | `verify()` match / below-threshold no-match (RF-1) | mock detect + embeddings; assert `{match,name,similarity}` / `{match:false}` |
| Unit | threshold decision | spy on cosine output vs threshold; `FACE_VERIFY_THRESHOLD` Zod parse (valid/invalid/default, RF-4) |
| Unit | `face-detection.ts` decode + NMS | synthetic scores/bbox/kps tensors; assert decoded coords + IoU suppression (incl. num_anchors=2 layout) |
| Unit | warp math | 5 landmark pairs → M; assert transformed landmarks ≈ `arcface_dst` (±0.5px) |
| Integration | detect+align+embed on real LFW image | `detectFaces(aaron_eckhart_0001)` → 1 face, landmarks; re-embed warped crop |
| Regression | existing suite | `pnpm test:local`, `pnpm typecheck`, `pnpm lint` |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file
classification, or process-integration boundary in this design. (Python
spawn is removed from the production path, not added.)

## Migration / Rollout

No data migration. Phased:
1. Land `face-detection.ts` + provider methods + tests (green, feature off).
2. Add `verify()` + env + lifecycle (still off — human still wired).
3. Flip `user.ts` to `verify()` behind env flag
   `FACE_VERIFY_MODE=onnx|human` (default `human`).
4. **Re-derive threshold** on the aligned pipeline via
   `scripts/derive-verify-threshold.ts` (re-run BFW pairs through
   detect+align+embed) — update `FACE_VERIFY_THRESHOLD` default if drift.
5. Manual integration test on MQTT photo flow; flip default to `onnx`.
6. **Rollback**: set `FACE_VERIFY_MODE=human`; lib/human untouched → small git revert.

## Open Questions

- [ ] Keep a `FACE_VERIFY_MODE` env flag permanently or remove after validation?
- [ ] Should `verify()` cap (10 photos) be env-exposed now or hardcoded?
