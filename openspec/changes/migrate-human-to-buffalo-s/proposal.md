# Proposal: Migrate face recognition from @vladmandic/human to InsightFace Buffalo-S

## Intent

Replace `@vladmandic/human` (L2 similarity, threshold > 0.5) with InsightFace **Buffalo-S** (`w600k_mbf.onnx` + `det_500m.onnx`) in the MQTT photo flow. Benchmark recommends Buffalo-S: AUC 0.9421, TAR@FAR=0.001 = 0.992, 14ms, ~10MB — beats human (97.53%) and degrades less cross-age. Removes a heavy runtime dep and the dead-weight Python process from production while keeping the `{match, name}` contract the WhatsApp flow depends on.

## Scope

### In Scope
- Node detection with `det_500m.onnx` (NMS + ArcFace 112x112 alignment) in `ONNXProvider`
- New `FaceRecognitionService.verify()`: detect -> align -> embed -> cosine -> threshold
- Wire `user.ts` to `verify()`; keep `metrics/matchPhoto.csv` format
- ONNX-only `init()` in `Server.start`; drop human init; load both models once
- Configurable threshold via env (Zod); FRS verify unit tests

### Out of Scope
- Removing PythonManager (needed by benchmark scripts)
- Removing lib/human (kept as benchmark baseline)
- Group-specific thresholds (benchmark: single global threshold is adequate)

## Capabilities

### New Capabilities
- `face-verification`: detect + verify a photo against stored photos, returning `{match, name, similarity?}`

### Modified Capabilities
- None (no existing spec covers photo processing)

## Approach

Full-ONNX pipeline, no human/Python in production:

```
MQTT route -> UserServices -> FRS.verify(buffer, url)
  -> det_500m detect (NMS + warp)
  -> w600k_mbf embedding -> cosine -> threshold -> {match, name}
```

### Key Decisions
1. **Threshold**: env `FACE_VERIFY_THRESHOLD` (Zod); initial value from benchmark ROC at target FAR. Exact number computed from `metrics/roc-points.csv` in design, validated empirically before flip.
2. **Detection**: `det_500m.onnx` in Node (SCRFD + NMS + warp). Tradeoff: alignment math is the risky part (goes to design); avoids Python IPC latency and a second stack.
3. **Location**: new `FRS.verify()`, not a lib/human shim — reuses ONNXProvider sessions, keeps embeddings benchmark-consistent, testable. More invasive but kills dual-stack confusion.
4. **No-face**: preserve silent `{match:false}` (WhatsApp contract unchanged); distinct log vs low-similarity. Optional `reason` field to design.
5. **Lifecycle**: `Server.start` calls ONNX-only FRS init; PythonManager stays lazy for scripts; human init removed.
6. **Concurrency**: keep `Promise.all` (per-user N small); design may add early-exit + cap.
7. **MODELS_CDN_URL / lib/human**: production loads local `models/`; lib/human + CDN URL retained for benchmark scripts only.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/services/user.ts` | Modified | `compareFaces` -> `FRS.verify()`; matchPhoto.csv kept |
| `src/services/face-recognition/onnx-provider.ts` | Modified | detection + alignment preprocess |
| `src/services/face-recognition/index.ts` | Modified | ONNX-only init, `verify()` |
| `src/network/server.ts` | Modified | human init -> FRS init |
| `src/config/env.ts` | Modified | threshold env |
| `test/` | New | FRS verify unit tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Detector/alignment correctness | Med | Validate embeddings vs benchmark outputs |
| Wrong threshold -> false pos/neg | Med | Configurable + ROC-derived + empirical validation |
| MQTT photo flow regression | Low | FRS unit tests + manual integration |

## Rollback Plan

Revert `user.ts`/`server.ts` to `compareFaces`/human init — lib/human is untouched, so rollback is a small git revert.

## Dependencies

- `w600k_mbf.onnx` + `det_500m.onnx` in `models/insightface/` (present, pass `validateModels()`)
- Benchmark ROC data (`metrics/roc-points.csv`) for threshold calibration

## Success Criteria

- [ ] Production verifies with Buffalo-S; no human/Python in the path
- [ ] No-face returns `{match:false}` without throwing
- [ ] `matchPhoto.csv` format unchanged
- [ ] Threshold configurable via env, default from benchmark ROC
- [ ] `pnpm test:local`, `pnpm typecheck`, `pnpm lint` pass
