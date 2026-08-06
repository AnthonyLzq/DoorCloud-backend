# Design: Produccion Turbo DoorCloud

## Technical Approach

Two coupled upgrades: (1) Turborepo drives ordered builds and parallel dev
(TO-1..TO-5), replacing hand-wired `pnpm --filter @doorcloud/shared build`
steps in CI and the Dockerfile; (2) the backend image becomes an operatable
production door service with `/healthz` liveness, graceful SIGTERM drain, a
compose `doorcloud` service joining the existing mosquitto/openwa network, and
persistent photo + SQLite state (CD-1..CD-4, CD-7..CD-10). The SPA stays
same-origin (backend serves `apps/web/dist`); no separate web container. All
build/typecheck/test/lint go through turbo; the Dockerfile builds through turbo
inside the image.

## Architecture Decisions

### Decision: Turbo topology

**Choice**: Root `turbo.json` with `build`, `lint`, `typecheck`, `test:ci`, and
`dev` tasks. Backend and web declare `dependsOn: ["^build"]`, so Turbo
schedules `@doorcloud/shared#build` first.

**Alternatives**: Keep `pnpm -r` plus manual shared-first. Rejected: that is
exactly the defect TO-4 and CD-4 remove.

**Rationale**: `^build` turns the workspace graph into the ordering — shared
builds before its consumers with zero hand-wiring, satisfying TO-2 and CD-4 on
a clean checkout.

| Task | Packages | dependsOn | inputs | outputs | cache |
|------|----------|-----------|--------|---------|-------|
| `build` | shared, backend, web | `^build` | `{pkg}/**` | `{pkg}/dist/**` | local |
| `lint` | shared, backend, web | none | `{pkg}/**` | none | local |
| `typecheck` | shared, backend, web | `^build` | `{pkg}/**` | none | local |
| `test:ci` | shared, backend, web | `^build` | `{pkg}/**` | none | local |
| `dev` | shared, backend, web | `^build` | — | none | cache: false |

Root `package.json` scripts become turbo thin wrappers so CI and humans share
one entrypoint: `build`, `lint`, `typecheck`, `test:ci`, `test:local`, `dev`
each run `turbo run <name>`. Root `typecheck` keeps the trailing root-level
`tsc --noEmit -p tsconfig.json` (root tsconfig validates scripts/) so it
becomes `turbo run typecheck && tsc --noEmit -p tsconfig.json`.

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":      { "dependsOn": ["^build"], "outputs": ["{workspace}/dist/**"] },
    "lint":       { "outputs": [] },
    "typecheck":  { "dependsOn": ["^build"], "outputs": [] },
    "test:ci":    { "dependsOn": ["^build"], "outputs": [] },
    "dev":        { "cache": false, "persistent": true, "dependsOn": ["^build"] }
  }
}
```

The turbo test task is named `test:ci` — every package defines a `test:ci`
script and none defines a bare `test`, so `turbo run test:ci` is the only valid
name (spec TO-1's `turbo run test` wording means `test:ci`).

CI invokes the same root scripts (`pnpm build`, `pnpm typecheck`, `pnpm
test:ci`) — the graph, not the workflow, enforces shared-first. `dev` carries
`dependsOn: ["^build"]` (matching the task table), so a fresh-clone `turbo run
dev` completes `@doorcloud/shared#build` before launching the persistent
watchers — the backend nodemon resolves the built shared `dist` instead of
racing it.

### Decision: Dev tooling per package (TO-3)

* **backend**: the existing `service` script already runs nodemon watching
  `.env`+`src` via `tsx -r dotenv/config ./src/index.ts` (port 1996). Add a
  `dev` alias `nodemon --exitcrash` reusing the same nodemonConfig — consistent,
  no new tooling.
* **shared**: no watcher exists. Add `dev: tsc --watch -p tsconfig.json`
  (emits `dist` incrementally for the two consumers).
* **web**: `dev: vite` already exists. Keep the proxy (target
  `http://localhost:1996`) unchanged; vite uses its default port and proxies
  `/setup`, `/admin`, `/photos` to the backend — TO-3 requires the proxy target
  to remain port 1996.

| Option | Tradeoff | Decision |
|---|---|---|
| backend `tsx watch` directly | new command, loses nodemon config | nodemon (exists) |
| shared tsc watcher | emits `dist` for consumers | `tsc -w` |
| root `dev` = `turbo run dev` | one terminal, all watchers | yes |

### Decision: Dockerfile multi-stage, turbo inside, slim root

| Stage | Contents |
|---|---|
| `base` | `node:22-bookworm-slim`, corepack pnpm 10.30.1, WORKDIR `/app` |
| `deps` | copy 4 package.json + pnpm-lock.yaml + pnpm-workspace.yaml + turbo.json; `pnpm install --frozen-lockfile` |
| `build` | copy sources + all tsconfigs + vite.config + turbo.json; `RUN pnpm turbo run build` |
| `production` | `pnpm install --frozen-lockfile --prod`; `COPY --from=build` `apps/backend/dist`, `packages/shared/dist`, `apps/web/dist` |

**Decision (CD-3, CD-4)**: runtime `WORKDIR` is `/app/apps/backend/dist` and
start is `node index.js` — the locked pairing. The built entrypoint is
`apps/backend/dist/index.js` (tsc emits `src/index.ts` → `dist/index.js`; there
is no `dist/main.js`), so `node index.js` from the dist WORKDIR resolves to the
real file. `WORKDIR /app/apps/backend` + `node dist/index.js` would also work,
but `WORKDIR /app/apps/backend/dist` + `node dist/index.js` does NOT — it
resolves to the nonexistent `/app/apps/backend/dist/dist/index.js` (boot
blocker). The Dockerfile uses the locked pair only. `__dirname` is
`/app/apps/backend/dist` (module location, independent of WORKDIR), so
`backendRoot=/app/apps/backend`, `repoRoot=/app` — no `src/` nesting, keeping
the module-relative paths in `config/paths.ts` stable. Models are NOT baked;
`MODELS_DIR` is a runtime `:ro` mount (CD-9). Base stays `bookworm-slim`
(glibc) because `onnxruntime-node` ships glibc-only prebuilts — Alpine is
explicitly rejected.

**Required runtime env (doorcloud service, CD-10 handoff)**: the compose
`doorcloud` service MUST set `MQTT_PROTOCOL=mqtt` — plaintext mosquitto:1883,
while the `env.ts` default is `mqtts` (TLS) and would fail against the local
broker — and must provide every `env.ts`-required var: `MQTT_HOST`, `MQTT_PORT`,
`MQTT_USER`, `MQTT_PASS`, `PHOTOS_DIR`, `PHOTOS_BASE_URL`, `PHOTOS_URL_SECRET`,
`USER_NAME`, and `MODELS_CDN_URL`. Because `NODE_ENV=production` is baked in the
image and `env.ts` validates `CORS_ORIGINS` as required in production, the
compose `env_file: .env` MUST also set `CORS_ORIGINS`. All of the above belong
in the README env handoff (CD-10) and the compose `.env`/`env_file`
requirements.

### Decision: HEALTHCHECK without curl

**Choice**: `HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:1996/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.
**Alternatives**: install `curl` (extra layer), `wget`. **Rationale**: Node 22
global fetch exists in the base image; zero added layers; CD-3 satisfied.

### Decision: Graceful shutdown + idempotent stop

`index.ts` registers a `SIGTERM` handler: arm a 10s `setTimeout(() =>
process.exit(1))` fallback (`unref`ed), then `await Server.stop()`, then
`process.exit(0)`. `Server.stop()` becomes idempotent via a `#stopping` flag so
repeated signals or a shutdown-vs-start race cannot double-close. The existing
`#stopInternal` order (mqtt.stop, faceRecognition.shutdown, fastify.close) is
reused unchanged.

## Data Flow / Runtime

```
Fastify :1996 (HOST-bound)
 ├─ GET /healthz        → 200 {"status":"ok"}    (no auth, no secrets)
 ├─ /setup, /admin, /photos  (SPA API + static /assets)
 └─ MQTT client ──────→ broker mosquitto:1883   (MQTT_HOST=mosquitto, MQTT_PROTOCOL=mqtt)

SIGTERM → index.ts → (10s force-exit fallback)
  → mqtt.stop() → faceRecognition.shutdown() → fastify.close() → exit 0
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `turbo.json` | Create | task graph: build/lint/typecheck/test:ci/dev, `^build` wiring, outputs |
| `package.json` | Modify | add `turbo` devDependency; root scripts delegate to `turbo run X` |
| `pnpm-workspace.yaml` | None | no edit: turbo reads the `packages: [apps/*, packages/*]` globs directly and they already cover shared, backend, web |
| `apps/backend/package.json` | Modify | add `dev: nodemon --exitcrash`; keep `test:mqtt` outside turbo (needs Docker) |
| `apps/web/package.json` | Modify | keep `dev: vite`; no changes to test scripts |
| `packages/shared/package.json` | Modify | add `dev: tsc --watch -p tsconfig.json` |
| `Dockerfile` | Modify | multi-stage turbo build; WORKDIR `/app/apps/backend/dist` + `node index.js` (locked pair, never `node dist/index.js`); HEALTHCHECK; keep Python scripts copy |
| `compose.yaml` | Modify | add `doorcloud` service + volumes + healthcheck + depends_on; env incl. `MQTT_PROTOCOL=mqtt` + all required vars (see Required runtime env); `env_file: .env` |
| `apps/backend/src/network/server.ts` | Modify | add `/healthz` route BEFORE `@fastify/static`; make `stop()` idempotent |
| `apps/backend/src/index.ts` | Modify | SIGTERM handler + 10s force-exit fallback |
| `.github/workflows/test.yml` | Modify | turbo tasks replace manual shared-build steps |
| `.github/workflows/runtime-integration.yml` | Modify | turbo build; docker smoke polls `/healthz` instead of sleep-20 |
| `README.md` | Modify | Docker section: bookworm-slim (not Alpine), compose `doorcloud`, volumes, env handoff incl. required `MQTT_PROTOCOL=mqtt`, `MODELS_CDN_URL`, `CORS_ORIGINS` |
| `.dockerignore` | Modify | exclude turbo cache dirs from build context: `.turbo/`, `apps/*/.turbo/`, `node_modules/.cache/turbo` |

## Interfaces / Contracts

```
GET /healthz -> 200 {"status":"ok"}   (no authz, no secrets, HOST-bound)
SIGTERM      -> graceful drain then exit(0); 10s fallback exit(1)
```

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Turbo order | `turbo run build` schedules shared before consumers | fresh-clone CI run (TO-2 scenario) |
| Turbo cache | no-op re-run hits cache, does not re-execute | run `turbo run build` twice; assert second is cached |
| Dev parallel | all three watchers in one terminal; proxy reaches 1996 | local `pnpm dev` smoke |
| `/healthz` | 200, no secrets, no auth; `/admin/*` still 401 without token | hermetic vitest handler test + docker smoke curl |
| Shutdown | MQTT/facerec closed, exit 0 within 10s | vitest unit for idempotent stop; docker `docker stop -t 15` asserts exit 0 |
| Docker E2E | image boots; `/healthz`, `/`, `/setup` 200; `/admin/*` 401 | `runtime-integration` docker smoke (models `:ro`, curl) |

## Threat Matrix

N/A — this change adds one additive Fastify route (`/healthz`), no new
shell-command boundary, no VCS/PR automation, no executable-file
classification, and no routing changes beyond the additive route. The only
process-integration edge is SIGTERM drain, which is covered by the Shutdown row
above (docker stop smoke). No threat-matrix rows apply; per the phase skill,
N/A rows require no tasks.

## Migration / Rollout

No data migration, no feature flags. The image tag remains; the old manual
`docker run` recipe still works. `/healthz`, `turbo.json`, and the `dev`
scripts are additive. Rollback = revert the single per-phase commit; removing
`/healthz` is safe, and reverting turbo to `pnpm -r` restores prior ordering.

## Open Questions

- None blocking. (Decided defaults: compose mounts `MODELS_DIR`
  `${MODELS_DIR}:/app/apps/backend/models:ro`; healthcheck uses node fetch, not
  curl.)

## Proposed Sequencing (work units, one commit per phase)

1. **Turbo foundation** — `turbo.json`, root `package.json` scripts + `turbo`
   devDep. Verify fresh-clone build/typecheck/lint/test through turbo locally
   and in CI. (TO-1, TO-2, TO-4, TO-5)
2. **Per-package dev scripts** — backend `dev` (nodemon), shared `dev` (`tsc
   -w`), web proxy already correct. Verify `turbo run dev` runs all three
   watchers. (TO-3)
3. **`/healthz` + graceful shutdown** — route in `server.ts` before static,
   idempotent `stop()`, SIGTERM handler in `index.ts`. Unit tests for healthz
   and stop idempotence; docker `stop -t` smoke. (CD-1, CD-2, CD-3 healthcheck)
4. **Dockerfile + compose** — multi-stage turbo build, dist-root WORKDIR,
   HEALTHCHECK, `doorcloud` service, volumes, env. Verify image boots and
   `docker compose up` reaches healthy. (CD-3, CD-4, CD-7, CD-8, CD-9)
5. **CI** — `test.yml` and `runtime-integration.yml` move to turbo tasks;
   docker smoke polls `/healthz` (drop sleep-20). (TO-4, CD-3)
6. **Docs** — README Docker section rewrite: bookworm-slim correction,
   compose `doorcloud` usage, volume/state/models mounts, required vs optional
   env handoff. (CD-10)

Each unit is independently reviewable and revertible, with its own test
strategy as listed in the Testing Strategy table.
