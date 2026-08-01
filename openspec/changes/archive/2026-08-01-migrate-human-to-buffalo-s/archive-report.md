# Archive Report: migrate-human-to-buffalo-s

| Field | Value |
|-------|-------|
| Change | migrate-human-to-buffalo-s |
| Archived to | `openspec/changes/archive/2026-08-01-migrate-human-to-buffalo-s/` |
| Archived on | 2026-08-01 |
| Verdict | PASS |
| Tasks | 32/32 complete |
| Spec | face-verification (6 requirements, 12 scenarios) |
| Quality gates at close | 192/192 tests, typecheck clean, lint clean |

## Final-State Authority Note

The `verify-report.md` in this archive is an intermediate snapshot written BEFORE six
post-verify fixes landed (verification run `verify-run-20260801`). It records 187/187
tests and a SUGGESTION about `FACE_VERIFY_MAX_PHOTOS` being unwired. Those numbers and
that finding are STALE at close. This archive report is the terminal record and reflects
the final state: 192/192 tests, typecheck clean, lint clean, and all six review findings
resolved. Do not treat the verify-report snapshot's counts or "vars unwired" claims as
current.

## What Was Accomplished

Migrated the MQTT photo verification flow from `@vladmandic/human` (L2 similarity) to an
ONNX-only InsightFace Buffalo-S pipeline (`det_500m.onnx` detection + `w600k_mbf.onnx`
recognition). Production now detects, aligns, and embeds entirely in Node with no Python
process and no human runtime; lib/human and PythonManager remain for benchmark scripts.

### Phase 1 — SCRFD detection math (pure functions)
`src/services/face-recognition/face-detection.ts` with `decodeOutputs()`,
`nonMaximumSuppression()`, `estimateSimilarityTransform()` (Umeyama 4-DOF), and bilinear
`warpAffine()` — all cv2-equivalent, TDD-tested against synthetic tensors.

### Phase 2 — Provider detection + alignment
`ONNXProvider.detectFaces()` (letterbox to 640x640, `det_500m` inference, decode + NMS,
scale-back) and `ONNXProvider.getAlignedEmbedding()` (ArcFace 112x112 warp + existing
`preprocess`). Integration test on a real LFW image confirms 1 face, 5 landmarks, 512-dim
embedding.

### Phase 3 — FaceRecognitionService.verify()
`verify(image, storedPhotos, {threshold})`: probe detect (no face -> `no-face`), max-score
face, sequential cosine comparison with early-exit. `init({mode})` + `shutdown()`; ONNX mode
loads `det_500m` + `w600k_mbf` once and never spawns Python; benchmark scripts keep
`mode: 'hybrid'`.

### Phase 4 — Config env
`FACE_VERIFY_THRESHOLD` (Zod float [0,1], default 0.3435) and `FACE_VERIFY_MAX_PHOTOS`
(default 10) in `src/config/env.ts`. Invalid values throw at startup.

### Phase 5 — Server lifecycle
`Server.start()` initializes FaceRecognitionService in ONNX-only mode; `Server.stop()`
calls `shutdown()`. lib/human import untouched.

### Phase 6 — user.ts wiring
`sendPhotoThroughWhatsapp` routes through `frs.verify()`, keeping the `metrics/matchPhoto.csv`
`\n{1|0},{seconds}` format and the WhatsApp `{success, name}` contract.

### Phase 7 — Rollout + threshold re-derivation
`scripts/derive-verify-threshold.ts` re-ran BFW pairs through the production detect+align+embed
pipeline; threshold re-derived to 0.3435 @ FAR 1e-4 (design's 0.37 was a pre-alignment estimate).
README + CHANGELOG document the rollout.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Node SCRFD detection (D2)** | Full-ONNX path avoids Python IPC latency and a second stack; alignment math verified against the real model. |
| **verify() accepts URLs (D3)** | Mirrors `compareFaces`, single fetch implementation inside the service. |
| **Max-score face (D4)** | Most confident, deterministic selection for multi-face photos. |
| **Sequential early-exit, cap 10 (D5)** | CPU-bound ort serializes anyway; exits on first match. |
| **Manual bilinear warp 112x112 (D6)** | `sharp.affine` output size is bbox-driven, not fixed 112x112; manual warp is exact `cv2.warpAffine` equivalent. |
| **Threshold re-derived to 0.3435 (D1)** | Production pipeline (detect+align+embed) measurement, not the pre-alignment 0.37 estimate. |
| **ONNX-only runtime, no FACE_VERIFY_MODE flag** | Flag would add dead complexity; rollback = git revert. `FACE_VERIFY_MODE` removed from env schema and `.env.example`. |

## Post-Verify Fixes (native review `review-97aa5f7753f23a97`)

The native review surfaced 6 findings after the verification PASS; all were resolved. The
fresh review `review-056d99eba9422da5` (post-fixes) was approved on the verify-report.md
candidate and the post-apply gate is allow.

| # | Commit | Change |
|---|--------|--------|
| 1 | `70d8cd7` | `fix: wire FACE_VERIFY_MAX_PHOTOS and remove dead FACE_VERIFY_MODE` — verify() now accepts `opts.maxPhotos`, user.ts passes the env value; `FACE_VERIFY_MODE` removed from env schema and `.env.example` (ONNX-only decision; rollback = git revert) |
| 2 | `347132e` | `fix: filter no-match photos out of verify comparison set` — user.ts excludes files whose name starts with a digit (Date.now()-uuid no-match photos) so MAX_STORED_PHOTOS only applies to real reference photos |
| 3 | `82964c8` | `fix: handle inference failures gracefully in verify` — probe and stored-photo detect/embed wrapped in try/catch; probe failure returns no-face, stored-photo failure continues |
| 4 | `26d25de` | `perf: download stored photos in parallel with fetch timeout` — Promise.allSettled + AbortController, `VERIFY_FETCH_TIMEOUT_MS=10s` (config/constants.ts); inference still sequential with early-exit |
| 5 | `73cd829` | `refactor: share cosine similarity between runtime and benchmark scripts` — new `src/services/face-recognition/cosine-similarity.ts` used by the service and `scripts/derive-verify-threshold.ts` + `scripts/export-pipeline-similarities.ts` |
| 6 | `1fed20a` | `feat: guard verify against non-onnx initialization` — verify() throws an actionable error when not initialized in onnx mode |

## Files Modified / Created

### Created
- `src/services/face-recognition/face-detection.ts` — SCRFD decode + NMS + Umeyama + warp math
- `src/services/face-recognition/cosine-similarity.ts` — shared cosine similarity (post-verify refactor)
- `scripts/derive-verify-threshold.ts` — threshold re-derivation on the production pipeline
- `test/face-detection.test.ts`, `test/onnx-provider.test.ts`, `test/onnx-provider.integration.test.ts`, `test/face-recognition-service.test.ts` additions
- `openspec/specs/face-verification/spec.md` — new capability spec (synced from delta)

### Modified
- `src/services/face-recognition/onnx-provider.ts` — `detectFaces()`, `getAlignedEmbedding()`
- `src/services/face-recognition/index.ts` — `verify()`, ONNX-only `init({mode})`, `shutdown()`, fatal handlers
- `src/services/user.ts` — `compareFaces` -> `frs.verify()`; no-match photo filtering
- `src/network/server.ts` — ONNX-only FRS init in `start()`, `shutdown()` in `stop()`
- `src/config/env.ts` — `FACE_VERIFY_THRESHOLD`, `FACE_VERIFY_MAX_PHOTOS`; removed `FACE_VERIFY_MODE`
- `src/config/constants.ts` — `VERIFY_FETCH_TIMEOUT_MS=10s` and verify defaults
- `.env.example` — verify env vars (no dead `FACE_VERIFY_MODE`)
- `README.md`, `CHANGELOG.md` — Buffalo-S rollout documentation

## Commits (post-verify fixes in final commit range)

| SHA | Message |
|-----|---------|
| `70d8cd7` | `fix: wire FACE_VERIFY_MAX_PHOTOS and remove dead FACE_VERIFY_MODE` |
| `347132e` | `fix: filter no-match photos out of verify comparison set` |
| `82964c8` | `fix: handle inference failures gracefully in verify` |
| `26d25de` | `perf: download stored photos in parallel with fetch timeout` |
| `73cd829` | `refactor: share cosine similarity between runtime and benchmark scripts` |
| `1fed20a` | `feat: guard verify against non-onnx initialization` |

Earlier implementation commits: `cb60097` (face-detection math + SDD plan), `d37208a`
(verify + onnx-only lifecycle), `479b1f5` (env vars), `af252c9` (server lifecycle),
`145f715` (logger mock), `e7c2802` (user.ts routing), `6471c63` (threshold re-derivation),
`5922e82` (docs), `aa6a200` (.env.example), `0c054b4` (tasks marked complete).

## Risks / Notes

- Detector/alignment edge cases (extreme poses, occlusion) covered only by 2 integration tests;
  mitigated by BFW pipeline validation and ~14ms latency.
- Threshold was derived on BFW aligned-crop embeddings; live-traffic calibration recommended
  after the production flip (proposal's own success criteria).
- Rolling back to human requires a git revert (no env flip) — documented, accepted (ONNX-only decision).
- MQTT integration flow not re-run (requires Docker); covered by unit tests + FRS tests.

## Source of Truth

`openspec/specs/face-verification/spec.md` now reflects the new capability
(6 requirements, 12 scenarios). The change folder is archived and the active changes
directory no longer contains `migrate-human-to-buffalo-s`.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
