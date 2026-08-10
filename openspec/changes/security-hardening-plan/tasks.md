# Tasks: Security Hardening (SEC-01..SEC-14)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1500-1900 total; per slice 120-450 |
| 400-line budget risk | High (overall); S1/S6 Medium, S3-S5 Low |
| Chained PRs recommended | Yes |
| Suggested split | 6 chained PRs stacked to main |
| Delivery strategy | exception-ok |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Deps: sharp/static/fastify bumps, dead-code removal, advisory register | PR 1 | `pnpm test:local && pnpm audit` | `pnpm dev` + photo upload smoke; `pnpm test:mqtt` for sharp path | Revert commit; prior lockfile kept as tag |
| 2 | Auth fail-closed: env gate + shared safeEqual + 401 | PR 2 | `pnpm test:local` | `NODE_ENV=production pnpm start` aborts without vars; `docker compose config` fails on missing var | Revert commit; dev defaults untouched |
| 3 | HTTP: rate-limit + security headers/CSP | PR 3 | `pnpm test:local` (server/rate-limit tests) | `curl -i /healthz` (no 429) + burst `/setup/*` (429) + header check | Revert commit |
| 4 | Secrets: OPENWA allowlist + prod write gating | PR 4 | `pnpm test:local` (env refine, setup routes) | Setup POST with `http://` URL → 400 | Revert commit |
| 5 | MQTT: ports un-published, single MOSQUITTO_PORT, 8883 ready | PR 5 | `pnpm test:mqtt` | `docker compose ps` (no 1883/2785 host maps); broker connects internally | Re-apply port mappings only |
| 6 | Container+SSRF: non-root, sha256 pins, verify() disk read | PR 6 | `pnpm test:local` (face-recognition, user) | `docker compose up`; `id -u` = 1001; bad-checksum download aborts | Revert commit; contract touches face-recognition/index.ts + 2 test files |

## Slice 1: Runtime Dependencies (SEC-01/02/10/12/13)

| ID | Task (objective) | Files | Deps | Verify / Done |
|----|-------------------|-------|------|---------------|
| [x] T1.1 | Bump `sharp` ^0.35 and `@fastify/static` ^10 in backend+web manifests; `pnpm install`; lockfile tag | apps/backend/package.json, apps/web/package.json, pnpm-lock.yaml | — | DONE: sharp ^0.35.3, static ^10.1.3, lockfile tag `security-hardening-slice1-baseline`; `pnpm test:local` green |
| [x] T1.2 | Bump `fastify` to patched major (HTTP/2 DDoS + host-confusion) and `happy-dom`; add semver override for ip-address/adm-zip | root+web package.json, pnpm-workspace.yaml | T1.1 | DONE: fastify ^5.11.3, happy-dom ^20.11.2, overrides for ip-address/adm-zip/semver/find-my-way/fast-uri/brace-expansion/nanoid; `pnpm audit` 0 vulns |
| [x] T1.3 | RED: dep-posture test asserting zero imports/entries of human, tfjs-node, allowBuilds | apps/backend/test/deps-posture.test.ts (new) | — | DONE: test written; failed 8/8 against pre-cleanup tree, passes 8/8 after cleanup |
| [x] T1.4 | Delete `src/lib/human/`, `src/lib/index.ts` re-exports; drop allowBuilds + deps (rg-verified dead) | apps/backend/src/lib/human/*, apps/backend/src/lib/index.ts, pnpm-workspace.yaml | T1.3 | DONE: deleted, allowBuilds/onlyBuiltDependencies cleaned; typecheck+lint+test green |
| [x] T1.5 | Create `docs/advisories.md`: register remaining low-reachability advisories (ip-address, adm-zip, semver tooling) with rationale | docs/advisories.md (new) | T1.2 | DONE: file cites `pnpm audit` findings; REQ-8 scenario 2 satisfied |

## Slice 2: Auth Fail-Closed (SEC-04/06)

| ID | Task (objective) | Files | Deps | Verify / Done |
|----|-------------------|-------|------|---------------|
| [x] T2.1 | RED: env tests — prod without SETUP_TOKEN/WEB_AUTH_* throws; dev unchanged | apps/backend/test/env.test.ts (new) | — | DONE: 3 prod-missing tests failed before gate, pass after; dev-unset behavior asserted (AUTH-1) |
| [x] T2.2 | Gate env: zod refine requires SETUP_TOKEN/WEB_AUTH_USER/WEB_AUTH_PASS when NODE_ENV=production | apps/backend/src/config/env.ts | T2.1 | DONE: 3 refines fail closed; `NODE_ENV=production` tsx probe aborts without vars, parses with; suite green |
| [x] T2.3 | RED: auth tests — invalid/missing token → 401 (was 403); constant-time compare; length mismatch no throw | apps/backend/test/setup-routes.test.ts, web-auth.test.ts | — | DONE: +6 tests; wrong/short token failed RED at 403, green after (AUTH-2/3) |
| [x] T2.4 | Shared `safeEqual` in `middleware/auth.ts` (extract web-auth hash-compare); setup-auth adopts it + 403→401; web-auth reuses helper | apps/backend/src/network/http/middleware/{auth.ts,setup-auth.ts,web-auth.ts} | T2.3 | DONE: auth.ts safeEqual (sha256+timingSafeEqual); setup-auth 401; web-auth imports helper; unit tests in web-auth.test.ts |
| [x] T2.5 | Compose `${VAR:?}` for SETUP_TOKEN/WEB_AUTH_* (shell boundary RED: missing secret aborts) | docker-compose.yaml | T2.2 | DONE: `${SETUP_TOKEN:?}`, `${WEB_AUTH_USER:?}`, `${WEB_AUTH_PASS:?}`; `docker compose --env-file /dev/null config` exit 1 without, exit 0 with |

## Slice 3: HTTP Hardening (SEC-05/09)

| ID | Task (objective) | Files | Deps | Verify / Done |
|----|-------------------|-------|------|---------------|
| T3.1 | RED: tests — burst on /setup|/admin → 429; /healthz exempt; CSP nosniff frame-ancestors headers; no unsafe-inline | apps/backend/test/server.test.ts | — | `pnpm test:local` fails (REQ-6/7) |
| T3.2 | Add `@fastify/rate-limit` global in server.ts with allowList `/healthz`, `/photos/*`; onSend hook: CSP img-src PHOTOS_BASE_URL origin + nosniff + frame-ancestors 'none' | apps/backend/src/network/server.ts, apps/backend/package.json | T3.1 | `pnpm test:local` green; curl header check |
| T3.3 | Verify SPA loads cross-origin PHOTOS_BASE_URL photo under CSP (WF-10); no inline scripts | apps/web/src/** | T3.2 | Playwright smoke or manual load; WF-10 scenarios |

## Slice 4: Secrets (SEC-07)

| ID | Task (objective) | Files | Deps | Verify / Done |
|----|-------------------|-------|------|---------------|
| T4.1 | RED: tests — non-HTTPS reject; non-allowlisted host reject; https allowlisted accept; setup schema 400 on bad URL | apps/backend/test/env.test.ts, setup-routes.test.ts | — | `pnpm test:local` fails (SECRET-1) |
| T4.2 | Shared schema refine (https-or-loopback + OPENWA_ALLOWED_HOSTS allowlist) consumed by env.ts + whatsapp/setup.ts; add OPENWA_ALLOWED_HOSTS to .env.example + compose | packages/shared, apps/backend/src/config/env.ts, apps/backend/src/integrations/whatsapp/setup.ts, .env.example | T4.1 | `pnpm test:local` green; SECRET-1 scenarios |
| T4.3 | RED: write-gating tests — NODE_ENV=production setup/sync writes no .env (mock fs) | apps/backend/test/setup-routes.test.ts, whatsapp-utils.test.ts | — | Fails before gating (SECRET-2) |
| T4.4 | Gate disk writes on `NODE_ENV !== 'production'` in saveOpenWaSetupConfig + sync-api-key.mjs | apps/backend/src/integrations/whatsapp/setup.ts, apps/backend/scripts/openwa/sync-api-key.mjs | T4.3 | Suite green; prod setup touches no disk |

## Slice 5: MQTT / Network (SEC-03, CD-13, REQ-3)

| ID | Task (objective) | Files | Deps | Verify / Done |
|----|-------------------|-------|------|---------------|
| T5.1 | Remove 1883/2785 host port mappings (internal network only); `MQTT_PASS` `${VAR:?}`; gitignore `infra/mosquitto/passwordfile` | docker-compose.yaml, .gitignore | — | `docker compose ps` no host maps; `git status` untracked passwordfile; CD-13 scenarios |
| T5.2 | Single `MOSQUITTO_PORT` source shared by compose mapping + run-integration-tests.sh (fix 1883/1884 drift) | docker-compose.yaml, apps/backend/scripts/mosquitto/run-integration-tests.sh, infra/mosquitto/mosquitto.conf | T5.1 | `pnpm test:mqtt` green; REQ-3 scenarios |
| T5.3 | 8883 TLS listener config-ready: listener/cert paths from env in mosquitto.conf + compose; document cert provisioning | infra/mosquitto/mosquitto.conf, docker-compose.yaml | T5.1 | `mosquitto -c mosquitto.conf` config lint passes |
| T5.4 | Document device-firmware follow-up (deferred, explicit — not silent removal); TLS cutover timing note | docs/ (firmware follow-up note) | T5.3 | Follow-up doc exists, names device impact |

## Slice 6: Container + Supply Chain + SSRF (SEC-08/11/14, RF-1)

| ID | Task (objective) | Files | Deps | Verify / Done |
|----|-------------------|-------|------|---------------|
| T6.1 | RED: verify() zero-fetch test — hostile PHOTOS_BASE_URL, mock readFile, assert fetch stub never called; VerifyStoredPhoto uses path | apps/backend/test/face-recognition-service.test.ts | — | Fails against current fetch impl (RF-1 scenario 3) |
| T6.2 | `VerifyStoredPhoto {name, path}`; verify() reads disk via readFile; remove `VERIFY_FETCH_TIMEOUT_MS` from constants + exports | apps/backend/src/services/face-recognition/index.ts, apps/backend/src/config/constants.ts | T6.1 | Suite green; zero fetch in verify |
| T6.3 | user.ts builds refs with resolvePath+list `{name,path}` (drop getUrl); update user.test.ts + photo-send mocks fetch→readFile | apps/backend/src/services/user.ts, apps/backend/test/user.test.ts, photo-send.test.ts | T6.2 | `pnpm test:local` green |
| T6.4 | RED: sha256-mismatch test — mismatch fails, no extraction (subprocess boundary) | apps/backend/test/download-models.test.ts or shell CI check | — | Fails before pinning (CD-12 scenario 2) |
| T6.5 | Pin sha256 of buffalo_s.zip pre-extract in download-models.sh + download-models.prod.ts | apps/backend/scripts/download-models.sh, download-models.prod.ts | T6.4 | Bad checksum aborts; good pin downloads |
| T6.6 | Dockerfile + entrypoint: `USER doorcloud` (1001), chown photos/state/models volumes, chown guard, `set -euo pipefail`, `${VAR:?}`, healthcheck + SIGTERM intact (shell RED: missing secret aborts; non-root boots) | Dockerfile, apps/backend/scripts/entrypoint.sh, docker-compose.yaml | T6.5 | `docker compose up`; `id -u` = 1001; `/healthz` 200; CD-11 scenarios |

## Deferred (explicit, not in scope)

- Device firmware TLS/MQTT cutover — tracked by T5.4 follow-up doc
- MQTT topic naming rule (unchanged); model config (already pinned)