# Design: pnpm Monorepo + Preact Config Web App

## Technical Approach

Restructure into a pnpm workspace (`apps/backend`, `apps/web`, `packages/shared`), fix the broken tsc emit (the M1 gate), make runtime paths module-relative, then ship a Preact SPA (setup + photo admin + unidentified tray) served same-origin by the backend. M1→M4 milestones (proposal) deliver spec domains: `web-front` (WF-1..9), `photo-admin-api` (PA-1..6), `photo-storage` (RF-1/2/8-11), `user-config` (RF-2/6).

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|----------|
| D1 | Workspace | `packages: ["apps/*","packages/*"]`; root=orchestrator; benchmarks stay root tooling | keep-at-root; benchmark pkg | real isolation, zero churn for 1.3 GB metrics/.venv (explore 1A; C deferred) |
| D2 | Path policy | New `src/config/paths.ts`: `backendRoot` (walk-up from import.meta.url), `repoRoot`; env overrides `PYTHON_BIN`, `MODELS_DIR`, `METRICS_DIR`; cwd policy = run from `apps/backend` | `DOORCLOUD_ROOT` env; pin cwd | kills silent face-rec cwd regression (proposal risk #1); testable; Docker cwd is /app |
| D3 | tsc emit fix | `apps/backend/tsconfig.json` = build only (`rootDir: src`, include `src` → emits `dist/index.js`); `tsconfig.test.json` noEmit (`test/`+`bin/`); root `tsconfig.json` noEmit for `scripts/` | keep `rootDir: "."` | fixes ENOENT crash-loop (`start` = `node dist/index.js`); tools typechecked, not emitted |
| D4 | Config/data | `.env` and `data/` move to `apps/backend/` (`STATE_DB_PATH` default `backendRoot/data/app-state.db`) | root | setup page writes `.env` (D2); pnpm scripts run in package dir |
| D5 | SPA routing | Hash routing (`#/setup`, `#/admin`); `GET /` + `GET /setup` → `index.html`; assets under `/assets/*` | history + catch-all wildcard | static wildcard can never shadow `/admin/*`, `/photos/*` signed routes |
| D6 | State mgmt | Preact signals (`@preact/signals`) + `createSetupController` (DI fetch/timers) ported from openwa-setup-ux | hooks-only | imperative poll start/stop/counter + double-start guard; no interval churn on re-render |
| D7 | Static serving | `@fastify/static` registered with `prefix: '/assets/'`; explicit `GET /`, `/setup` via `sendFile`; `WEB_DIST` env default `resolve(repoRoot,'apps/web/dist')` | `wildcard: true` at `/` | dead dep finally used; API never shadowed |
| D8 | Multipart | Per-route `request.parts({ limits: { files: 20, fileSize: 20MB } })` on admin upload; global `3/3` unchanged | raise global limits | bulk admin uploads (PA-5) without loosening existing routes |
| D9 | Tray ops | promote = MOVE (`movePhoto`); delete = hard `rm`; person delete requires `?confirm=true` | copy; trash folder | PA-6 "never copy"; trash out of scope |
| D10 | Shared pkg | `@doorcloud/shared` tsc-built (`dist` + `.d.ts` + exports map), consumed as built via `workspace:*` | import workspace TS source | avoids Vite dep-optimizer workspace-source issues; runtime-validated both sides |

## Data Flow

    Browser ──GET /,#/setup──▶ Fastify @fastify/static → index.html (Preact SPA)
        │ ◀── Bearer SETUP_TOKEN (localStorage) ── apiFetch wrapper ──▶ /setup/* (unchanged)
        │                                                        └─▶ /admin/photos/* (new, setupAuthMiddleware)
    Door MQTT photo ─▶ verify ──no match──▶ storage.upload('unidentified', f) ─▶ tray
                                       ──match──▶ storage.upload('{Person}', f)  ─▶ person folder
    migrateLegacyUnidentified() @ boot: /^\d/ files in person folders → unidentified/ (idempotent)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `pnpm-workspace.yaml`, root `package.json`, root `tsconfig.json` | Mod | workspace globs + allowBuilds; orchestrator scripts (`--filter`/`-r`); scripts typecheck |
| `apps/backend/**` (src, bin, test, tsconfig*, vitest.config.mts, scripts/mosquitto, scripts/openwa, `.env`, `data/`) | Move | current package, as-is; `package.json` = `@doorcloud/backend`, all deps/scripts |
| `apps/backend/scripts/face_recognition_server.py` | Move | runtime IPC server ships with backend (root scripts = benchmark only) |
| `src/config/paths.ts` | Create | `backendRoot`/`repoRoot` + env overrides (D2) |
| `src/services/face-recognition/python-manager.ts`, `onnx-provider.ts`, `model-validator.ts` | Mod | cwd → paths.ts (script/.venv, models) |
| `src/storage/state.ts`, `src/integrations/whatsapp/setup.ts`, `src/services/user.ts`, `src/network/mqtt/routes/photo.ts`, `src/services/benchmark/*` | Mod | data/.env/metrics paths via paths.ts |
| `src/network/http/routes/setup.ts` | Mod→M3 Del | keep `renderSetupHtml` fallback until M3; `GET /setup` serves SPA; inline schemas → shared (M2) |
| `src/network/server.ts` | Mod | `@fastify/static` (D7); boot migration call |
| `src/storage/photos.ts` | Mod | primitives: `createFolder/renameFolder/deleteFolder/deletePhoto/movePhoto/listUnidentified`; `listDirectories()` excludes `unidentified/` (RF-8..11) |
| `src/services/user.ts` | Mod | no-match → `unidentified/` sink, `{uuid}.{ext}` (RF-1, user RF-2) |
| `src/storage/migrations.ts` | Create | `migrateLegacyUnidentified()`: move `/^\d.*\.(jpg\|jpeg\|png\|webp\|gif)$/` from every person folder to `unidentified/`; idempotent; called in `Server.start()` before listen; warn-only on failure |
| `src/network/http/routes/admin-photos.ts` | Create | 10 handlers per PA-1..6 table |
| `apps/backend/test/{admin-photos,photo-storage-admin,migration,paths}.test.ts` | Create | see Testing |
| `packages/shared/**` | Create | `@doorcloud/shared`: zod DTOs (`admin.ts`, `setup.ts`, `envelope.ts`), tsc build, exports map; zod dep |
| `apps/web/**` | Create | Preact+Vite SPA: `vite.config.ts` (proxy `/setup|/admin|/photos` → :1996), `src/{auth,api,controller}/`, `views/{Setup,Admin}.tsx`, tray component, vitest |
| `Dockerfile`, `.dockerignore` | Mod | multi-stage workspace build (M1 gate); copy shared+backend+web dist + `face_recognition_server.py` |
| `scripts/*.ts` (11: run-benchmarks, benchmark-human, _run-repeat*, derive-verify-threshold, embed-one-model, reembed-bfw-worker, export-pipeline-similarities, analyze-demographics-worker, photo-send, test-onnx-inference) | Mod | `../src` → `../../apps/backend/src` |
| `.github/workflows/*.yml` | Mod | M4: `pnpm --filter @doorcloud/backend test:local` etc. |

## Interfaces / Contracts

```ts
// packages/shared/src/admin.ts (zod; backend + web validate)
personName: z.string().trim().min(1).regex(/^[^/\\]+$/)  // PA-2: no separators, != '.'/'..'
deleteQuery = z.object({ confirm: z.literal('true').optional() })
personItem = z.object({ name: personName, photoCount: z.number() })
photoItem  = z.object({ filename: z.string(), url: z.string().url() })
promoteBody = z.object({ person: personName })
// envelope: z.object({ error: z.boolean(), message: z.unknown() })  // PA-1
```

`DiskPhotoStorage` additions (all through existing `#safeJoin`, RF-11): `createFolder(name)`, `renameFolder(from,to)`, `deleteFolder(name)` (`rm {recursive:true}`), `deletePhoto(folder,file)`, `movePhoto(from,file,toFolder)` (`rename`), `listUnidentified()` (raw listing, hides `.tmp-*` only — no numeric-prefix filter).

Admin routes: person name + owner check at route level (`USER_NAME` → 403 rename/delete, PA-3/user RF-6); duplicates → 409; `confirm` missing → 400; promote to missing person → 404; all errors `{ error, message }`.

Web: `auth.ts` (`doorcloud.setupToken` in localStorage, `apiFetch` adds Bearer, 401 → token prompt per WF-2); `createSetupController({ fetch, setTimeout })` states `idle|starting|polling|qr_ready|connected|error|waiting`, `POLL_INTERVAL=3000`, `MAX_POLLS=20`, `MAX_FAILURES=3`; page-load: initial status fetch → render per state (WF-3), auto-QR on `qr_ready`, manual "Load QR"/"Refresh status" (WF-6).

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Backend unit | admin routes (PA-1..6) | `app.inject` (server.test.ts pattern) + tmpdir PHOTOS_DIR (photo-storage.test.ts pattern) |
| Backend unit | storage primitives RF-8..11 | traversal rejection, owner guards, move-not-copy, rm recursive |
| Backend unit | migration | moves legacy prefix files, idempotent second run, leaves references |
| Backend unit | paths (D2) | python-manager/onnx/state/.env resolve under backendRoot; missing script fails loudly |
| Backend unit | user sink (RF-1) | no-match → `unidentified/`, owner folder untouched |
| Web unit | setup controller (WF-3..6) | vitest + fake timers + mocked fetch: cap 20, stop on qr/connected, 3-failure error, double-start guard, manual refresh |
| Web unit | admin/tray store (WF-7..9) | pure logic + mocked apiFetch, 401 path |
| Web | components | smoke render only (repo style: light DOM, no RTL) |

## Threat Matrix

| Boundary | Applicability | Design response | RED tests |
|---|---|---|---|
| Static-serve routing shadowing | Applicable | `/assets/` prefix + explicit `GET /`,`/setup` only; API registered before static | `app.inject('/admin/photos/persons')` returns API JSON, not index.html; `GET /` returns SPA |
| Python subprocess spawn | Applicable | python-manager paths module-relative (D2); missing script → explicit init error, no cwd fallback | paths tests; existing python-manager-ipc tests |
| Documentation-like paths | N/A — no markdown/exec execution | — | — |
| Git repo selection / commit / push / PR commands | N/A — no VCS automation in this change | — | — |

## Migration / Rollout

- **M1 (structure + build fix)** — workspace reshape, package moves, 11 script repoints, D2/D3/D4, Dockerfile multi-stage, `.env`→`apps/backend/`. Gate: workspace `test:local`+`typecheck`+`lint`, `docker build` succeeds, manual boot with ONNX init + QR status. Commit.
- **M2 (shared)** — `packages/shared` DTOs; backend setup.ts schemas → shared; `workspace:*`. Gate: full suite. Commit.
- **M3 (feature)** — `apps/web` (setup view absorbs openwa-setup-ux + admin + tray); admin routes + storage primitives + unidentified sink + boot migration; static serving; delete `renderSetupHtml`. Gate: new tests + full suite + manual photo CRUD + QR e2e. Commit.
- **M4 (wrap)** — CI workspace commands, README/AI docs, Pi `.env` note, mark `openwa-setup-ux` superseded (state.yaml). Commit.

Rollback: git-revert per commit (M1–M4 independent); deletes covered by `photos:backup`.

## Open Questions

- [ ] `WEB_DIST` default (`apps/web/dist`) vs copying into backend `public/` in Docker — default assumed; confirm on Pi layout
- [ ] Unidentified file naming `{timestamp}-{uuid}` (chronological, raw-listed) — assumed
- [ ] `MAX_POLLS`/`POLL_INTERVAL` constants live in `apps/web` only (openwa-setup-ux design) — confirmed by spec WF-5
