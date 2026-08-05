# Tasks: pnpm Monorepo + Preact Config Web App

## Review Workload Forecast

Estimated lines ~4500-6000 (package move); exception-ok, size:exception accepted, no decision needed; M1-M4 independent commits.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | PR | Test command | Harness | Rollback |
|------|----|--------------|---------|----------|
| M1 | PR 1 | `pnpm --filter @doorcloud/backend test:local && pnpm -r typecheck` | docker build + boot | revert M1 |
| M2 | PR 2 | `pnpm --filter @doorcloud/backend test:local` | N/A type-only | revert M2 |
| M3 | PR 3 | `pnpm -r test:local` + new tests | manual CRUD + QR e2e | revert M3 |
| M4 | PR 4 | `pnpm -r test:local && typecheck && lint` | GitHub Actions | revert M4 |

## Phase 1: Structure + Build Fix (M1)

- [x] 1.1 pnpm-workspace.yaml: apps/* + packages/* (allowBuilds kept); root = orchestrator; root tsconfig noEmit
- [x] 1.2 Move package -> apps/backend as-is (incl. face_recognition_server.py); @doorcloud/backend
- [x] 1.3 RED: test/paths.test.ts (roots, env, missing script) -> src/config/paths.ts (D2 walk-up)
- [x] 1.4 Repoint 11 root scripts (design list) ../src -> ../../apps/backend/src
- [x] 1.5 D3 tsc fix: backend tsconfig build-only (rootDir src -> dist/index.js); test/root noEmit; start dist/index.js
- [x] 1.6 paths.ts consumers: python-manager, onnx-provider, model-validator, state.ts (STATE_DB_PATH default), whatsapp, user, mqtt photo, benchmarks
- [x] 1.7 .env + data/ -> apps/backend (D4); metrics via paths.ts
- [x] 1.8 Dockerfile multi-stage (workspace install, dists, face_recognition_server.py) + .dockerignore
- [x] 1.9 M1 gate: suite + typecheck + lint, docker build, boot (ONNX + QR)

## Phase 2: Shared Package (M2)

- [x] 2.1 packages/shared (D10): tsc build + exports map, zod; DTOs (personName, deleteQuery, items, promoteBody) + envelope + setup types (session:null)
- [x] 2.2 setup.ts schemas -> @doorcloud/shared (workspace:*)
- [x] 2.3 M2 gate: full suite

## Phase 3: Feature — Web App + Admin API (M3)

- [x] 3.1 Scaffold apps/web: Preact+Vite, hash routing (D5), signals (D6), proxy; auth.ts (Bearer, 401 prompt WF-2)
- [x] 3.2 RED: controller test (cap 20, stop qr/connected/session:null, 3-failure, double-start) -> createSetupController + Setup view (auto-QR, Start disabled) (WF-1..6)
- [x] 3.3 RED: photo-storage-admin.test (traversal, move, rm, owner) -> photos.ts primitives (folder CRUD, delete/movePhoto, listUnidentified, safeJoin, tray excluded)
- [x] 3.4 RED: admin-photos.test (401/400/409/403/confirm/promote) -> routes/admin-photos.ts (PA-1..6), per-route multipart 20/20MB (D8)
- [x] 3.5 user.ts no-match -> unidentified/ {uuid}.{ext} (RF-1) + RED: owner untouched
- [x] 3.6 RED: migration.test (/^\d/ moved, idempotent) -> storage/migrations.ts migrateLegacyUnidentified()
- [x] 3.7 server.ts: @fastify/static /assets/ + GET /, /setup (D7); API before static
- [x] 3.8 Admin view: persons CRUD (owner protected), photos, tray (WF-7..9) + store tests
- [x] 3.9 Delete renderSetupHtml; M3 gate: suite + manual CRUD + QR e2e

## Phase 4: Wrap (M4)

- [ ] 4.1 CI workflows -> pnpm --filter/-r (test:local, typecheck, lint)
- [ ] 4.2 README + docs/ai monorepo layout; Pi .env + deploy doc (WEB_DIST)
- [ ] 4.3 Mark openwa-setup-ux superseded (state.yaml); M4 gate: CI green
