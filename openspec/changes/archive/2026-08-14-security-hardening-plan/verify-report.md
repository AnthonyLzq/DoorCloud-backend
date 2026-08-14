```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:d3e5758c13947c635e6bc2f987b65633f1170d4058e18f4720c0e07c7e0b6dc1
verdict: fail
blockers: 0
critical_findings: 0
requirements: 14/18
scenarios: 45/49
test_command: pnpm --filter @doorcloud/backend exec vitest run --exclude "**/*.integration.test.ts" --exclude "**/dataset-loader.test.ts" --exclude "**/benchmark-runner.test.ts"
test_exit_code: 0
test_output_hash: sha256:ff1c928c41838f14bd9277e831519cdac34e6e6c5625d9e202cc0a89c13b1ab2
build_command: pnpm exec turbo run typecheck --force && pnpm exec tsc --noEmit -p tsconfig.json
build_exit_code: 0
build_output_hash: sha256:07586c405ed634f05668004ffd8311da9fec6f5c46f763b0b10d6bd4cacabb9a
```

# Verification Report: security-hardening-plan

## Executed Evidence & Verdict Summary

**Change**: security-hardening-plan
**Version**: delta specs (7 files), revision 0
**Mode**: Strict TDD (orchestrator authority; runner `pnpm test:local`)

## Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 27 |
| Tasks complete | 27 |
| Tasks incomplete | 0 |

All 27 tasks (T1.1-T6.6) are marked `[x]` in `tasks.md`. No pending task blocks full verification.

## Build & Tests Execution

**Build/typecheck**: ✅ PASS (fresh, non-cached)
```text
pnpm exec turbo run typecheck --force  -> Tasks: 4 successful, 4 total (0 cached, real exec)
pnpm exec tsc --noEmit -p tsconfig.json  -> exit 0 (root tsconfig)
```
(Plain `pnpm typecheck` earlier replayed turbo cache 4/4 exit 0; the `--force` run above executed freshly.)

**Lint**: ✅ PASS (fresh, non-cached)
```text
pnpm lint -> Tasks: 3 successful, 3 total (0 cached); backend 56 files checked, no fixes applied
1 pre-existing warning in apps/web/src/auth.ts:61 (useOptionalChain) — file last touched by 40cdbad (M4), not part of this change
```

**Tests**:
```text
Hermetic unit suite (== backend test:ci):
  pnpm --filter @doorcloud/backend exec vitest run --exclude "**/*.integration.test.ts"
    --exclude "**/dataset-loader.test.ts" --exclude "**/benchmark-runner.test.ts"
  Test Files 26 passed (26) | Tests 327 passed (327) | exit 0

Web unit:        43 passed (5 files) | Shared unit:  43 passed (3 files)
MQTT integration (full harness, compose overlay, MOSQUITTO_PORT default 1884):
  Test Files 1 passed (1) | Tests 2 passed (2) | exit 0
Web e2e (Playwright, local run): 2 passed (csp-photos.spec.ts + smoke.spec.ts) | exit 0
```

**Coverage**: ➖ Not available — no coverage tool configured in the change commands (`test:ci`/`test:local` run bare vitest). Per strict module this is informational, not a failure.

## Spec Compliance Matrix

Counts from the actual retrieved specs: 18 requirements, 49 scenarios.

### auth-fail-closed/spec.md (AUTH-1..3, 8 scenarios)

| Requirement | Scenario | Test / evidence | Result |
|---|---|---|---|
| AUTH-1 | Prod with all secrets boots | `test/env.test.ts > AUTH-1 > production boots when all auth vars are set` | ✅ COMPLIANT |
| AUTH-1 | Prod missing secret fails fast | `test/env.test.ts > production fails fast when SETUP_TOKEN/WEB_AUTH_USER/WEB_AUTH_PASS is missing` (3 tests; refines at src/config/env.ts:236-253) | ✅ COMPLIANT |
| AUTH-1 | Compose substitution fails fast | `docker-compose.yaml:55-59` `${SETUP_TOKEN:?}/${WEB_AUTH_USER:?}/${WEB_AUTH_PASS:?}`; live `docker compose --env-file /dev/null config` exit 1 | ✅ COMPLIANT |
| AUTH-1 | Dev unchanged | `test/env.test.ts > dev keeps working with auth vars unset` + `explicit development env keeps working` | ✅ COMPLIANT |
| AUTH-2 | Unset secret rejects | AUTH-1 startup gate guarantees the case (env.ts:236-253) + `test/setup-routes.test.ts > setupAuthMiddleware > rejects a request without Authorization as 401` | ✅ COMPLIANT |
| AUTH-2 | Wrong token rejects | `test/setup-routes.test.ts > rejects a wrong token as 401 (not 403)` (setup-auth.ts:34-40 safeEqual + 401) | ✅ COMPLIANT |
| AUTH-3 | Constant-time equality used | `test/web-auth.test.ts > safeEqual (AUTH-3) > returns true/false equal-length`; src/network/http/middleware/auth.ts (sha256 + timingSafeEqual) | ✅ COMPLIANT |
| AUTH-3 | Length mismatch handled | `test/web-auth.test.ts > returns false for different lengths without throwing` | ✅ COMPLIANT |

### http-security-hardening/spec.md (REQ-6..8, 8 scenarios)

| Requirement | Scenario | Test / evidence | Result |
|---|---|---|---|
| REQ-6 | Burst limited | `test/server.test.ts > HTTP hardening (REQ-6/7) > rate limits bursts on protected routes` (130x burst, 429 seen) | ✅ COMPLIANT |
| REQ-6 | Normal traffic unaffected | No direct in-window protected-route pass assertion; limiter is max 100/60s global (server.ts:84-94), exempt-path 200s asserted | ⚠️ PARTIAL |
| REQ-6 | Healthz exempt | `test/server.test.ts > ...exempts /healthz` (20x 200) | ✅ COMPLIANT |
| REQ-7 | Headers present | `test/server.test.ts > adds security headers` asserts CSP present, no unsafe-inline, img-src, nosniff, X-Frame-Options DENY; code emits `frame-ancestors 'none'` (server.ts:105) but the test does not assert that member explicitly | ⚠️ PARTIAL |
| REQ-7 | SPA images allowed | `apps/web/e2e/csp-photos.spec.ts > SPA mounts under CSP and loads a cross-origin photo` (ran locally, PASSED: cross-origin photo decodes naturalWidth>0, zero CSP violations) | ✅ COMPLIANT |
| REQ-7 | Inline script blocked | e2e: zero `script:not([src])` + zero CSP violations; server.test.ts: `csp` not.toContain('unsafe-inline') | ✅ COMPLIANT |
| REQ-8 | Patched fastify | lockfile `fastify@5.11.3`; `test/deps-posture.test.ts > backend fastify resolves to a patched version (>= 5.11.0)` | ✅ COMPLIANT |
| REQ-8 | Advisory register exists | `docs/advisories.md` (ip-address, adm-zip, semver tooling registered with reachability) | ✅ COMPLIANT |

### secret-handling/spec.md (SECRET-1..2, 7 scenarios)

| Requirement | Scenario | Test / evidence | Result |
|---|---|---|---|
| SECRET-1 | HTTPS allowlisted host accepted | `test/env.test.ts > accepts an allowlisted https host`; `packages/shared/test/setup.test.ts > accepts an allowlisted https host via the factory` | ✅ COMPLIANT |
| SECRET-1 | Loopback host accepted without allowlist | env.test `keeps the loopback dev default`; shared `accepts a loopback URL`; setup-routes `accepts a loopback dev URL` (shared/src/setup.ts:29-49) | ✅ COMPLIANT |
| SECRET-1 | Non-allowlisted host rejected | env.test `rejects a host that is not allowlisted`; shared `rejects a non-allowlisted https host`; setup-routes `rejects a non-allowlisted https host with 400` | ✅ COMPLIANT |
| SECRET-1 | Allowlisted non-HTTPS host accepted (internal trust) | Implemented: allowlist branch is scheme-agnostic (shared/src/setup.ts:48) and compose defaults `OPENWA_BASE_URL=http://openwa:2785` + `OPENWA_ALLOWED_HOSTS=openwa` (docker-compose.yaml:46-49); no test asserts the http+allowlisted accept path directly | ⚠️ PARTIAL |
| SECRET-1 | Setup schema shares the constraint | `test/setup-routes.test.ts > SECRET-1: setup schema rejects unsafe OpenWA URLs` (2x 400 + 1x 200) | ✅ COMPLIANT |
| SECRET-2 | Prod setup does not touch disk | `test/setup-routes.test.ts > does not write the env file when NODE_ENV=production` (writeFileSync not called, `saved: []`); `test/whatsapp-utils.test.ts > does not write the env file in production`; gate at integrations/whatsapp/setup.ts:252 | ✅ COMPLIANT |
| SECRET-2 | Dev write preserved | setup-routes `still writes the env file in development`; whatsapp-utils `keeps writing the env file in development` | ✅ COMPLIANT |

### ci-mosquitto-integration/spec.md (REQ-3, 3 scenarios)

| Requirement | Scenario | Test / evidence | Result |
|---|---|---|---|
| REQ-3 | Env vars set (HOST/PORT/USER/PASS/PROTOCOL) | `.github/workflows/test.yml > mqtt-integration` env: MQTT_HOST=localhost, MQTT_PORT=1883, MQTT_PROTOCOL=mqtt, MQTT_USER/PASS; harness `apps/backend/scripts/mosquitto/run-integration-tests.sh` exports same; ran locally: 2/2 pass | ✅ COMPLIANT |
| REQ-3 | Single MOSQUITTO_PORT source | `docker-compose.integration.yaml` publishes `'${MOSQUITTO_PORT:-1884}:1883'`; run-integration-tests.sh reads/exports the same var; CI job env `MOSQUITTO_PORT: 1883` | ✅ COMPLIANT |
| REQ-3 | MOSQUITTO_PORT differs from default (1884) | Live harness run: default MOSQUITTO_PORT=1884 → MQTT_PORT=1884 → tests connect successfully (2/2 pass) | ✅ COMPLIANT |

### face-verification/spec.md (RF-7 + RF-1, 6 scenarios)

| Requirement | Scenario | Test / evidence | Result |
|---|---|---|---|
| RF-7 | Patched sharp | lockfile `@img/sharp-*@0.35.3`; deps-posture `backend sharp resolves to a patched major (>= 0.35)` | ✅ COMPLIANT |
| RF-7 | Dead deps absent | tfjs-node/tfjs absent from lockfile and workspace; backend runtime clean (deps-posture `runtime workspace does not depend on @vladmandic/human or tfjs-node`). BUT root `package.json:49` still declares `@vladmandic/human ^3.0.3` (imported by scripts/embed-one-model.ts:63, benchmark-human.ts:1, _run-repeat-human.ts:1; lockfile resolves 3.3.6) — spec scenario literally says "workspace dependency tree ... no human package present" | ⚠️ PARTIAL |
| RF-7 | allowBuilds cleaned | deps-posture `no @vladmandic/human or tfjs allowBuilds entry remains in pnpm-workspace.yaml` + `root pnpm.onlyBuiltDependencies no longer references tfjs-node` | ✅ COMPLIANT |
| RF-1 | Detect/align/embed/match → `{match: true, name, similarity}` | `test/face-recognition-service.test.ts > returns a match when cosine similarity reaches the threshold (RF-1)` | ✅ COMPLIANT |
| RF-1 | Below threshold → `{match:false}` no name | `...> returns no-match without a name when the best cosine is below threshold (RF-1)` | ✅ COMPLIANT |
| RF-1 | Zero HTTP fetches under hostile PHOTOS_BASE_URL | `...> reads stored photos from local disk and never fetches (RF-1 scenario 3)` (fetch stub throws, `fetchSpy` never called, `readFile` called with `/stored/alice.jpg`); also `returns no-match when a stored photo file cannot be read (R4)`; code: readFile at src/services/face-recognition/index.ts:401, `VerifyStoredPhoto {name, path}` | ✅ COMPLIANT |

### container-deployment/spec.md (CD-11, CD-12, CD-13, CD-7; 12 scenarios)

| Requirement | Scenario | Test / evidence | Result |
|---|---|---|---|
| CD-11 | Non-root process | Dockerfile:78-85 `useradd --uid 1001 doorcloud` + `USER doorcloud`; boot proof from apply-progress (id -u = 1001) + orchestrator final-state facts + CI runtime-integration | ✅ COMPLIANT |
| CD-11 | Writable runtime paths | Dockerfile chowns `/data/photos /data/state /app/apps/backend/models`; entrypoint chown guard (entrypoint.sh:29-41); boot proof (volumes writable) + apply #217 | ✅ COMPLIANT |
| CD-11 | Signals and healthcheck intact | /healthz 200 + SIGTERM graceful exit 0 (boot proof #217); HEALTHCHECK node fetch (Dockerfile:89-90); `exec node index.js` PID 1 (entrypoint.sh:55) | ✅ COMPLIANT |
| CD-12 | Verified download | `test/download-models.test.ts > extracts only after a matching checksum` + `computes a known sha256` + `pins the real buffalo_s sha256...`; pin `d85a87f5...` in download-models.checksum.ts + .sh verify_sha256 (sha256sum --check --status) | ✅ COMPLIANT |
| CD-12 | Checksum mismatch fails | `...> rejects a checksum mismatch before any extraction` + `aborts the install flow on mismatch, removing the artifact` (spawnSync never called → no unzip boundary) | ✅ COMPLIANT |
| CD-13 | Ports not published | docker-compose.yaml: mosquitto and openwa services have NO `ports:` mapping (only doorcloud 1996); integration overlay opt-in, never auto-loaded | ✅ COMPLIANT |
| CD-13 | Internal connectivity intact | `MQTT_HOST: mosquitto` + `MQTT_PORT: 1883` (docker-compose.yaml:21-24); boot proof "MQTT connected+subscribed internally" (#217) | ✅ COMPLIANT |
| CD-13 | Default creds rejected | `${MQTT_PASS:?MQTT_PASS is required}` (docker-compose.yaml:31) and `MOSQUITTO_BACKEND_PASSWORD: ${MQTT_PASS:?}` (:131); live `docker compose config` exit 1 without MQTT_PASS | ✅ COMPLIANT |
| CD-13 | Passwordfile untracked | `.gitignore:136`; live `git check-ignore infra/mosquitto/passwordfile` matches | ✅ COMPLIANT |
| CD-7 | MQTT to broker | Same evidence as CD-13 internal connectivity (host mosquitto:1883, broker internally reachable) | ✅ COMPLIANT |
| CD-7 | Restart on crash | `restart: unless-stopped` on doorcloud (docker-compose.yaml:7) | ✅ COMPLIANT |
| CD-7 | Missing secret aborts compose | Live `docker compose --env-file /dev/null config` exit 1 with substitution errors (SETUP_TOKEN/WEB_AUTH_*/MQTT_PASS etc.) | ✅ COMPLIANT |

### web-front/spec.md (WF-10, WF-11, WF-1; 5 scenarios)

| Requirement | Scenario | Test / evidence | Result |
|---|---|---|---|
| WF-10 | Cross-origin photos load | `apps/web/e2e/csp-photos.spec.ts` (ran locally, PASSED: img decodes naturalWidth>0 under backend-emitted CSP, zero violations) | ✅ COMPLIANT |
| WF-10 | No inline scripts | e2e `script:not([src])` count 0 + server.test.ts CSP no unsafe-inline | ✅ COMPLIANT |
| WF-11 | Patched happy-dom | lockfile `happy-dom@20.11.2`; deps-posture `web happy-dom resolves to a patched version (>= 20.8.9)` | ✅ COMPLIANT |
| WF-1 | Prod same-origin | server.ts `/` + `/setup` route `sendFile('index.html', webDist)`; e2e smoke SPA loads (ran locally PASSED) | ✅ COMPLIANT |
| WF-1 | Upgraded static plugin unchanged | `@fastify/static@10.1.3` registered (server.ts:135-145); assets serve in e2e smoke; deps-posture static >= 10.1.2 | ✅ COMPLIANT |

**Compliance summary**: 45/49 scenarios compliant, 4 partial (all implementation-verified by inspection with a specific assertion gap), 0 untested, 0 failing. 14/18 requirements fully complete.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| AUTH-1 prod env gate | ✅ Implemented | env.ts:236-253 three refines; compose `:?`; dev untouched |
| AUTH-2/3 fail-closed + constant-time | ✅ Implemented | middleware/auth.ts safeEqual; setup-auth 401; web-auth reuses helper |
| REQ-6 rate limit | ✅ Implemented | server.ts:84-94 global 100/60s, allowList /healthz + /photos |
| REQ-7 headers | ✅ Implemented | server.ts:98-111 CSP (+PHOTOS origin img-src), nosniff, frame-ancestors 'none', X-Frame-Options DENY |
| REQ-8 deps posture | ✅ Implemented | fastify 5.11.3, sharp 0.35.3, static 10.1.3, happy-dom 20.11.2; docs/advisories.md |
| SECRET-1 allowlist rule | ✅ Implemented | shared/src/setup.ts:34-49 loopback-or-allowlist; env + setup schema + write boundary (whatsapp/setup.ts:237-248) |
| SECRET-2 prod write gating | ✅ Implemented | whatsapp/setup.ts:252 return {saved:[]}; sync-api-key.mjs:70-72 skip |
| REQ-3 single MOSQUITTO_PORT | ✅ Implemented | docker-compose.integration.yaml + run-integration-tests.sh + CI env share one var |
| SEC-03/CD-13 port surface | ✅ Implemented | no 1883/2785 host maps in base compose |
| T5.3 8883 config-ready | ✅ Implemented | password-generator.sh appends listener only when all 3 MOSQUITTO_TLS_* set; partial set aborts |
| CD-11 non-root + chown guard | ✅ Implemented | Dockerfile USER doorcloud 1001 + entrypoint guard fail-fast with actionable message |
| CD-12 sha256 pin | ✅ Implemented | download-models.checksum.ts + .sh verify pre-extract |
| RF-1 disk read / zero fetch | ✅ Implemented | index.ts:401 readFile(path); VerifyStoredPhoto {name,path}; user.ts resolvePath refs |
| CI hermetic + broker readiness | ✅ Implemented | test.yml/test:ci excludes; health-status wait loop in test.yml + runtime-integration.yml |

## Coherence (Design)

| Decision (design.md) | Followed? | Notes |
|----------|-----------|-------|
| Dep upgrades + dead-code removal | ✅ Yes | sharp/static/fastify/happy-dom bumped; src/lib/human deleted; allowBuilds cleaned |
| Fail-closed env + compose `:?` | ✅ Yes | dev defaults untouched |
| Shared safeEqual + 401 | ✅ Yes | single helper, 403→401 |
| Global rate limit with healthz/photos allowList | ✅ Yes | exactly as designed |
| Manual onSend CSP (no helmet dep) | ✅ Yes | zero new deps; env-derived img-src |
| OPENWA allowlist-only (https recommended) | ✅ Yes | rule decision documented and spec matched |
| Prod .env write gating | ✅ Yes | both write paths gated |
| MQTT surface drop + single port source | ✅ Yes | includes integration overlay |
| Non-root + chowns + chown guard | ✅ Yes | includes pre-existing-volume fail-fast |
| sha256 pin pre-extract | ✅ Yes | TS source of truth + bash twin |
| verify() disk read contract | ✅ Yes | {name,path}; VERIFY_FETCH_TIMEOUT_MS removed |

Design deviation (documented, non-breaking): env gate as 3 chained refines vs 1 combined (cleaner errors, same semantics — recorded in #194). human retained at root for benchmark scripts (recorded in #194; see WARNING 1 below).

## TDD Compliance (Strict TDD active)

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | tasks.md per-task `Verify:` lines carry RED→GREEN notes for every task; Engram apply-progress #194 (slices 1+2), #217 (slice 6) |
| All tasks have tests | ✅ | 27/27 tasks map to test files that exist (env, setup-routes, web-auth, server, deps-posture, face-recognition-service, user, download-models, whatsapp-utils, shared setup, e2e csp-photos) |
| RED confirmed (tests exist) | ✅ | RED tasks T1.3/T2.1/T2.3/T3.1/T4.1/T4.3/T6.1/T6.4 all have corresponding test files, present and passing now |
| GREEN confirmed (tests pass) | ✅ | Executed now: 327 backend + 43 web + 43 shared + 2 e2e; typecheck + lint fresh pass |
| Triangulation adequate | ✅ | RF-1: 7 verify tests (match/no-match/zero-fetch/parallel/cap/unreadable/hybrid); SECRET-1: env 4 + routes 3 + shared 4; CD-12: 5 tests; AUTH-1: 6 | 
| Safety Net for modified files | ⚠️ | Not formalized as a table in the artifacts; slice-6 apply #217 shows care (mockClear in beforeEach) — not fully verifiable from snapshots |

**TDD Compliance**: 5/6 checks confirmed. WARNING: slices 3-5 apply-progress observations were not located in Engram under the security-hardening topic (only #194 and #217 found); their TDD evidence is embedded in tasks.md and commit history (07286cd, 1f02140, 6530a82, 6752bbc, 37434a8...). Found artifacts use per-task Status/Evidence tables, not the strict RED/GREEN/TRIANGULATE/SAFETY-NET/REFACTOR shape.

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 413 | 34 | vitest 4.1.10 (backend 327/26, web 43/5, shared 43/3) |
| Integration | 2 (mqtt) + python/onnx suites (excluded from hermetic by design) | 1+3 | vitest + docker compose overlay |
| E2E | 2 | 2 (csp-photos, smoke) | @playwright/test 1.54 (chromium) |
| **Total executed** | **417 unit+integration, 2 e2e** | | |

## Changed File Coverage

➖ Coverage analysis skipped — no coverage tool detected/configured in the verification commands. (Informational per strict module — not a failure.)

## Assertion Quality

**Assertion quality**: ✅ All assertions verify real behavior. Scanned the changed suites (env, setup-routes, web-auth, server, deps-posture, face-recognition-service, user, download-models, whatsapp-utils, shared setup, csp-photos): no tautologies, no ghost loops, no standalone type-only assertions (all `toBeDefined`/`toBeUndefined` instances are paired with value semantics, e.g. dev fail-open expectations), behavioral assertions on status codes, disk writes, fetch absence, subprocess boundaries, and browser image decode. No mock-heavy files (mocks ≤ assertions, correct unit layer).

## Issues Found

**CRITICAL**: None

**WARNING**:
1. RF-7 "Dead deps absent" scenario wording vs implementation scope: `@vladmandic/human@^3.0.3` still declared at root (`package.json:49`, lockfile resolves 3.3.6) and imported by `scripts/embed-one-model.ts:63`, `scripts/benchmark-human.ts:1`, `scripts/_run-repeat-human.ts:1`. The backend face-recognition runtime is clean and tfjs-node/tfjs are fully gone, but the spec scenario says "workspace dependency tree ... no human package present". Either relocate human to a benchmark-only workspace or narrow the scenario to "face-recognition runtime workspace"; `deps-posture.test.ts` asserts only the backend tree, so no test pins the broader wording.
2. TDD evidence chain is incomplete in Engram: apply-progress for slices 3-5 not found (recovered from tasks.md + commits); found artifacts do not use the strict TDD table shape.

**SUGGESTION**:
1. Add a direct SECRET-1 accept test for allowlisted non-https (`http://openwa:2785` + allowlist) in shared/env suites; consider renaming env.test.ts "rejects a non-HTTPS URL" (the rejection there is allowlist-based; HTTPS is only "recommended" per spec, so the name overstates the rule).
2. server.test.ts REQ-6: add an explicit in-window pass assertion on a protected route (currently only burst→429 and exempt-healthz-200 exist).
3. server.test.ts REQ-7: add `expect(csp).toContain("frame-ancestors 'none'")` (code emits it; test asserts the sibling X-Frame-Options DENY only).
4. `download-models.sh` buffalo_l/m + dlib zips remain unpinned (benchmark-only, out of scope; follow-up risk recorded in apply #217).
5. Pre-existing lint warning `apps/web/src/auth.ts:61` (useOptionalChain) — not introduced by this change, outside scope.

## Verdict

**Machine envelope**: `verdict: fail` (canonical fail for incomplete evidence - 3 scenarios partial, 0 blockers, 0 criticals). Persistable; not archive-ready until the partials are tightened.

**PASS WITH WARNINGS** — all 27 tasks complete; 45/49 scenarios compliant, 4 partial with implementation-verified behavior and specific test-wording gaps; zero failing tests; typecheck, lint, hermetic unit, MQTT integration, and web e2e all pass locally; CI green per final-state facts. Warnings are scope-documentation and test-precision items, none blocking.