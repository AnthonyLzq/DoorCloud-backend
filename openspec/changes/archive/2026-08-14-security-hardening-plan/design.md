# Design: Security Hardening (SEC-01..SEC-14)

## Technical Approach

One change, six chained slices stacked to main, each an autonomous review unit (own commit, verify, rollback), dependency-ordered: deps first (unblock middleware/module changes), container/SSRF last. Posture: fail closed, minimal network surface, zero fetches in verify. Maps to proposal approach.

## Architecture Decisions

| Decision | Choice vs alternatives | Rationale |
|---|---|---|
| Dep upgrades | sharp ^0.35, static ^10, fastify/happy-dom patched, semver override vs keep-vuln | patched majors (SEC-01/02/10/12/13); integration tests at apply |
| Dead code | drop human, tfjs-node, src/lib/{human,index}.ts, allowBuilds/onlyBuiltDependencies vs keep | rg-verified zero imports; critical native chain |
| Fail-closed env | prod requires SETUP_TOKEN/WEB_AUTH_*; compose `${VAR:?}` vs dev-fallback | misconfig aborts before serving open (AUTH-1) |
| Constant-time compare | shared `safeEqual` in `middleware/auth.ts`; setup-auth adopts; invalid token 401 (was 403) vs two impls | AUTH-2/3; no length leak |
| Rate limiting | @fastify/rate-limit global, allowList `/healthz`, `/photos/*` vs per-route | covers /setup, /admin, upload (REQ-6); healthz + photo URLs exempt |
| Security headers | manual onSend hook: CSP img-src + PHOTOS_BASE_URL origin, nosniff, frame-ancestors 'none' vs helmet dep | zero new deps (REQ-7); CSP env-derived; SPA has no inline scripts |
| OPENWA_BASE_URL | allowlist-only: host must be loopback or in `OPENWA_ALLOWED_HOSTS` (default localhost); shared schema refine; HTTPS recommended for remote hosts (internal TLS deferred to T5.4) vs https-enforced | SECRET-1; dev `http://localhost:2785` stays; internal `http://openwa:2785` stays until T5.4 |
| Runtime secrets | gate disk writes on `NODE_ENV !== 'production'` in setup.ts + sync-api-key.mjs vs keep writing | SECRET-2; env_file authoritative; setup page works |
| MQTT surface | drop 1883/2785 ports; creds `${VAR:?}`; passwordfile gitignored; 8883 listener config-ready vs keep published | CD-13/CD-7; backend↔broker internal; firmware follow-up |
| Non-root container | `USER doorcloud` (1001) + chowns + entrypoint chown guard vs root | CD-11; healthcheck/SIGTERM preserved (exec PID 1) |
| Checksum pinning | sha256 of buffalo_s.zip verified pre-extract vs unverified | CD-12 supply chain |
| verify() disk read | `VerifyStoredPhoto { name, path }` via `resolvePath()`; readFile vs inject storage | SEC-14 kills SSRF; containment in storage |

## Slice Map (files / risk)

| # | Slice | Key files | Risk |
|---|---|---|---|
| 1 | Deps SEC-01/02/10/12/13 | root+backend+web package.json, pnpm-workspace.yaml, delete `src/lib/{human,index}.ts`, `docs/advisories.md` | sharp/static break → tests; lockfile tag |
| 2 | Auth fail-closed SEC-04/06 | `env.ts`, `middleware/{setup-auth,web-auth,auth}.ts`, docker-compose.yaml | bricks misconfig — intended |
| 3 | HTTP SEC-05/09 | `server.ts`, backend package.json (+@fastify/rate-limit) | CSP blocks images → img-src includes PHOTOS origin |
| 4 | Secrets SEC-07 | `env.ts`, shared schema, `whatsapp/setup.ts`, `sync-api-key.mjs`, compose | allowlist rejects host → compose sets OPENWA_ALLOWED_HOSTS |
| 5 | MQTT SEC-03 | docker-compose.yaml, `mosquitto.conf`, `run-integration-tests.sh` (single MOSQUITTO_PORT) | device firmware → follow-up doc |
| 6 | Container+SSRF SEC-08/11/14 | Dockerfile, entrypoint.sh, download-models.{sh,prod.ts}, face-recognition/index.ts, user.ts, tests | unreadable volumes → chown guard; contract touches 2 test files |

## Data Flow

    MQTT photo ──→ user.sendPhotoThroughWhatsapp()
                    ├─ listDirectories()+list() → {name, path} (resolvePath)
                    └─ verify(probe, refs) ── readFile(path) ──→ ONNX embed ──→ match?
                                                           (no fetch, no URL)

## Interfaces / Contracts

- `VerifyStoredPhoto { name: string; path: string }` (was `url`); `VERIFY_FETCH_TIMEOUT_MS` removed. Caller `user.ts` (only one); tests `face-recognition-service.test.ts` (fetchSpy→readFile mock), `user.test.ts` (url→path).
- New env `OPENWA_ALLOWED_HOSTS`; prod-required SETUP_TOKEN/WEB_AUTH_*; invalid setup token 403→401.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | auth fail-closed, env refine, allowlist rule, write gating, 429, headers/CSP | extend vitest suites, RED first |
| Unit | verify zero-fetch under hostile PHOTOS_BASE_URL | mock readFile; assert no fetch stub called |
| Integration | mosquitto port consistency, sharp/static smoke | `test:mqtt` + `test:local` per slice |
| E2E | SPA under CSP loads cross-origin photo | Playwright (apps/web) |

## Threat Matrix

Git/PR rows N/A (no VCS/PR automation touched): docs-like paths, git repo selection, commit state, push state, PR commands. Shell/subprocess boundaries apply:

| Boundary | Design response | Planned RED tests |
|---|---|---|
| Subprocess (download) | sha256 pin pre-extract (CD-12) | mismatch fails, no extraction |
| Shell (entrypoint/compose) | `set -euo pipefail`; `${VAR:?}` | missing secret aborts; non-root boots |

## Migration / Rollout

No data migration. One revertible commit per slice (prior lockfile tagged); dev defaults unchanged; port exposure restored by re-adding mappings. Deferred: device firmware, TLS cutover timing, MQTT topic names, model config.

## Open Questions

- None blocking. 8883 listener needs cert provisioning path (volume + env) — resolve at slice 5; rate-limit max/window defaults to confirm with user.