```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:5934257c65d8e37f23294a31dfe282c0fb86131be35985d1ac8df689ec38f360
verdict: pass
blockers: 0
critical_findings: 0
requirements: 6/6
scenarios: 12/12
test_command: pnpm test:local
test_exit_code: 0
test_output_hash: sha256:0dfe53797b4e18d9ba97c8e99c9fa58f22ae5f8faa3f08d5aabb3ada6a725b7b
build_command: pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:fc2b17faca37f75fedb2063fbd4bf3f334407ba9ccc9a583ecaea89c1be672aa
```

# SDD Verify Report: migrate-human-to-buffalo-s

**Change**: migrate-human-to-buffalo-s
**Version**: N/A (delta spec, new capability face-verification)
**Mode**: Standard

## Status

**passed**

## Executive Summary

The migration from `@vladmandic/human` to InsightFace Buffalo-S is implemented, tested, and verified end-to-end. All 6 requirements (RF-1..RF-6) and all 12 spec scenarios are covered by passing tests. Quality gates are green: `pnpm test:local` 187/187 (14 files), `pnpm typecheck` clean, `pnpm lint` clean (55 files). All 32 tasks are marked [x]. The real-model integration test (det_500m + w600k_mbf on a real LFW image) passes with the actual ONNX models, confirming the SCRFD math, NMS, similarity-transform warp, and 512-dim embedding produce correct results. Three documented deviations were confirmed and are not failures. One SUGGESTION-level finding: `FACE_VERIFY_MAX_PHOTOS` env var is parsed but the runtime cap uses the `MAX_STORED_PHOTOS` constant (design D5 open question resolved in favor of hardcode; the env var is not wired into `verify()`).

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 32 |
| Tasks complete | 32 |
| Tasks incomplete | 0 |

## Build & Tests Execution

**Build**: Passed
```text
pnpm typecheck
> tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
exit code: 0
```

**Lint**: Passed
```text
pnpm lint
> biome check src/
Checked 55 files in 14ms. No fixes applied.
exit code: 0
```

**Tests**: 187 passed, 0 failed, 0 skipped (14 files)
```text
pnpm test:local
> vitest run --exclude "**/*.integration.test.ts"
Test Files  14 passed (14)
     Tests  187 passed (187)
exit code: 0
```

**Integration (real models, run manually)**: 2 passed
```text
pnpm vitest run test/onnx-provider.integration.test.ts
Test Files  1 passed (1)
     Tests  2 passed (2)
```

**Coverage**: Not configured (no threshold declared in repo).

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| RF-1 | Matching a stored photo | `test/face-recognition-service.test.ts > returns a match when cosine similarity reaches the threshold (RF-1)` | COMPLIANT |
| RF-1 | No stored photo matches | `test/face-recognition-service.test.ts > returns no-match without a name when the best cosine is below threshold (RF-1)` | COMPLIANT |
| RF-2 | Photo without a face | `test/face-recognition-service.test.ts > returns no-face without throwing when the probe has no face (RF-2)` | COMPLIANT |
| RF-3 | Single face | `test/onnx-provider.test.ts > letterboxes to [1,3,640,640]...` + `test/onnx-provider.integration.test.ts > detects a single face with five landmarks on a real LFW image` | COMPLIANT |
| RF-3 | Detection fails | `test/onnx-provider.test.ts > returns an empty list when no candidate clears detThresh` + `verify` no-face path | COMPLIANT |
| RF-4 | Threshold provided | `test/index.test.ts > parses FACE_VERIFY_THRESHOLD as float in [0,1]` (0.55) | COMPLIANT |
| RF-4 | Threshold default | `test/index.test.ts > defaults FACE_VERIFY_THRESHOLD to DEFAULT_VERIFY_THRESHOLD when unset` (0.3435) | COMPLIANT |
| RF-4 | Invalid threshold | `test/index.test.ts > rejects non-numeric FACE_VERIFY_THRESHOLD` (banana) + `rejects FACE_VERIFY_THRESHOLD outside [0,1]` | COMPLIANT |
| RF-5 | Server start | `test/server.test.ts > start() initializes ONNX face recognition instead of human` + `test/face-recognition-service.test.ts > loads det_500m and w600k_mbf once without spawning Python` | COMPLIANT |
| RF-5 | Benchmark baseline preserved | python-manager suites (`test/python-manager-*.test.ts`) + `src/lib/human/index.ts` untouched (compareFaces/init still exported) | COMPLIANT |
| RF-6 | Photo processed | `test/user.test.ts > routes photos through FaceRecognitionService.verify` + `keeps the WhatsApp and CSV contract when a photo matches` | COMPLIANT |
| RF-6 | No face in photo | `test/user.test.ts > keeps the WhatsApp and CSV contract when no face is detected` | COMPLIANT |

**Compliance summary**: 12/12 scenarios compliant

## Findings

| Severity | Requirement | Detail | Evidence |
|----------|-------------|--------|----------|
| SUGGESTION | RF-3 / D5 | `FACE_VERIFY_MAX_PHOTOS` env var (default 10) is parsed by Zod but never wired into `verify()`; runtime cap uses `MAX_STORED_PHOTOS` constant. Design D5 open question was resolved toward hardcode; either wire the env var or drop it to avoid confusion. | `src/config/env.ts:155-159`, `src/services/face-recognition/index.ts:369`, `.env.example:32` |

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| RF-1 verify() detect+align+embed+compare | Implemented | `index.ts:342-430`; probe detect → max-score face → warp → w600k_mbf → sequential cosine vs threshold |
| RF-2 no-face | Implemented | `index.ts:351-357` returns `{match:false, reason:'no-face'}` with distinct log |
| RF-3 detection+alignment | Implemented | `onnx-provider.ts:189-310`; SCRFD decode/NMS/letterbox/det_scale; verified against real model |
| RF-4 threshold env | Implemented | `env.ts:143-148` optionalFloat [0,1] default 0.3435; Zod rejects banana/1.5 |
| RF-5 lifecycle | Implemented | `server.ts:70` `init({mode:'onnx'})` fail-fast; `index.ts` shutdown releases sessions; `index.ts` fatal handlers with 5s force-exit |
| RF-6 user.ts wiring | Implemented | `user.ts:130-175` verify() replaces compareFaces; CSV `\n{1\|0},{s}`; WhatsApp `{success,name}`; no-face → success:false + 0 row |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 Threshold default | Yes (re-derived) | Design 0.37 was pre-alignment estimate; production pipeline re-derivation = 0.3435 (documented in tasks 7.1 + docs 4.7) |
| D2 Node SCRFD | Yes | `face-detection.ts` decode/NMS/warp; no Python in production path |
| D3 verify accepts URLs | Yes | `verify(buffer, [{name,url}], {threshold})`, fetches internally |
| D4 Max-score face | Yes | `selectHighestScoringFace` |
| D5 Sequential early-exit, cap 10 | Yes | sequential loop, `slice(0, MAX_STORED_PHOTOS)`, early-exit on match |
| D6 Manual bilinear warp 112x112 | Yes | `warpAffine` with border=0, verified 512-dim re-embedding |

## Documented Deviations (confirmed, not failures)

1. Module singleton over constructor injection — design explicitly allowed either; `faceRecognitionService` exported from `src/services/face-recognition/index.ts:554`, used by server and user.ts.
2. `FACE_VERIFY_MODE` parsed but not wired to runtime — ONNX-only decision; rollback = git revert. `.env.example` correctly omits it.
3. Threshold re-derivation 0.3435 @ FAR 1e-4 documented in `docs/benchmark-analysis.md` section 4.7 (production pipeline vs benchmark 0.3719).

## Issues Found

**CRITICAL**: None
**WARNING**: None
**SUGGESTION**: `FACE_VERIFY_MAX_PHOTOS` env var not wired to runtime cap (see findings).

## Risks

- Detector/alignment edge cases (e.g., extreme poses, heavy occlusion) not covered by the 2 integration tests; mitigated by design validation against BFW pipeline and 14ms latency.
- Threshold is production-pipeline-derived but was validated on BFW aligned-crop embeddings; live traffic calibration recommended after production flip (proposal's own success criteria).
- `FACE_VERIFY_MODE` unwired means switching back to human requires a git revert rather than an env flip — documented, acceptable.
- MQTT integration flow not re-run (requires Docker); covered by unit tests + FRS tests.

## Next Recommended

**archive**

## Skill Resolution

- Verified as the `sdd-verify` executor; no strict TDD mode active (no orchestrator declaration, no `strict_tdd` config).
- Full artifact set present (proposal, specs, design, tasks); all 32 tasks complete → full verification performed.
- Report validated via `gentle-ai sdd-verify-validate` with authoritative counts (6 requirements, 12 scenarios).
- Status: passed. Ready for archive.

## Verdict

PASS
