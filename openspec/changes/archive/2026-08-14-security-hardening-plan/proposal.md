# Proposal: Security Hardening (SEC-01..SEC-14)

## Intent

Audit SEC-01..SEC-14 (verified vs code + lockfile) found: vulnerable deps, dead packages pulling critical chains, fail-open auth, missing rate limits/headers, API key on disk, plaintext MQTT + published ports, root container, unpinned model downloads, SSRF-capable `verify()`. Fix all in one cohesive change: fail closed, no known exploitable vulnerabilities, minimal network surface.

## Scope

### In Scope
- Deps: sharp 0.35.x, @fastify/static >=10.1.2, drop tfjs-node/human/allowBuilds, happy-dom bump, fastify bump, semver override; document ip-address/adm-zip (no patch upstream)
- Auth: prod-required SETUP_TOKEN/WEB_AUTH_*, compose `${VAR:?}`, constant-time compare, fail-closed middleware
- HTTP: rate limits (/setup/*, /admin/*, upload); CSP/nosniff/frame-ancestors
- Secrets: https-only allowlisted OPENWA_BASE_URL; no runtime .env writes in prod
- MQTT/network: un-publish 1883/2785, non-default MQTT creds, gitignore passwordfile, fix test-port mismatch, TLS (8883) path where feasible
- Container: non-root USER + chowns, sha256-pinned model downloads
- SSRF: `verify()` reads reference photos from disk

### Out of Scope
- Device firmware (out of repo; documented follow-up, not silently broken)
- TLS cutover timing if blocked; MQTT topic names (rule considered, unchanged)
- Model config (already pinned)

## Capabilities

### New Capabilities
- `auth-fail-closed`: prod-required auth secrets, fail-closed middleware, constant-time compare
- `secret-handling`: OPENWA base-URL validation/allowlist, prod .env write gating

### Modified Capabilities
- `http-security-hardening`: rate limiting + security headers
- `container-deployment`: non-root run, port exposure, `${VAR:?}`, checksum pins
- `face-verification`: `verify()` reads disk (contract change)
- `web-front`: strict-CSP compatibility (img-src PHOTOS_BASE_URL)
- `ci-mosquitto-integration`: broker port wiring fix

## Approach

One SDD change, six chained stacked-to-main slices, dependency-ordered: (1) runtime deps SEC-01/02/10/12/13, (2) auth SEC-04/06, (3) HTTP SEC-05/09, (4) secrets SEC-07, (5) MQTT/network SEC-03, (6) container+supply+SSRF SEC-08/11/14. Each slice: autonomous review unit with own verify + rollback; design details each.

## Affected Areas

| Area | Impact |
|------|--------|
| apps/*/package.json, lockfile, workspace yaml | Modified |
| src/config/env.ts, auth middlewares | Modified |
| src/network/server.ts, http routes | Modified |
| integrations/whatsapp/setup.ts, packages/shared | Modified |
| docker-compose.yaml, infra+scripts/mosquitto | Modified |
| Dockerfile, entrypoint.sh, download-models | Modified |
| face-recognition/index.ts, services/user.ts | Modified |
| .env.example, .gitignore | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| sharp/@fastify/static major breaks runtime | Med | Integration tests + release notes at apply |
| Fail-closed auth bricks misconfigured Coolify deploy | Med/High | `${VAR:?}` fails fast; open never ships |
| Un-publishing MQTT ports breaks device | Med | Sequence + firmware follow-up doc |
| CSP blocks SPA images | Low | img-src includes PHOTOS_BASE_URL; no inline scripts |

## Rollback Plan

- One revertible commit per slice; prior lockfile kept as tag
- Env/secrets config-gated (dev untouched); reverting defaults restores behavior
- Port exposure restored by dropping internal-network-only config

## Dependencies

- `@fastify/rate-limit` (new); updated sharp/@fastify/static; mosquitto TLS certs for slice 5

## Success Criteria

- [ ] `pnpm audit` clean except documented low-reachability advisories
- [ ] Unset SETUP_TOKEN/WEB_AUTH_* in prod fails startup/compose
- [ ] Rate limits + headers verified via tests/curl
- [ ] `verify()` performs zero HTTP fetches
- [ ] Container runs non-root; downloads verify sha256
- [ ] `test:local` + `test:mqtt` green with new wiring