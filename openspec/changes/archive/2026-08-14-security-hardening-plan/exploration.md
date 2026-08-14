# Exploration: Security Hardening Plan (SEC-01..SEC-14)

Status: explored against live code + pnpm-lock.yaml. All findings below were
verified by reading source; dependency versions come from apps/*/package.json
and pnpm-lock.yaml (pnpm 10.30.1 lockfile).

## Current State

DoorCloud backend is a Fastify 5 + MQTT service with an ONNX face-verification
pipeline, OpenWA WhatsApp integration, and a Monorepo (apps/backend, apps/web,
packages/shared) built through turbo. Production runs from a Dockerfile
(deploy: Coolify) with docker-compose.yaml. Audit SEC-01..SEC-14 findings map
cleanly onto: dependency hygiene, auth policy, HTTP hardening, secret
persistence, MQTT/network surface, container/supply-chain, and the
verify() fetch path.

### Verified dependency facts (lockfile-resolved)

| Pkg | Declared | Resolved | Finding | Notes |
|-----|----------|----------|---------|-------|
| sharp | ^0.33.0 | 0.33.5 | SEC-01 | libvips 1.0.4; used in onnx-provider.ts (`sharp().raw().resize().toBuffer({resolveWithObject:true})` — stable API) |
| @fastify/static | ^8.3.0 | 8.3.0 | SEC-02 | used root/prefix/wildcard + `reply.sendFile(f, webDist)` in server.ts |
| @tensorflow/tfjs-node | 4.10.0 exact | 4.10.0 | SEC-10 | DEAD: zero imports in apps/backend/src or scripts. Pulls node-pre-gyp@1.0.9, tar@4.4.19 (its own dep), adm-zip@0.5.18, and needs `allowBuilds` in pnpm-workspace.yaml |
| @vladmandic/human | ^3.0.3 | 3.3.6 | SEC-10 | DEAD: only imported by unused src/lib/human/index.ts; no consumer anywhere |
| mqtt | ^5.15.2 | 5.15.2 | SEC-13 | -> socks@2.8.9 -> ip-address@10.2.0 (advisory, no patched upstream yet) |
| onnxruntime-node | ^1.17.0 | 1.27.0 | - | already at 1.27.0; still depends on adm-zip@0.5.18 (SEC-13 low, cannot remove) |
| fastify | ^5.10.0 | (lock: find-my-way 9.6.0, fast-uri 3.1.3/4.1.0) | SEC-13 | HTTP2 DDoS + host confusion; fix via fastify minor bump + transitive upgrades |
| happy-dom | ^18.0.1 | 18.0.1 | SEC-12 | dev-only in apps/web |
| nodemon (dev) | ^2.0.20 | -> simple-update-notifier -> semver 7.0.0 | SEC-13 | ReDoS is dev-only; fix via pnpm override semver>=7.5.2 or nodemon upgrade |
| brace-expansion | - | 1.1.16 (via minimatch@3) | SEC-13 | tooling-only, low |

### Auth touchpoints (SEC-04, SEC-06)

- `src/network/http/middleware/setup-auth.ts` — Bearer SETUP_TOKEN; fail-open
  when unset (`if (!SETUP_TOKEN) return`); plain `token !== SETUP_TOKEN`
  comparison (SEC-06, not constant-time).
- `src/network/http/middleware/web-auth.ts` — Basic auth; fail-open when
  WEB_AUTH_USER/PASS unset; already constant-time (sha256 + timingSafeEqual);
  exempts /healthz and /photos/*.
- `src/config/env.ts` — SETUP_TOKEN/WEB_AUTH_* are `optionalString` (SEC-04).
  Only guard today: CORS_ORIGINS required in production.
- `docker-compose.yaml` — `SETUP_TOKEN: ${SETUP_TOKEN:-}` and
  WEB_AUTH_* `${VAR:-}` fall back to empty in prod; deploy with unset vars
  silently ships open access.
- `src/network/server.ts` — global `preHandler: webAuthMiddleware` registered
  after applyRoutes; covers /api/*, /setup/*, /admin/* and the SPA; /healthz
  and /photos/* exempted inside the middleware.

### MQTT / network surface (SEC-03)

- docker-compose publishes **1883:1883** (mosquitto plaintext) and
  **2785:2785** (openwa) to the host. Face photos (PII) transit plaintext
  MQTT reachable from the host LAN.
- `infra/mosquitto/mosquitto.conf` — `allow_anonymous false`, single plaintext
  listener 1883, `user mosquitto`; `password-generator.sh` creates creds from
  env with default fallbacks (doorcloud-backend-local / doorcloud-device-local).
- `infra/mosquitto/passwordfile` is COMMITTED (generated artifact with hashes
  of the default creds) — hygiene: gitignore + regenerate at deploy.
- Backend client (`src/network/mqtt/mqtt.ts`) is TLS-ready: env.ts defaults
  MQTT_PROTOCOL=mqtts; compose overrides to mqtt.
- Device CLI `scripts/photo-send.ts` defaults plaintext + device-default creds.
- `scripts/mosquitto/run-integration-tests.sh` runs the compose broker on
  plaintext 127.0.0.1 (hardcoded `1883:1883` vs script default MOSQUITTO_PORT
  1884 — pre-existing inconsistency; integration tests must keep working
  through this change).

### Secret persistence (SEC-07)

- `src/integrations/whatsapp/setup.ts` — `saveOpenWaSetupConfig` writes
  OPENWA_API_KEY/OPENWA_BASE_URL/OPENWA_CHAT_ID/OPENWA_SESSION_ID to
  `apps/backend/.env` via writeFileSync (path from `config/paths.ts`
  getEnvFilePath). In containers .env is on the ephemeral writable layer (lost
  on recreate) but is still a leak vector; locally it persists for real.
- `packages/shared/src/setup.ts` — openWaSetupConfigSchema accepts any
  `.url()` for OPENWA_BASE_URL (no https requirement, no allowlist).
- Exfil chain: unset SETUP_TOKEN (SEC-04) + unrestricted base URL + API key
  stored there = attacker controls where X-API-Key is sent.

### Container + supply chain (SEC-08, SEC-11)

- Dockerfile: no USER directive (root). Non-root feasible: bind ports >1024,
  healthcheck uses node fetch, SIGTERM works non-root; needs chown of
  /data/photos, /data/state, /app/apps/backend/models (entrypoint downloads
  models on first boot — `scripts/entrypoint.sh`).
- `scripts/download-models.prod.ts` — fetches buffalo_s.zip (GitHub release
  v0.7) with NO checksum verification (SEC-11). Same for download-models.sh.
  Pin sha256 of the zip in the script; verify before unzip.

### HTTP hardening (SEC-05, SEC-09)

- No rate limiting anywhere (no @fastify/rate-limit dep). Multipart limits
  exist (3/3 global, 20 files/20MB admin) but no request-rate protection on
  /setup/*, /admin/*, /api/user/upload.
- No security headers. Built SPA (apps/web/dist/index.html) has NO inline
  scripts (single external module + css) -> strict CSP viable; img-src must
  include PHOTOS_BASE_URL origin (signed URLs may be cross-origin).

### verify() SSRF (SEC-14)

- `src/services/face-recognition/index.ts` verify() fetches each reference
  `photo.url` over HTTP with 10s timeout; URLs are signed from
  PHOTOS_BASE_URL (`storage/photos.ts` getUrl). Misconfigured
  PHOTOS_BASE_URL -> server-side fetch to attacker host while processing a
  door photo. Photos are local in PHOTOS_DIR (reference list built in
  `src/services/user.ts`) — cleanest fix is reading from disk instead of HTTP.

## Affected Areas

- `apps/backend/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` — SEC-01/02/10/12/13 (upgrades + dead-code removal + allowBuilds cleanup)
- `apps/web/package.json` — SEC-12 (happy-dom)
- `src/network/http/middleware/setup-auth.ts` — SEC-04/06 (fail-closed + constant-time)
- `src/network/http/middleware/web-auth.ts` — SEC-04 (fail-closed)
- `src/config/env.ts` — SEC-04 (prod-required secrets), SEC-07 (base URL constraints)
- `src/network/server.ts` — SEC-05/09 (rate limit + headers registration)
- `src/network/http/routes/{setup,admin-photos,user}.ts` — SEC-05 (per-route limits)
- `src/integrations/whatsapp/setup.ts`, `packages/shared/src/setup.ts` — SEC-07 (constrain URL, gate .env writes)
- `docker-compose.yaml`, `infra/mosquitto/*`, `scripts/mosquitto/*` — SEC-03 (ports/creds/plaintext; test wiring)
- `Dockerfile`, `scripts/entrypoint.sh`, `scripts/download-models.prod.ts` — SEC-08/11 (non-root, checksums)
- `src/services/face-recognition/index.ts`, `src/services/user.ts` — SEC-14 (disk reads)
- `apps/backend/.env.example`, `.gitignore` (infra/mosquitto/passwordfile) — docs/hygiene

## Approaches

1. **Full fix in one change, grouped into chained work units** — proposal/spec/
   design one change "security-hardening-plan", tasks split into 6 deliverable
   slices (deps, auth, http, secrets, mqtt/network, container+ssrf). Business
   traceability in one SDD change; reviewers get small PRs.
   - Pros: one SDD lifecycle, coherent story, PRs reviewable slice-by-slice
   - Cons: large change surface; slices must be sequenced (deps first to unblock audits)
   - Effort: High (large) — needs chained PRs (400-line budget)

2. **Split into 3 independent SDD changes** (Runtime deps / HTTP+auth+secrets /
   Infra container+MQTT) — separate spec/design/tasks/verify per change.
   - Pros: independent delivery, smaller blast radius each
   - Cons: three orchestrations, overlapping touchpoints (env.ts, server.ts, compose), risk of conflicting edits
   - Effort: Medium per change

3. **Patch-now (deps + fail-closed auth) + follow-up backlog** — ship only the
   high-severity/low-risk fixes; defer TLS, non-root, rate limiting, SSRF.
   - Pros: fastest to close SEC-01/02/04/06/10/12
   - Cons: leaves exposure open (SEC-03/05/07/08/09/11/14); audit not "resolved"
   - Effort: Low

## Recommendation

Approach 1: one SDD change (openchange `security-hardening-plan`, folder
`openspec/changes/security-hardening-plan`) with implementation sliced into
chained reviewable PRs. Rationale: the audit is the single source of truth;
findings share touchpoints (env.ts, server.ts, compose, package.json) so
splitting into independent changes creates merge conflicts; chained slices
keep reviews within the 400-line budget. Suggested slice order:

1. Runtime dependency hardening (SEC-01, 02, 10, 12, 13) — sharp 0.35.x,
   @fastify/static >=10.1.2, remove tfjs-node + human + allowBuilds entry,
   happy-dom bump, fastify minor bump, semver override; adjudicate
   ip-address/adm-zip (no patched upstream; document low reachability).
2. Auth fail-closed + constant-time (SEC-04, 06) — production-required
   SETUP_TOKEN/WEB_AUTH_* in env.ts (like CORS_ORIGINS guard), compose
   `${VAR:?}` for secrets, timingSafeEqual in setup-auth.ts; dev untouched.
3. HTTP hardening (SEC-05, 09) — @fastify/rate-limit on /setup/*, /admin/*,
   /api/user/upload; security headers (CSP with img-src PHOTOS_BASE_URL,
   nosniff, frame-ancestors 'none'); docs.
4. Secret + /setup/config (SEC-07) — https-only OPENWA_BASE_URL schema
   (+ optional host allowlist), gate .env persistence in production
   (compose/env is authoritative in prod); keep dev flow.
5. MQTT/network surface (SEC-03) — stop publishing 1883/2785 to host
   (internal compose network only), require non-default MQTT creds in prod
   compose (`${MQTT_PASS:?}`), fix test port inconsistency, gitignore
   infra/mosquitto/passwordfile; TLS listener (8883 + CAs) as explicit
   follow-up phase (device-side impact).
6. Container + supply chain + SSRF (SEC-08, 11, 14) — non-root USER with
   volume chowns, checksum-pinned model download, verify() reads reference
   photos from disk instead of HTTP fetch.

## Risks

- sharp 0.33 -> 0.35 native binaries: verify onnx-provider integration tests +
  Docker glibc image; API used is stable (low-medium).
- @fastify/static v8 -> v10 major: usage is minimal but API changes must be
  checked against release notes at apply time.
- Removing tfjs-node/human: confirm nothing in scripts (benchmark/embed)
  imports them (verified: none). Removes tar critical chain.
- Fail-closed auth can brick a deployed instance whose Coolify env lacks
  SETUP_TOKEN/WEB_AUTH_* -> compose must require them with `:?` so deploy
  fails fast instead of serving open.
- MQTT port exposure removal may break the physical device if it connects to a
  published port; device firmware is out of repo — document and sequence.
- verify() disk-read refactor changes the VerifyStoredPhoto contract used by
  tests (test/index.test.ts mocks the HTTP fetch) — update mocks.
- Strict CSP could break the SPA if future inline scripts are added; img-src
  must include the PHOTOS_BASE_URL origin.

## Ready for Proposal

Yes. Orchestrator should tell the user: exploration confirmed all 14 findings
against code + lockfile; recommended one SDD change with 6 chained PR slices;
proposal can reuse the grouping above. Change folder:
openspec/changes/security-hardening-plan.