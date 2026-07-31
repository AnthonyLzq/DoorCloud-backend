# Tasks: Migrate face recognition from human to Buffalo-S

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 750–950 (new face-detection.ts ~250, provider +130, index +170, user +40/−30, env +25, server ±15, tests ~330, script +90) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR to main (work-unit commits inside) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

> exception-ok: user merges directly to main. Forecast shown for transparency only; no chained PRs required.

### Suggested Work Units (commits within the single PR)

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|------|------|----------------------|-----------------|-------------------|
| 1 | Pure SCRFD math (`face-detection.ts`) | `pnpm test:local` (face-detection.test.ts) | N/A — pure functions, no runtime boundary | Delete `src/services/face-recognition/face-detection.ts` + `test/face-detection.test.ts` |
| 2 | `detectFaces()` + `getAlignedEmbedding()` | `pnpm test:local` (onnx-provider.test.ts) | `pnpm tsx scripts/test-onnx-inference.ts` with `det_500m.onnx`/`w600k_mbf.onnx` in `models/` | Revert provider methods; existing `getEmbedding`/`preprocess` untouched |
| 3 | `verify()` + ONNX-only `init`/`shutdown` | `pnpm test:local` (face-recognition-service.test.ts) | N/A — unit-tested with mocked provider | Revert `src/services/face-recognition/index.ts` |
| 4 | Env vars + server lifecycle | `pnpm test:local` (env) | `pnpm dev` → server starts without human/Python | Revert `env.ts` + `server.ts` lines |
| 5 | `user.ts` wiring + matchPhoto.csv | `pnpm test:local` | `pnpm test:mqtt` (Docker) MQTT photo flow | Revert `user.ts` to `compareFaces` (lib/human untouched) |
| 6 | Threshold re-derivation script + `.env.example` | `pnpm typecheck` + script dry-run | `pnpm tsx scripts/derive-verify-threshold.ts` on BFW embeddings | Remove script + `.env.example` lines |

## Phase 1: SCRFD detection math (pure functions)

- [x] 1.1 Write RED `test/face-detection.test.ts` for decode: synthetic stride-8 tensor (num_anchors=2 layout, N=12800) → assert `distance2bbox`/`distance2kps` decoded coords (`pred*=stride`, `x1=cx-d0..`, kps `cx+d[2i],cy+d[2i+1]`)
- [x] 1.2 Implement `decodeOutputs()` in `src/services/face-recognition/face-detection.ts` (anchor centers from `mgrid[:h,:w][::-1]*stride` ×2 anchors; strides {8,16,32})
- [x] 1.3 Write RED test for `nonMaximumSuppression()`: overlapping boxes → single survivor at `nms_thresh=0.4` (area `+1` terms); boxes below `det_thresh=0.5` filtered first
- [x] 1.4 Implement `nonMaximumSuppression()` in `face-detection.ts`
- [x] 1.5 Write RED test for `estimateSimilarityTransform()` (Umeyama 4-DOF): given 5 synthetic landmarks → M where transformed landmarks ≈ `arcface_dst` (±0.5px)
- [x] 1.6 Implement similarity-transform estimator in `face-detection.ts` (M 2x3, 4-DOF, exact cv2-equivalent)
- [x] 1.7 Write RED test for `warpAffine()`: identity warp maps input grid exactly; out-of-bounds sampling → 0 (borderValue=0); output fixed 112x112
- [x] 1.8 Implement bilinear `warpAffine()` in `face-detection.ts`

Acceptance (Phase 1): `pnpm test:local` face-detection tests green; no provider changes yet.

## Phase 2: Provider detection + alignment

- [x] 2.1 Write RED test `detectFaces()` in `test/onnx-provider.test.ts`: mock session → 9 outputs named 443/446/449, 468/471/474, 493/496/499 (scores/bboxes/kpss per stride); input `[1,3,640,640]` RGB letterbox normalized `(v-127.5)/128`
- [x] 2.2 Implement `detectFaces(image, opts?)` in `onnx-provider.ts`: letterbox (aspect-preserve, zero-pad, NOT fit:fill) → `det_500m` inference → `decodeOutputs` + `nonMaximumSuppression` → scale back by `det_scale` to original coords → `FaceDetection[]` (`{bbox,score,landmarks}`)
- [x] 2.3 Write RED test `getAlignedEmbedding()`: warp via `warpAffine` to 112x112 then existing `preprocess` `(v/127.5-1.0)`; assert `[1,3,112,112]` output feed
- [x] 2.4 Implement `getAlignedEmbedding(image, landmarks, modelName)` in `onnx-provider.ts` (uses `w600k_mbf` session)
- [x] 2.5 Write integration test (skip unless `models/` present): real LFW image → `detectFaces` yields 1 face + landmarks; re-embed warped crop returns 512-dim embedding

Acceptance (Phase 2): provider tests green with mocked sessions; integration test skips gracefully without models.

## Phase 3: FaceRecognitionService.verify()

- [x] 3.1 Write RED test (RF-2): `verify()` with `detectFaces → []` returns `{match:false, reason:'no-face'}` without throwing; distinct log
- [x] 3.2 Write RED test (RF-1): mock detect + embeddings, cosine ≥ threshold → `{match:true, name, similarity}`
- [x] 3.3 Write RED test (RF-1): best cosine < threshold → `{match:false, reason:'no-match'}`, no `name`, similarity = best
- [x] 3.4 Write RED test: sequential early-exit — fetch stops after first match; cap = 10 stored photos
- [x] 3.5 Implement `verify(image, storedPhotos, {threshold})` in `index.ts`: probe detect (no face → no-face), max-score face, fetch stored URL → detect → align → embed → cosine → early-exit on `sim >= threshold`; multi-face → max-score (D4)
- [x] 3.6 Write RED test: `init({mode:'onnx'})` loads det+rec once, does NOT spawn Python; `shutdown()` releases sessions and no-ops on Python
- [x] 3.7 Implement `init({mode?: 'onnx'|'hybrid'})` + `shutdown()` in `index.ts`; guard Python calls (`getEmbedding`/`listModels`) when Python not started; benchmark scripts keep `mode:'hybrid'`
- [x] 3.8 Refactor: add `verify()` reusing `calculateSimilarity`; keep `compare`/`getEmbedding` for scripts

Acceptance (Phase 3): `pnpm test:local` FRS tests green; `init('onnx')` loads `det_500m`+`w600k_mbf` once.

## Phase 4: Config env (RF-4)

- [ ] 4.1 Write RED env test: `FACE_VERIFY_THRESHOLD=0.55` → 0.55; unset → 0.37; `=banana` → Zod startup error
- [ ] 4.2 Add `optionalFloat` helper + `FACE_VERIFY_THRESHOLD` (float [0,1], default 0.37) to `src/config/env.ts`
- [ ] 4.3 Add `FACE_VERIFY_MODE` (`onnx`|`human`, default `human` for rollout) + `FACE_VERIFY_MAX_PHOTOS` (default 10) to `env.ts`

Acceptance (Phase 4): `parseEnv` scenarios green; invalid value throws `Invalid environment variables`.

## Phase 5: Server lifecycle (RF-5)

- [ ] 5.1 Replace `await init(this.#app.log)` (human) in `src/network/server.ts` `start()` with `FaceRecognitionService.init({mode:'onnx'})`; keep `lib/human` import untouched for benchmark scripts
- [ ] 5.2 Call `frs.shutdown()` in `Server.stop()` (session release; no-op on Python)

Acceptance (Phase 5): server starts with both ONNX models loaded, no Python process, human not initialized; stop releases sessions.

## Phase 6: user.ts wiring (RF-6)

- [ ] 6.1 Replace `compareFaces` + `Promise.all` in `sendPhotoThroughWhatsapp` with `frs.verify(bufferPhoto, urlPhotosFromUser.map((url,i) => ({name: photosFromUser[i].split('/')[1].split('-')[0], url})), {threshold: env.FACE_VERIFY_THRESHOLD})`
- [ ] 6.2 Keep matchPhoto.csv format `\n${match?1:0},${diffTimeInSeconds(timeBefore,timeAfter)}` and WhatsApp `{success, name}` contract; log `reason:'no-face'` distinctly

Acceptance (Phase 6): no-face → `success:false` + `0,seconds` row; match → `success:true` + name + `1,seconds` row; sequential early-exit cap applied.

## Phase 7: Rollout + threshold re-derivation

- [ ] 7.1 Create `scripts/derive-verify-threshold.ts`: re-run BFW pairs through detect+align+embed (`verify` pipeline), output ROC threshold at FAR 1e-4 (design: 0.3719 → 0.37 baseline)
- [ ] 7.2 Document rollout in README/CHANGELOG: FACE_VERIFY_MODE flag flow (step 3), threshold re-derivation (step 4), flip default to `onnx` (step 5), rollback = `FACE_VERIFY_MODE=human`
- [ ] 7.3 Add `FACE_VERIFY_THRESHOLD`, `FACE_VERIFY_MODE`, `FACE_VERIFY_MAX_PHOTOS` to `.env.example`
- [ ] 7.4 Regression: `pnpm test:local`, `pnpm typecheck`, `pnpm lint` all pass

Acceptance (Phase 7): script produces threshold table on aligned pipeline; quality gates green.
