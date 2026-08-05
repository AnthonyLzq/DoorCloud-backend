# Archive Report: monorepo-config-web

| Field | Value |
|-------|-------|
| Change | monorepo-config-web |
| Archived to | `openspec/changes/archive/2026-08-05-monorepo-config-web/` |
| Archived on | 2026-08-05 |
| Verdict | PASS |
| Tasks | 25/25 complete |
| Specs | web-front (9 req), photo-admin-api (6 req), photo-storage (RF-1/RF-2 modified, RF-8..RF-11 added), user-config (RF-2 modified, RF-6 added) |
| Quality gates at close | 405 tests (shared 39, backend 323, web 43), typecheck clean, lint clean, web build clean, Playwright smoke 1 passed |

## Final-State Authority Note

This archive report is the terminal record of the cycle and reflects the state
AT CLOSE (2026-08-05), not any earlier intermediate snapshot. All 25 tasks
(M1-M4) were applied and committed:

- `867b2d0` — monorepo structure (M1)
- `a16e014` — @doorcloud/shared package (M2)
- `40cdbad` — web SPA + admin API + unidentified tray + migration (M3)
- `17ed825` — CI + UI component tests + Playwright e2e + docs + supersede
  marker (M4)

Working tree clean. Gates at each milestone were green; the final suite is
405 tests and the independent reviewer is PASS.

## Review

Native bounded review approved and bound to the change: lineage
`review-b0cf07da177aa065`, low-risk (0 lenses), gate result `allow` (post-apply).

Independent `sdd-verify` verdict: **PASS** — 23/23 requirements, 38/38
scenarios, 0 CRITICAL, 0 WARNING. Two non-blocking notes were captured at
verification time and are NOT open blockers:

- Cosmetic SUGGESTION: `apps/web/src/auth.ts:61` `useOptionalChain` biome lint
  hint (no behavior impact).
- Recommendation (optional): add a docker build smoke job to CI; the M1 docker
  multi-stage boot was exercised at the M1 gate but not re-run during
  `sdd-verify`.

Neither required follow-up work before close.

## What Was Accomplished

- **M1 — Workspace reshape + build fix**: `apps/backend` (moved as-is including
  `face_recognition_server.py`), root = orchestrator, root tsconfig noEmit,
  `src/config/paths.ts` module-relative path resolution consumed by
  python-manager, onnx-provider, model-validator, state, whatsapp, user, mqtt
  photo, and benchmarks; tsc emit fixed (rootDir src -> dist/index.js); a
  multi-stage Dockerfile.
- **M2 — @doorcloud/shared**: zod DTOs + envelope + setup types exported; setup
  schemas moved to `workspace:*`.
- **M3 — Web SPA + admin API**: Preact app at `apps/web` served at `/` via
  `@fastify/static` (API registered before static), hash routing, signals +
  controllers; `Setup` view (auto-QR, start guard, poll cap 20, 3-failure cap,
  manual recovery) and `Admin` view (persons CRUD, owner protected, photos,
  unidentified tray promote/delete). `POST /admin/photos/*` backing
  `src/storage/photos.ts` primitives (create/rename/deleteFolder,
  delete/movePhoto, safeJoin containment, tray excluded from `listDirectories`).
  No-match photos sink to `unidentified/`; legacy numeric-prefix files
  hidden + migration via `storage/migrations.ts`. Legacy `renderSetupHtml` page
  deleted.
- **M4 — Wrap: CI workflows -> pnpm filters, README + docs/ai monorepo docs,
  Pi env + deploy doc (WEB_DIST), openwa-setup-ux superseded via
  `openspec/changes/openwa-setup-ux/state.yaml` (superseded By:
  monorepo-config-web), UI component tests + Playwright smoke e2e (1 passed real
  chromium) smoke.

## Source of Truth

The delta specs were synced into the main spec store under `openspec/specs/`:

- `openspec/specs/photo-storage/spec.md` — RF-1 and RF-2 MODIFIED (child folder
  sink semantics), RF-8..RF-11 ADDED; other requirements preserved
- `openspec/specs/user-config/spec.md` — RF-2 MODIFIED, RF-6 ADDED; other
  requirements preserved
- `openspec/specs/web-front/spec.md` — created (full spec, 9 requirements)
- `openspec/specs/photo-admin-api/spec.md` — created (full spec, 6 requirements)

The archived change folder `openspec/changes/archive/2026-08-05-monorepo-config-web/`
contains the proposal, exploration, design, tasks, state, archive report, and
the 4 delta specs.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready
for the next change.