# Tasks: Strix Hardening Fixes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350–450 (7 files + 4 test files) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (one PR to main) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

> Note: maintainer explicitly disabled the line budget and requested everything direct to main/master in a single PR (size:exception granted up front). No review-workload stop is applied.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Auth layering (F-01) + CORS dev (F-03) | PR 1 | `pnpm --filter @doorcloud/backend test:local web-auth` | `pnpm --filter @doorcloud/backend test:local` | revert web-auth isExemptPath + server.ts CORS change |
| 2 | Upload chain (U-01/U-02/U-03) | PR 1 | `pnpm --filter @doorcloud/backend test:local user` | `pnpm --filter @doorcloud/backend test:local` | revert utils + routes/user + services/user |
| 3 | Admin guards (A-01/A-02) + headers (U-04) | PR 1 | `pnpm --filter @doorcloud/backend test:local admin-photos` | `pnpm --filter @doorcloud/backend test:local` | revert admin-photos + photos.ts |

## Phase 1: Foundation

- [x] 1.1 Create `apps/backend/src/utils/image-validation.ts` — `validateImage(buffer, mimetype): { ext, mimetype }`; magic-byte sniff for jpeg/png/webp/gif; throw 415 on mismatch
- [x] 1.2 Add a shared upload-limit constant (`USER_UPLOAD_LIMITS`) reused by `/api/user/upload`

## Phase 2: Core Fixes

- [x] 2.1 `middleware/web-auth.ts` — extend `isExemptPath` to `/admin` + `/setup` (F-01)
- [x] 2.2 Confirm `/admin/*` and `/setup/*` route-level `setupAuth` (Bearer) still enforce; no Basic interception
- [x] 2.3 `routes/user.ts` — per-route `request.parts({ limits: USER_UPLOAD_LIMITS })`; map `FST_REQ_FILE_TOO_LARGE`→413, empty/malformed body→400 (U-02/U-03)
- [x] 2.4 `services/user.ts` — use `validateImage`, derive stored extension from sniffed content (U-01)
- [x] 2.5 `routes/admin-photos.ts` upload — use `validateImage` for admin multipart (U-01)
- [x] 2.6 `routes/admin-photos.ts` — create guard `name === USER_NAME`→403; rename guard `to === USER_NAME`→403 (A-01)
- [x] 2.7 `routes/admin-photos.ts` — reject `.`/`..` in `photoParams`/`trayPhotoParams` filename→400 (A-02)
- [x] 2.8 `routes/photos.ts` — add `Content-Disposition` header on signed serve (U-04)
- [x] 2.9 `server.ts` — CORS dev default: no `origin: true` reflection when `CORS_ORIGINS` unset (F-03)

## Phase 3: Tests

- [x] 3.1 `test/image-validation.test.ts` — each format accepted; non-image rejected 415; sniffed ext wins over declared mimetype
- [x] 3.2 `test/web-auth.test.ts` — admin/setup reachable with Bearer; `/` + `/assets` need Basic; wrong Bearer→401 (F-01)
- [x] 3.3 `test/admin-photos.test.ts` — owner create/rename-to rejected; `.`/`..` filename→400; admin upload rejects non-image (A-01/A-02/U-01)
- [x] 3.4 `test/user.test.ts` — oversized→413; empty/malformed body→400; upload uses sniffed ext (U-02/U-03)
- [x] 3.5 `test/server.test.ts` — CORS dev default does not reflect arbitrary Origin (F-03)

## Phase 4: Verification & Cleanup

- [x] 4.1 Run `pnpm test:local` (green)
- [x] 4.2 Run `pnpm typecheck` + `pnpm lint` (green)
