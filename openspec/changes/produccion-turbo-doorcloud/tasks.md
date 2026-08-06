# Tasks: Produccion Turbo DoorCloud

## Review Workload Forecast

Estimated changed lines: Large (turbo infra, Docker, health/shutdown, compose, CI, docs)
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: None (no line limits)

Delivery strategy: direct to master, one commit per phase. No PR chaining or size exceptions.

### Suggested Work Units (one commit per phase; reversible independently)

| Unit | Goal | Commit | Focused test | Runtime harness | Rollback |
|------|------|--------|--------------|-----------------|----------|
| 1 | Turbo foundation | 1 | `pnpm build && pnpm typecheck && pnpm lint && pnpm test:ci` | fresh `pnpm install; turbo run build` twice (2nd cached) | remove turbo.json + root script change |
| 2 | Per-package dev scripts | 2 | `pnpm dev` boots 3 watchers | one terminal; proxy reach :1996 | revert the 3 dev script lines |
| 3 | `/healthz` + graceful shutdown | 3 | `pnpm --filter @doorcloud/backend test:local` | curl localhost:1996/healthz (200); `kill -TERM` drains | revert stopp/route/SIGTERM edits |
| 4 | Dockerfile + compose | 4 | `docker build` then `docker compose up` healthy | `docker inspect` healthy; `curl /healthz` in image | revert Dockerfile + compose doorcloud block |
| 5 | CI via turbo | 5 | CI green on fresh clone | workflow run | revert test.yml/runtime-integration.yml |
| 6 | Docs (README Docker) | 6 | markdown review | `docker compose up` handoff check | revert README |

## Phase 1: Turbo Foundation (TO-1, TO-2, TO-4, TO-5)

- [ ] 1.1 Create root `turbo.json` with tasks `build`/`lint`/`typecheck`/`test:ci`/`dev`; `build`+`typecheck`+`test:ci` `dependsOn ["^build"]`; `build.outputs ["{workspace}/dist/**"]`; `dev` `cache:false, persistent:true`, `dependsOn ["^build"]`
- [ ] 1.2 Add `turbo` devDependency to root `package.json` (version compatible with pnpm 10.30.1 / node 22)
- [ ] 1.3 Rewrite root scripts: `build`=`turbo run build`, `lint`=`turbo run lint`, `typecheck`=`turbo run typecheck && tsc --noEmit -p tsconfig.json`, `test:ci`=`turbo run test:ci`; keep `test:local`/`test:mqtt` composite as-is
- [ ] 1.4 Verify clean-clone order: shared#build before backend/web; no-op re-run is fully cached (no re-exec)

## Phase 2: Per-Package Dev Scripts (TO-3)

- [ ] 2.1 `apps/backend/package.json`: add `"dev":"nodemon --exitcrash"` (reuses nodemonConfig; port 1996, proxy target)
- [ ] 2.2 `packages/shared/package.json`: add `dev: tsc --watch -p tsconfig.json`
- [ ] 2.3 `apps/web/package.json`: keep `dev:vite`; confirm proxy → :1996 unchanged
- [ ] 2.4 Verify `turbo run dev` launches all three watchers concurrently; non-zero watcher fails whole task

## Phase 3: Healthz + Graceful Shutdown (CD-1, CD-2)

- [ ] 3.1 RED test: `GET /healthz` → 200, no auth, no secrets (hermetic vitest, server.ts handler) — run red then green
- [ ] 3.2 `apps/backend/src/network/server.ts`: add `GET /healthz` route BEFORE `@fastify/static`; returns `200 {"status":"ok"}`
- [ ] 3.3 Make `Server.stop()` idempotent: add `#stopping` guard via `#stopInternal` (mqtt.stop → facerec.shutdown → fastify.close) — unit test double-stop
- [ ] 3.4 `apps/backend/src/index.ts`: SIGTERM → 10s `setTimeout(exit 1, 10_000)` unrefed → `await Server.stop()` → `process.exit(0)`
- [ ] 3.5 Test: `kill -TERM` drains and exits 0 within grace window

## Phase 4: Dockerfile + Compose (CD-3, CD-4, CD-7, CD-8, CD-9)

- [ ] 4.1 Rewrite `Dockerfile`: base `node:22-bookworm-slim` + corepack pnpm 10.30.1, stages deps→build→prod; `RUN pnpm turbo run build` in build stage; prod `pnpm install --prod`; `WORKDIR /app/apps/backend/dist` + CMD `node index.js` (locked pair); copy backend+shared+web dist; keep Python samples
- [ ] 4.2 `HEALTHCHECK CMD node -e` fetch 127.0.0.1:1996/healthz (no curl layer)
- [ ] 4.3 `compose.yaml`: `doorcloud` joins mosquitto/openwa network; `image`, `container_name`, ports `1996:1996`; env `MQTT_HOST=mosquitto`,`MQTT_PROTOCOL=mqtt`,`NODE_ENV=production`,`HOST`,`PHOTOS_BASE_URL`; `env_file:.env`; `MQTT`+`PHOTOS_*`+`PHOTOS_URL_SECRET`+`USER_NAME`+`MODELS_CDN_URL`+`CORS_ORIGINS` all supplied; volumes `PHOTOS_DIR`,`STATE_DB_PATH`(mounted path sets STATE_DB_PATH), `MODELS_DIR:/app/apps/backend/models:ro`; `restart:unless-stopped`; healthcheck `/healthz`; depends_on health conditions
- [ ] 4.4 `.dockerignore`: add `.turbo/`, `apps/*/.turbo/`, `node_modules/.cache/turbo`

## Phase 5: CI via Turbo (TO-4, CD-3)

- [ ] 5.1 `test.yml`: replace manual `pnpm --filter @doorcloud/shared build` with `turbo run build`/`typecheck`/`lint`/`test:ci` tasks
- [ ] 5.2 `runtime-integration.yml`: turbo build; docker smoke polls `/healthz` (poll loop instead of sleep-20)

## Phase 6: Docs / Env Handoff (CD-10)

- [ ] 6.1 `README.md`: Docker section → `bookworm-slim` (not Alpine), same-origin SPA, compose `doorway` usage, volumes/state/models mounts, `docker compose up`
- [ ] 6.2 Env handoff: required (`MQTT_*`,`MQTT_PROTOCOL=mqtt`,`PHOTOS_*`,`PHOTOS_URL_SECRET`,`USER_NAME`,`MODELS_CDN_URL`,`CORS_ORIGINS`) vs optional

## Verification Mapping (final)

- `pnpm build` accumulates shared→backend→web; `pnpm typecheck`, `pnpm lint`, `pnpm test:ci` green
- `docker compose up` reaches healthy; `curl` shows 200; `docker stop` drains
- Compose verify smoke: healthz + `/` + `/setup` 200, `/admin/*` 401