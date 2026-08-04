# Exploration: pnpm Monorepo + Web Config Front (OpenWA setup UX + photo admin)

## Current State

Single pnpm package at repo root (`pnpm-workspace.yaml` currently lists only `.`).
pnpm 10.30.1, TS 7.0.2, Fastify 5.10, Vitest 4.1.10, Biome 2.5.4, Node 22.20.

**Build/deploy reality (verified by emitting):**
- `tsc -p tsconfig.json` (rootDir `.`, includes `src|scripts|bin`) emits to
  `dist/src/...` — but `start` is `NODE_PATH=dist node dist/index.js`, which
  points at `dist/index.js`. **The build is currently broken**: a fresh build
  produces `dist/src/index.js`, not `dist/index.js`. The committed `dist/` is
  STALE (old `rootDir: src` era; still contains a dead `database/` folder that
  no longer exists in `src/`). The Docker build (`pnpm build` → `pnpm start`)
  would crash-loop with ENOENT. This must be fixed as part of the migration.
- `bin/` and `scripts/` are never compiled to dist — they run via `tsx`
  (CLI: `pnpm door-cloud` → `tsx bin/door-cloud.ts`; benchmarks: `npx tsx`).
  They are included in tsconfig for typechecking only.

**Import style:**
- Only 11 `src/` files use aliased absolute imports (`from 'config/env'` etc.
  via `paths: { "*": ["./src/*"] }`); ~28 import statements total. The rest
  of `src/` uses relative imports.
- Tests use RELATIVE imports (`../src/...`) — the vitest `resolve.alias`
  block (config/integrations/lib/network/schemas/services/storage/utils) is
  effectively unused.
- 12 root `scripts/*.ts` (benchmark + CLI) import `../src/...` — these break
  if `src` moves and imports are not updated.

**cwd-sensitive paths (verified):**
- `python-manager.ts` L101-105: `resolve(process.cwd(), 'scripts/face_recognition_server.py')`
  and `resolve(process.cwd(), '.venv/bin/python3')`.
- `onnx-provider.ts` L121: `resolve(process.cwd(), modelPath)` for ONNX models.
- `integrations/whatsapp/setup.ts` L38: `.env` write target = `resolve(process.cwd(), '.env')`.
- `STATE_DB_PATH` default `./data/app-state.db` (cwd-relative).
- `user.ts` L126-129: `resolve(__dirname, '..', '..', 'metrics', 'matchPhoto.csv')`
  — `__dirname`-relative, so it MOVES with the code (becomes
  `apps/backend/metrics` after migration unless handled).

**HTTP surface today:**
- `GET /setup` → inline HTML string (`renderSetupHtml`, `setup.ts` L40-151),
  vanilla JS, manual flow (no loading/polling).
- `GET|POST /setup/config`, `/setup/openwa/status|start|qr|send-test` — all
  behind `setupAuthMiddleware` (Bearer `SETUP_TOKEN`, open when unset).
- `POST /api/user/upload` — multipart upload to `PHOTOS_DIR/{USER_NAME}`.
- `GET /photos/:signature/:expiresAt/*` — signed photo serving (HMAC + TTL),
  registered in `server.ts` alongside `@fastify/cors`
  (`origin: CORS_ORIGINS ?? true`) and `@fastify/multipart`
  (`limits: { fields: 3, files: 3 }`).
- `@fastify/static` is a declared dependency but NEVER registered — dead dep,
  now useful (serve the web app).
- `src/schemas/` does NOT exist (AGENTS.md stale); zod schemas live inline
  (`mqtt/photoPayloads.ts`, `routes/setup.ts`, `config/env.ts`).
- `src/lib/human/` is dead code (no imports).

**Storage (`DiskPhotoStorage`, `src/storage/photos.ts`):**
- `upload(userFolder, filename, buffer)` — atomic tmp+rename, auto-creates
  folders recursively, sweeps orphaned tmp files. `list()` hides
  numeric-prefix (no-match) files and `.tmp-*`. `listDirectories()` = known
  persons (folder name IS identity). `getUrl()` returns signed URLs.
  `resolvePath()` centralizes traversal containment.
- NO rename-folder / delete-folder / delete-photo primitives exist yet.
- Matched door photos accumulate back into the person's folder; unmatched go
  to `PHOTOS_DIR/{USER_NAME}` with numeric-timestamp prefix (never re-listed).

**Other:**
- `metrics/` = 1.3 GB (883 MB embeddings + figures + CSVs), gitignored.
  `.venv/` = 266 MB (python benchmark tooling). `models/` = ONNX models.
- `compose.yaml` only runs `openwa` + `mosquitto`; the backend itself runs
  separately (host/Pi), Dockerfile exists for containerized deploy.
- `preservice` = `node scripts/ensure-services.mjs && node scripts/openwa/sync-api-key.mjs --optional`.
- CI: `.github/workflows/lint.yml` + `test.yml`, root-level commands.
- Prior change `openwa-setup-ux`: explore + propose DONE (approved
  interactively; esbuild devDep approved), user stopped before spec. Its
  design (`setup-ui.ts` state machine, `POLL_INTERVAL=3000`, `MAX_POLLS=20`,
  `MAX_FAILURES=3`, page-load per state, manual recovery) is the requirement
  input for the new web app.

## Affected Areas

- `pnpm-workspace.yaml`, root `package.json` — workspace reshape; root becomes orchestrator.
- `apps/backend/*` — entire current `src/ bin/ test/ scripts(mosquitto,openwa) tsconfig* vitest.config.mts` moves.
- `src/network/http/routes/setup.ts` — inline HTML replaced by served web app (or kept as fallback).
- `src/network/server.ts` — serve static web build; multipart limits for admin uploads; cwd/static wiring.
- `src/storage/photos.ts` — new primitives: createFolder/renameFolder/deleteFolder/deletePhoto.
- `src/services/user.ts` — metrics CSV path (split between root `metrics/` and moved code).
- `src/services/face-recognition/python-manager.ts` + `onnx-provider.ts` — cwd-sensitive paths.
- `scripts/*.ts` (12 files) — `../src/` imports break when src moves.
- `Dockerfile`, `.dockerignore` — workspace-aware build.
- `test/*` — move with backend; new tests for admin routes + web state logic.
- `openspec/specs/photo-storage` — MODIFIED (admin CRUD requirements) + new spec domains (web-front, admin-api).
- `docs/ai/*`, `README.md` — paths, setup flow, .env location.

## Approaches

### 1. Monorepo structure

**A. Backend-as-workspace-app (recommended):**
```
DoorCloud-backend/
├── pnpm-workspace.yaml        # packages: [".", "apps/*", "packages/*"] (or exclude ".")
├── package.json               # orchestrator: biome, orchestration scripts via --filter/-r
├── apps/backend/              # current src/ bin/ test/ scripts(mosquitto,openwa) tsconfig* vitest.config
│   └── package.json           # all current deps + scripts (paths kept: tsconfig lives here, aliases resolve to ./src)
├── packages/shared/           # zod DTOs + types (admin API, OpenWA setup, envelope); tsc build + exports
├── scripts/                   # benchmark tooling (python + TS), ensure-services, openwa helpers STAY at root
├── metrics/ .venv/ models/ data/ .env    # stay at root (cwd-sensitive runtime data)
```
- Backend runtime data (`models/`, `.env`, `data/`, `metrics/`) stays at root;
  backend runs with `cwd=apps/backend`… **no** — see risk: python-manager and
  models resolve from cwd. Two options: (a) run backend from repo root
  (`pnpm --filter backend start` keeps cwd at root? No — pnpm runs scripts in
  the package dir). Real options: make paths module-relative
  (`import.meta.url` / `__dirname`) instead of cwd-relative, or set a canonical
  `DOORCLOUD_ROOT` env used by all path resolution. Recommend: switch
  python-manager/onnx-provider to module-relative resolution (small, testable)
  and keep `.env`/`data/` under apps/backend (setup page already writes cwd
  `.env` — pin cwd to apps/backend).
- Pros: real isolation; root stays clean; benchmark tooling untouched; one
  package.json per app; workspace protocols.
- Cons: path-sensitivity cleanup needed; benchmark `../src/` imports must be
  repointed (12 files, mechanical); Dockerfile rewrite.
- Effort: Medium-High (structural), but the code itself barely changes.

**B. Keep everything at root, add web as sibling app:**
`pnpm-workspace.yaml` → `["apps/web", "packages/shared"]` + keep root package
as-is. Backend stays put.
- Pros: zero backend churn; smallest diff; fastest to ship the web app.
- Cons: repo never actually becomes a monorepo for the backend; "apps/backend"
  decision (user decision #1) unfulfilled; benchmark imports unchanged;
  future extraction just gets harder; build stays at root.
- Effort: Low.

**C. Full move including benchmark tooling as its own package:**
`apps/benchmarks` (or `tools/benchmarks`) with its own python/tsconfig/deps.
- Pros: cleanest; benchmark imports become workspace-internal.
- Cons: high churn for 1.3 GB runtime data + .venv + 12 scripts + python
  files; zero user value today; delays the feature. Defer as follow-up.
- Effort: High.

**Recommendation: A now, C later.** Benchmarks stay as root tool area (user
decision #1) — mechanical repoint of `../src/` → `../../apps/backend/src` in
the 12 scripts, `.venv`/`metrics/`/`models/` untouched.

### 2. Shared package contents

Candidate schemas/types in `src/`:
- `config/env.ts` — **KEEP in backend.** Front never reads env; moving it is
  the largest blast radius for zero benefit.
- `mqtt/topics.ts`, `mqtt/photoPayloads.ts` — **KEEP in backend.** MQTT is
  backend-only.
- Genuinely cross-app: (1) admin photo API DTOs (person list item, photo list
  item with signed URL, create/rename/delete payloads), (2) OpenWA setup
  types (`OpenWaSetupStatus`, `OpenWaQr`, `OpenWaSession`), (3) API response
  envelope shape `{ error, message }`.
- Recommendation: `packages/shared` = zod schemas for those three groups
  (runtime-validated on both sides; backend keeps `fastify-type-provider-zod`,
  front validates API responses). tsc-built package with `exports` map;
  consumed via `workspace:*`. zod becomes a dep of shared + web.
- Blast radius: only new code consumes it initially; the existing inline
  schemas in `setup.ts` can be migrated to shared in the same PR (they are
  small and their tests are fetch-mock based, so low risk) or left inline and
  deduped later. Recommend migrating setup schemas to shared since the web
  app needs the same shapes.
- Effort: Low-Medium.

### 3. Front stack (smallest sensible for 2 views)

| Option | Pros | Cons | Effort |
|--------|------|------|--------|
| **Vite + Svelte 5** | ~3 KB runtime, compile-time, no vDOM; runes (`$state`) map 1:1 to the setup-ux state machine; tiny API for forms/uploads | Smaller ecosystem; user may not know Svelte | Low |
| Vite + Preact | ~4 KB; React-compatible API | Preact-signal vs hooks split in ecosystem; still needs a render model | Low |
| Vite + React 19 | Familiar; huge ecosystem | ~140 KB min+gzip for 2 views; overkill | Low |
| Vanilla TS modules | Zero framework; matches current page style | Hand-rolled DOM updates for polling + uploads get messy; the setup-ux design already proved a controller is needed | Medium |

- The app must: poll (3s/cap 20), auto-load QR image, per-state page load,
  3-failure cap, manual recovery, photo CRUD UI (list/upload/rename/delete),
  auth token handling. All are trivially expressible in any of the four.
- **Recommendation: Vite + Svelte 5.** Smallest real-framework footprint,
  the compile-time model fits the "capa de front chica" constraint, and the
  dependency-injected `createSetupController` from the openwa-setup-ux
  proposal ports directly into a Svelte 5 runes store. Vite dev server
  proxies `/setup` and `/admin` to :1996 (no CORS churn); `vite build` →
  static assets.
- Note on `packages/shared` consumption: build the shared package with tsc
  (dist + types + exports map) and let Vite consume the built JS — avoids
  workspace-TS-source issues in Vite's dep optimizer. Zod runs fine in the
  browser.
- Effort: Low-Medium.

### 4. Photo admin API

Mount under `/admin/photos` reusing `setupAuthMiddleware` (SETUP_TOKEN).
REST surface:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/photos/persons` | List person folders (name + photo count) via `listDirectories()` + `list()` |
| POST | `/admin/photos/persons` | Create folder `{ name }` (validate: non-empty, no path separators, not `.`/`..`, unique; reuse upload() or mkdir) |
| PATCH | `/admin/photos/persons/:name` | Rename `{ name: newName }` (forbid renaming `USER_NAME` owner folder; target must not exist) |
| DELETE | `/admin/photos/persons/:name?confirm=true` | Delete folder recursively (forbid deleting `USER_NAME` owner folder; hard delete — backups exist via `photos:backup`) |
| GET | `/admin/photos/persons/:name/photos` | List photos + signed URLs (`list()` + `getUrl()`) |
| POST | `/admin/photos/persons/:name/photos` | Multipart upload (reuse `upload()` naming convention: sanitized base + uuid; raise multipart limits via per-route registration — current global `files: 3` is too small) |
| DELETE | `/admin/photos/persons/:name/photos/:filename` | Delete one photo (safeJoin containment; allow deleting timestamp-prefixed no-match files too) |

- New `DiskPhotoStorage` primitives: `createFolder`, `renameFolder`,
  `deleteFolder` (rm recursive with containment + owner-folder guard),
  `deletePhoto`. All through existing `#safeJoin` (already rejects escape).
- Owner-folder guard: resolve `USER_NAME` at route level, reject rename/delete
  targeting it (identity comes from folder name; deleting the owner folder
  would break verification AND the `{USER_NAME}` unmatched-photo sink).
- Where: `src/network/http/routes/admin-photos.ts` (new) + storage methods +
  server.ts multipart/static wiring. Lives in apps/backend.
- Effort: Medium.

### 5. Relationship with openwa-setup-ux

**Recommendation: FOLD the setup UX into the new web app.**
- The `setup-ui.ts` + esbuild plan is SUPERSEDED: the state machine becomes a
  Svelte module in `apps/web` (unit-testable with vitest + jsdom + fake
  timers — same coverage goal, no esbuild step, no inline HTML).
- The openwa-setup-ux explore/propose artifacts (Engram #108/#110/#112 and
  `openspec/changes/openwa-setup-ux/*`) remain as the requirements input:
  loading state, ~3s poll capped ~20, auto-load QR on `qr_ready`, page-load
  per state, 3-failure cap, manual recovery. All become requirements of the
  web setup view.
- Backend `/setup/openwa/*` + `/setup/config` endpoints UNCHANGED. Only
  `GET /setup` changes: instead of `renderSetupHtml()`, serve the built web
  app (same-origin). Keep `renderSetupHtml` as a dev fallback during
  transition or delete it once the web app lands.
- Action: mark `openwa-setup-ux` change as absorbed/superseded by
  `monorepo-config-web` (orchestrator to note in state; archive later).
- Effort: Low (absorbed).

### 6. CORS / deployment

- **Production (Pi): same origin.** Fastify serves the `vite build` output via
  `@fastify/static` (finally uses the dead dep) at `/` (SPA with
  `/setup` + `/admin` routes) or `/setup`. No CORS for the UI. Keep
  `CORS_ORIGINS` + its production refine for any external API clients.
- **Dev:** Vite dev server on :5173 with `server.proxy` → `http://localhost:1996`
  for `/setup`, `/admin`, `/photos`. Browser sees same-origin; no CORS change.
  (CORS `origin: true` in dev remains fine.)
- **Docker:** single image still runs backend only (web assets are static
  files inside the backend image — one service, simplest Pi deploy). The
  Dockerfile becomes a workspace build: install at root, `pnpm --filter @doorcloud/shared build`, `pnpm --filter @doorcloud/backend build`, `vite build` for web, then prod install + copy dists. Fix the `dist/index.js` entry mismatch as part of it.
- Effort: Low-Medium.

### 7. Testing

- **Backend:** tests move with code (`apps/backend/test`); relative `../src`
  imports survive unchanged. New tests: `admin-photos.test.ts` (app.inject
  pattern from `server.test.ts` + tmpdir PHOTOS_DIR from
  `photo-storage.test.ts`) + storage primitive tests. vitest.config.mts moves
  to apps/backend (aliases can be dropped or kept).
- **Web:** vitest + jsdom in apps/web; unit-test the setup state machine
  (fake timers + mocked fetch, mirroring repo style) and the admin photo
  store (pure logic). Light DOM assertions; skip RTL unless a component grows
  complex. Keeps the front layer small.
- **CI:** `.github/workflows/*.yml` updated to workspace-aware commands
  (`pnpm --filter @doorcloud/backend test:local` etc. or root delegation).
- Effort: Low.

### 8. Migration order (risk-isolating)

1. **M1 — Structure only (riskiest, do first, no features):** reshape
   workspace; move `src/ bin/ test/ scripts/(mosquitto|openwa) tsconfig*
   vitest.config.mts` → `apps/backend`; move root package.json deps/scripts
   into apps/backend; root package.json = orchestrator (biome + delegating
   scripts); repoint 12 benchmark scripts `../src/` → `../../apps/backend/src`;
   FIX the broken tsc emit (backend tsconfig: `rootDir: src` build config +
   separate typecheck-only config for scripts/bin/test) and the `start`
   entry; make python-manager/onnx-provider paths module-relative (or pin
   cwd); decide `metrics/` CSV location. Gate: `test:local`, `typecheck`,
   `lint`, `docker build`, manual boot + QR flow. Commit.
2. **M2 — packages/shared:** extract admin/setup DTO schemas; backend consumes
   via `workspace:*`. Gate: same suite. Commit.
3. **M3 — Feature:** apps/web (Svelte setup view absorbing openwa-setup-ux +
   photo admin view), backend `/admin/photos` routes + storage primitives +
   static serving of web build + multipart limits. Gate: new tests +
   full suite + manual photo CRUD + QR flow end-to-end. Commit.
4. **M4 — Wrap:** CI workflows, README/AI docs, `.env` location on Pi,
   docker deploy doc. Commit.

## Recommendation

**Adopt Approach 1A (backend-as-workspace-app) with benchmarks staying as a
root tool area; Vite + Svelte 5 for the web app; photo admin mounted under
`/admin/photos` behind SETUP_TOKEN; fold openwa-setup-ux into the web app;
same-origin serving in prod, vite proxy in dev; migrate in the M1→M4 order.**

## Risks

- **Broken build today** (`dist/src/...` emit vs `start` expecting
  `dist/index.js`; stale committed `dist/`) — fix in M1; verify `docker build`.
- **cwd-sensitive paths** (python-manager `.venv`/`face_recognition_server.py`,
  onnx-provider `models/`, `.env` write, `data/` sqlite) — module-relative
  refactor or canonical-cwd pin; regression risk if missed (backend boots but
  face recognition silently fails).
- **`__dirname`-relative metrics CSV** in `user.ts` splits `metrics/` after the
  move — make output dir configurable (`METRICS_DIR`) or repoint.
- **Benchmark scripts** (12 files) relative imports + 1.3 GB `metrics/` +
  `.venv` must keep working from root.
- **Docker multi-stage workspace build** — lockfile + workspace install + two
  package builds; `.dockerignore` must allow `apps/` + `packages/` while
  keeping `metrics/`/`models/`/`.venv` out.
- **Owner-folder safety**: delete/rename of `USER_NAME` folder must be
  rejected; traversal via new storage primitives must go through `safeJoin`.
- **Multipart limits** (global `files:3 fields:3`) block bulk admin uploads —
  per-route registration needed.
- **OpenWA status passthrough** (unknown statuses) — web app must poll-on-unknown
  (already a setup-ux requirement).
- **OpenSpec churn**: this change MODIFIES `photo-storage` spec and adds new
  domains (`web-front`, `admin-api`); archive step must sync deltas.
- **`openwa-setup-ux` supersession** — must be communicated in state.yaml so
  no one implements the esbuild plan in parallel.

## Open Questions (for proposal/spec)

1. Confirm **Svelte 5** as the front stack (vs Preact/vanilla).
2. SPA mount point: `/` with `/setup` + `/admin` routes vs separate roots —
   recommend single SPA at `/`.
3. Delete person folder: hard delete with `?confirm=true` (recommended) vs
   trash folder.
4. Confirm owner-folder (`USER_NAME`) rename/delete prohibition.
5. Benchmarks stay root tooling indefinitely (no own package) — confirm.
6. `.env` canonical location moves to `apps/backend/` on the Pi — confirm.
7. `GET /setup` fallback: keep `renderSetupHtml` during transition then drop.

## Ready for Proposal

Yes. Scope: workspace reshape (M1), shared package (M2), web app + admin API
(M3), CI/docs (M4). The proposal should capture the monorepo layout, the
front stack decision, the admin API surface, the openwa-setup-ux absorption,
and the M1→M4 migration order with the build-fix gate.
