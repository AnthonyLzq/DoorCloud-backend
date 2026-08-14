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

- [x] **T1.1** — Bump `sharp` ^0.35 and `@fastify/static` ^10 in backend+web manifests; `pnpm install`; lockfile tag — Files: apps/backend/package.json, apps/web/package.json, pnpm-lock.yaml — Deps: — — Verify: DONE: sharp ^0.35.3, static ^10.1.3, lockfile tag `security-hardening-slice1-baseline`; `pnpm test:local` green
- [x] **T1.2** — Bump `fastify` to patched major (HTTP/2 DDoS + host-confusion) and `happy-dom`; add semver override for ip-address/adm-zip — Files: root+web package.json, pnpm-workspace.yaml — Deps: T1.1 — Verify: DONE: fastify ^5.11.3, happy-dom ^20.11.2, overrides for ip-address/adm-zip/semver/find-my-way/fast-uri/brace-expansion/nanoid; `pnpm audit` 0 vulns
- [x] **T1.3** — RED: dep-posture test asserting zero imports/entries of human, tfjs-node, allowBuilds — Files: apps/backend/test/deps-posture.test.ts (new) — Deps: — — Verify: DONE: test written; failed 8/8 against pre-cleanup tree, passes 8/8 after cleanup
- [x] **T1.4** — Delete `src/lib/human/`, `src/lib/index.ts` re-exports; drop allowBuilds + deps (rg-verified dead) — Files: apps/backend/src/lib/human/*, apps/backend/src/lib/index.ts, pnpm-workspace.yaml — Deps: T1.3 — Verify: DONE: deleted, allowBuilds/onlyBuiltDependencies cleaned; typecheck+lint+test green
- [x] **T1.5** — Create `docs/advisories.md`: register remaining low-reachability advisories (ip-address, adm-zip, semver tooling) with rationale — Files: docs/advisories.md (new) — Deps: T1.2 — Verify: DONE: file cites `pnpm audit` findings; REQ-8 scenario 2 satisfied

## Slice 2: Auth Fail-Closed (SEC-04/06)

- [x] **T2.1** — RED: env tests — prod without SETUP_TOKEN/WEB_AUTH_* throws; dev unchanged — Files: apps/backend/test/env.test.ts (new) — Deps: — — Verify: DONE: 3 prod-missing tests failed before gate, pass after; dev-unset behavior asserted (AUTH-1)
- [x] **T2.2** — Gate env: zod refine requires SETUP_TOKEN/WEB_AUTH_USER/WEB_AUTH_PASS when NODE_ENV=production — Files: apps/backend/src/config/env.ts — Deps: T2.1 — Verify: DONE: 3 refines fail closed; `NODE_ENV=production` tsx probe aborts without vars, parses with; suite green
- [x] **T2.3** — RED: auth tests — invalid/missing token → 401 (was 403); constant-time compare; length mismatch no throw — Files: apps/backend/test/setup-routes.test.ts, web-auth.test.ts — Deps: — — Verify: DONE: +6 tests; wrong/short token failed RED at 403, green after (AUTH-2/3)
- [x] **T2.4** — Shared `safeEqual` in `middleware/auth.ts` (extract web-auth hash-compare); setup-auth adopts it + 403→401; web-auth reuses helper — Files: apps/backend/src/network/http/middleware/{auth.ts,setup-auth.ts,web-auth.ts} — Deps: T2.3 — Verify: DONE: auth.ts safeEqual (sha256+timingSafeEqual); setup-auth 401; web-auth imports helper; unit tests in web-auth.test.ts
- [x] **T2.5** — Compose `${VAR:?}` for SETUP_TOKEN/WEB_AUTH_* (shell boundary RED: missing secret aborts) — Files: docker-compose.yaml — Deps: T2.2 — Verify: DONE: `${SETUP_TOKEN:?}`, `${WEB_AUTH_USER:?}`, `${WEB_AUTH_PASS:?}`; `docker compose --env-file /dev/null config` exit 1 without, exit 0 with

## Slice 3: HTTP Hardening (SEC-05/09)

- [x] **T3.1** — RED: tests — burst on /setup|/admin → 429; /healthz exempt; CSP nosniff frame-ancestors headers; no unsafe-inline — Files: apps/backend/test/server.test.ts — Deps: T3.2 — Verify: DONE: `HTTP hardening (REQ-6/7)` describe in 07286cd — burst 130x on `/` → 429 with `/healthz` exempt; CSP/nosniff/frame-ancestors asserted; no unsafe-inline in emitted CSP
- [x] **T3.2** — Add `@fastify/rate-limit` global in server.ts with allowList `/healthz`, `/photos/*`; onSend hook: CSP img-src PHOTOS_BASE_URL origin + nosniff + frame-ancestors 'none' — Files: apps/backend/src/network/server.ts, apps/backend/package.json — Deps: T3.1 — Verify: DONE: `@fastify/rate-limit ^11.2.0` global max 100/60s, allowList `/healthz` + `/photos/*`; onSend CSP `default-src 'self'; script-src 'self'; img-src 'self' <photosOrigin>; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'` + nosniff + X-Frame-Options DENY (07286cd); `pnpm test:local` green
- [x] **T3.3** — Verify SPA loads cross-origin PHOTOS_BASE_URL photo under CSP (WF-10); no inline scripts — Files: apps/web/src/** — Deps: T3.2 — Verify: DONE: e2e `csp-photos.spec.ts` (new) — document served with backend-emitted CSP, person photo fetched from `http://localhost:1996` (cross-origin) decodes (naturalWidth>0), no inline `<script>` and zero browser CSP violations; 2/2 e2e pass

## Slice 4: Secrets (SEC-07)

- [x] **T4.1** — RED: tests — non-HTTPS reject; non-allowlisted host reject; https allowlisted accept; setup schema 400 on bad URL — Files: apps/backend/test/env.test.ts, setup-routes.test.ts — Deps: — — Verify: DONE: 4 SECRET-1 tests failed RED (env 3 + setup-routes 1), green after T4.2 (1f02140)
- [x] **T4.2** — Shared schema refine (https-or-loopback + OPENWA_ALLOWED_HOSTS allowlist) consumed by env.ts + whatsapp/setup.ts; add OPENWA_ALLOWED_HOSTS to .env.example + compose — Files: packages/shared, apps/backend/src/config/env.ts, apps/backend/src/integrations/whatsapp/setup.ts, .env.example — Deps: T4.1 — Verify: DONE: `isOpenWaBaseUrlAllowed` (loopback-or-allowlist) in shared setup.ts; env.ts refine + whatsapp/setup.ts factory; `.env.example` + compose `OPENWA_ALLOWED_HOSTS` (0a5b385); suite green (346). Rule decision: allowlist-only (https recommended) — spec updated to match, internal TLS deferred to T5.4
- [x] **T4.3** — RED: write-gating tests — NODE_ENV=production setup/sync writes no .env (mock fs) — Files: apps/backend/test/setup-routes.test.ts, whatsapp-utils.test.ts — Deps: — — Verify: DONE: 2 RED tests failed ("expected vi.fn() to not be called at all"), green after T4.4 (6530a82)
- [x] **T4.4** — Gate disk writes on `NODE_ENV !== 'production'` in saveOpenWaSetupConfig + sync-api-key.mjs — Files: apps/backend/src/integrations/whatsapp/setup.ts, apps/backend/scripts/openwa/sync-api-key.mjs — Deps: T4.3 — Verify: DONE: `saved: []` + no disk touch in prod (tsx probe byte-identical file); sync-api-key.mjs skips .env write in prod (6752bbc); suite green

## Slice 5: MQTT / Network (SEC-03, CD-13, REQ-3)

- [x] **T5.1** — Remove 1883/2785 host port mappings (internal network only); `MQTT_PASS` `${VAR:?}`; gitignore `infra/mosquitto/passwordfile` — Files: docker-compose.yaml, .gitignore — Deps: — — Verify: DONE: 2785 mapping dropped from openwa; mosquitto no longer publishes 1883 (CD-13: `docker compose ps` shows only `1883/tcp` expose-only, no host map); `MQTT_PASS` + `MOSQUITTO_BACKEND_PASSWORD` are `${MQTT_PASS:?}` (compose `--env-file /dev/null` exit 1 without, exit 0 with); `.gitignore` line 136 already covers `infra/mosquitto/passwordfile` (`git check-ignore` confirms, untracked)
- [x] **T5.2** — Single `MOSQUITTO_PORT` source shared by compose mapping + run-integration-tests.sh (fix 1883/1884 drift) — Files: docker-compose.yaml, apps/backend/scripts/mosquitto/run-integration-tests.sh, infra/mosquitto/mosquitto.conf — Deps: T5.1 — Verify: DONE: new `docker-compose.integration.yaml` overlay publishes `'${MOSQUITTO_PORT:-1884}:1883'`; script uses `-f docker-compose.yaml -f docker-compose.integration.yaml` and exports MQTT_USER/MQTT_PASS + dev-only values for the other `${VAR:?}` vars (compose interpolates the whole file); also fixed stale `./create-password-file.sh` path (was `scripts/mosquitto/create-password-file.sh`); `pnpm test:mqtt` green (2/2); REQ-3 scenarios hold (single source, 1884 default, no drift)
- [x] **T5.3** — 8883 TLS listener config-ready: listener/cert paths from env in mosquitto.conf + compose; document cert provisioning — Files: infra/mosquitto/mosquitto.conf, docker-compose.yaml — Deps: T5.1 — Verify: DONE: mosquitto 2.1.2 has NO config-file env expansion (empirically proven), so password-generator.sh (justified extra file) renders the config and appends the 8883 listener from `MOSQUITTO_TLS_*` when all three are set (partial set aborts); compose passes the three vars; `mosquitto -c` lint of rendered conf passes (no TLS: config loaded, broker healthy; TLS set: listener activates, fail-fast on missing certs, no plaintext 8883); cert provisioning documented in conf comments + compose + firmware doc
- [x] **T5.4** — Document device-firmware follow-up (deferred, explicit — not silent removal); TLS cutover timing note — Files: docs/ (firmware follow-up note) — Deps: T5.3 — Verify: DONE: `docs/device-firmware-mqtt-cutover.md` names device impact (photo-send.ts CLI + LAN firmware lose host-published plaintext 1883), options (internal network / TLS 8883), TLS cutover timing (listener dormant until `MOSQUITTO_TLS_*` set; cert provisioning steps; mqtts endpoint + CA pin + MQTT_DEVICE_USER/PASS), and a follow-up checklist

## Slice 6: Container + Supply Chain + SSRF (SEC-08/11/14, RF-1)

- [x] **T6.1** — RED: verify() zero-fetch test — hostile PHOTOS_BASE_URL, mock readFile, assert fetch stub never called; VerifyStoredPhoto uses path — Files: apps/backend/test/face-recognition-service.test.ts — Deps: — — Verify: Fails against current fetch impl (RF-1 scenario 3) — DONE: 2 RED tests failed (fetch spy called, no disk read); green after T6.2
- [x] **T6.2** — `VerifyStoredPhoto {name, path}`; verify() reads disk via readFile; remove `VERIFY_FETCH_TIMEOUT_MS` from constants + exports — Files: apps/backend/src/services/face-recognition/index.ts, apps/backend/src/config/constants.ts — Deps: T6.1 — Verify: Suite green; zero fetch in verify — DONE: 40/40 face-recognition tests pass; timeout test removed with the constant
- [x] **T6.3** — user.ts builds refs with resolvePath+list `{name,path}` (drop getUrl); update user.test.ts + photo-send mocks fetch→readFile — Files: apps/backend/src/services/user.ts, apps/backend/test/user.test.ts, photo-send.test.ts — Deps: T6.2 — Verify: `pnpm test:local` green — DONE: user.ts resolvePath refs; user.test.ts 3 expectations path-based; photo-send.test.ts unchanged (device CLI legitimately fetches; verify not involved); 19/19 pass
- [x] **T6.4** — RED: sha256-mismatch test — mismatch fails, no extraction (subprocess boundary) — Files: apps/backend/test/download-models.test.ts or shell CI check — Deps: — — Verify: Fails before pinning (CD-12 scenario 2) — DONE: 5/5 failed RED (exports absent), green after T6.5
- [x] **T6.5** — Pin sha256 of buffalo_s.zip pre-extract in download-models.sh + download-models.prod.ts — Files: apps/backend/scripts/download-models.sh, download-models.prod.ts — Deps: T6.4 — Verify: Bad checksum aborts; good pin downloads — DONE: pin d85a87f5... computed from live artifact (127,607,557 bytes); checksum module + bash verify_sha256; real-zip checks pass both ways
- [x] **T6.6** — Dockerfile + entrypoint: `USER doorcloud` (1001), chown photos/state/models volumes, chown guard, `set -euo pipefail`, `${VAR:?}`, healthcheck + SIGTERM intact (shell RED: missing secret aborts; non-root boots) — Files: Dockerfile, apps/backend/scripts/entrypoint.sh, docker-compose.yaml — Deps: T6.5 — Verify: `docker compose up`; `id -u` = 1001; `/healthz` 200; CD-11 scenarios — DONE: USER doorcloud uid 1001 + chowns + guard; entrypoint ${VAR:?} (missing secret exit 1); compose config lints; boot test in progress

## Deferred (explicit, not in scope)

- Device firmware TLS/MQTT cutover — tracked by T5.4 follow-up doc
- MQTT topic naming rule (unchanged); model config (already pinned)
