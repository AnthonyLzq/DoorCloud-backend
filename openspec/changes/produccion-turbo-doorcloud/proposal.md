# Proposal: Produccion Turbo DoorCloud

## Intent

No build orchestration or deploy path exists: build order is hand-wired in CI/Dockerfile, compose.yaml only defines `openwa`+`mosquitto`, the Dockerfile lacks healthcheck/graceful shutdown, and the README Docker section is stale. Goal: Turborepo for ordered builds + parallel dev, and a dockerized deploy of backend + web (same-origin SPA) with health, shutdown, compose, docs.

## Scope

### In Scope
- **Turborepo**: add `turbo.json`; wire build/lint/typecheck/test/dev; `@doorcloud/shared` build as dep of backend/web; root scripts stay for CI; drop manual shared-first where turbo replaces.
- **Docker**: HEALTHCHECK + SIGTERM shutdown; lock dist root `/app/apps/backend/dist` (no `src/` nesting).
- **Compose**: `doorcloud` service joining openwa/mosquitto; `MQTT_HOST=mosquitto`; env_file; PHOTOS_DIR + STATE_DB_PATH volumes; models mount `:ro` at runtime; `restart: unless-stopped`; healthcheck `/healthz`.
- **Code**: `/healthz` liveness (HOST-bound, no auth, no sensitive data); SIGTERM shutdown in `Server`/`index.ts`.
- **Docs**: fix README Docker section (bookworm-slim not Alpine; state dir; door service; volumes; env handoff; run).

### Out of Scope
- Python/non-ONNX models in container (ONNX-only prod path)
- Separate web container/nginx/CDN (locked same-origin)
- Multi-instance scaling; model-download CI changes; cloud-specific deploy

## Capabilities

### New Capabilities
- `task-orchestration`: turbo graph (build/lint/typecheck/test/dev), shared-first, cache
- `container-deployment`: image healthcheck/shutdown, compose service, volumes/env handoff

### Modified Capabilities
- None (web same-origin already specced `web-front` WF-1)

## Approach

Locked Approach 1: full Turbo pipeline + single container (backend serves `apps/web/dist`). SPA already served by Fastify at `/`; separate web container adds risk for zero benefit.

## Affected Areas

- `turbo.json` (New): task graph
- `package.json`, `pnpm-workspace.yaml` (Mod): turbo dep, per-app tasks
- `Dockerfile` (Mod): HEALTHCHECK, dist-root, turbo build
- `compose.yaml` (Mod): `doorcloud` + volumes
- `src/index.ts`, `src/network/server.ts` (Mod): `/healthz`, SIGTERM
- `test.yml`, `runtime-integration.yml` (Mod): turbo replaces shared-first
- `README.md` (Mod): Docker section

## Risks

- Dist module-dir path coupling (D2): Med — lock root, verify paths in image
- No health endpoint exists: High — real `/healthz`, never fake on static
- README lag confuses ops: Med — fix in same change
- Dev ports/concurrency (Vite+backend): Med — per-app ports in `turbo run dev`
- Turbo outputs/dep semantics: Med — declare outputs, CI on fresh clone
- Runtime env path resolution in image: Med — env-overridable paths, smoke-test

## Rollback Plan

Revert single commit (one per phase). Change is additive; old image unchanged. `/healthz` removal is safe; shutdown absence restores hard-exit; revert turbo to `pnpm -r` restores ordering.

## Constraints

- pnpm 10.30.1, Node 22.20.0 (bookworm-slim/glibc — onnxruntime-node)

## Success Criteria

- [ ] `turbo run build` orders shared→backend→web from clean checkout
- [ ] `turbo run dev` runs backend+web+watcher in parallel
- [ ] `docker compose up` boots doorcloud; MQTT→mosquitto; SPA at `/`; photos persist
- [ ] `/healthz`→200; `docker stop` drains in grace period