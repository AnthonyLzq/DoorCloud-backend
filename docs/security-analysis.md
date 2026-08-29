# Security Analysis of the DoorCloud Backend

## 1. Introduction

### 1.1 Scope

This document consolidates the security work performed on the DoorCloud
backend across three review waves (2026-08-14, 2026-08-26 and 2026-08-29):

- a static audit and hardening change (SDD `security-hardening-plan`),
- an orchestrated dynamic penetration test (Strix playbook, adapted),
- a browser-based UI assessment,
- the supply-chain pipeline (audit + Trivy) wired as a deploy gate.

The evidence trail is reproducible: every finding carries a commit hash in
this repository, a live probe result, or a CI run. The raw pentest ledger
(`strix_runs/orchestrated-pentest/RESULTS.md`, gitignored) holds the full
step-by-step record.

### 1.2 Research Questions

1. What is the reachable attack surface of the backend?
2. Are the authentication and authorization layers sound and layered?
3. Can an attacker persist or serve attacker-controlled content?
4. Is the deployment (Coolify) consistent with the repository configuration?
5. What residual risk remains, and who owns it?

## 2. Methodology

### 2.1 System Under Test

DoorCloud pairs a Fastify backend with a Preact SPA (same origin), a Mosquitto
MQTT broker for the door device, an OpenWA bridge for WhatsApp, and a hybrid
face-recognition pipeline (ONNX Runtime + Python worker). Photos live under
`PHOTOS_DIR` and are served through HMAC-signed URLs (`/photos/:sig/:exp/*`).

### 2.2 Static Audit and Hardening (Wave 1, 2026-08-14)

The SDD change `security-hardening-plan` executed six slices (dependencies,
auth fail-closed, HTTP hardening, secrets, MQTT/network, container + supply
chain + SSRF). Artifacts: `openspec/changes/archive/2026-08-14-security-hardening-plan/`
and the merged specs under `openspec/specs/` (`auth-fail-closed`,
`http-security-hardening`, `secret-handling`, `photo-admin-api`,
`photo-storage`).

### 2.3 Orchestrated Dynamic Pentest (Wave 2, 2026-08-26)

The open-source Strix CLI (multi-agent pentester) failed 4/4 runs against the
free model gateway (`503 chat_admission_busy / structure_limit`), burning up
to 3.78M tokens per run without completing. The methodology was therefore
re-implemented orchestrator-side: the Strix playbook
(`strix/agents/prompts/`, `strix/skills/`) was adapted into sequential,
one-sub-agent-per-step dispatches with a fresh context each step, the same
model (`opencode-go/deepseek-v4-flash-vision-exp`), strict non-destructive
rules of engagement, and a write-proof requirement (before/after snapshots of
`PHOTOS_DIR`) for every live probe. Cost: ~0.3M tokens total, converging.

Steps executed: (1) recon and mapping (white-box + black-box), (2) upload
chain deep-dive, (3) admin API code audit + signed-URL negative probes +
SSRF verification, (4) final report. A browser pass (Wave 3, 2026-08-29)
covered the SPA with Brave DevTools.

### 2.4 Verification Gates

- Unit suite: 369 backend tests + 43 web tests, typecheck and Biome clean.
- Live probes against the deployed Docker stack (local and Coolify prod).
- CI: `Security - doorcloud` workflow (Trivy `fs` scan for CRITICAL/HIGH +
  `pnpm audit --prod`) chained before `Deploy to Coolify` via `workflow_run`,
  with an explicit gate step that fails the deploy unless the scan passed
  (`.github/workflows/security.yml`, `.github/workflows/deploy.yml`).

## 3. Findings

Severity scheme: CRITICAL / HIGH / MEDIUM / LOW / WARNING (availability) /
INFO. All findings below are closed; each carries its fix commit.

| ID | Severity | Finding | Evidence | Fix |
|----|----------|---------|----------|-----|
| F-01 | WARNING (availability) | Dual-auth clash: `webAuthMiddleware` (Basic, global preHandler) and `setupAuthMiddleware` (Bearer) both read the same `Authorization` header; `/admin/*` and `/setup/*` were unreachable (SPA sends Bearer-only) | Live: Basic-only, Bearer-only, both -> 401; `apps/web/src/auth.ts` sends Bearer-only | `1b2b050` (exempt `/admin`, `/setup` from the Basic layer) |
| U-01 | MEDIUM | Upload derived the stored extension from the client `mimetype` with no content validation (content planting; stored-XSS escalation blocked downstream) | `services/user.ts:50`, `storage/photos.ts:193` | `1b2b050` (magic-byte allowlist, extension derived from verified content) |
| U-02 | MEDIUM (bounded) | No explicit multipart `fileSize` (default 1 MB x 3 files x 100 req/min ~ 300 MB/min/IP) | multipart options audit | `1b2b050` (per-route `files`/`fileSize`, 413/400 mapping) |
| U-02a | WARNING | `FST_FILES_LIMIT` (file-count overflow) still fell through to 500 | `utils/helpers.ts:17-27`; live 500 | `5a47834` (+ `FST_PARTS_LIMIT`/`FST_FIELDS_LIMIT` -> 400) |
| U-03 | LOW | Malformed/truncated multipart -> 500 with empty body (also `FST_NO_FORM_DATA`) | live probes (a)/(c); `utils/helpers.ts` | `1b2b050`, `605ab57` (busboy no-code errors -> 400) |
| U-04 | LOW | No `Content-Disposition` on `/photos` responses | `routes/photos.ts:91` | `1b2b050` (+ `0d3a5b1` tests) |
| U-04a | WARNING | Unescaped `filename` in Content-Disposition: a person folder name containing CR/LF/accents made `setHeader` throw `ERR_INVALID_CHAR` (500) | `routes/photos.ts:95`; Node header validation | `7cdd7d2` (RFC 6266 ASCII fallback + RFC 5987 `filename*`) |
| A-01 | LOW | Rename guarded `from === USER_NAME` but not `to === USER_NAME` (owner-folder takeover when owner folder absent, Bearer required) | `admin-photos.ts:166-168` | `1b2b050` (symmetric guard, create + rename) |
| A-02 | LOW | `DELETE .../photos/:filename` with `filename='.'` -> 500 (EISDIR) | `admin-photos.ts:75-80` | `1b2b050` (reject `.`/`..`) |
| F-03 | INFO | CORS reflected an arbitrary Origin in dev (`CORS_ORIGINS ?? true`) | `server.ts` | `1b2b050` (`?? false`) |
| UI-01 | LOW/INFO | `SETUP_TOKEN` persisted in `localStorage` (`doorcloud.setupToken`) — stealable only via XSS; no XSS vector found (below) | browser storage inspection | accepted (standard SPA trade-off) |
| UI-02 | INFO | OpenWA error body surfaced verbatim in the setup UI (operator is the owner) | setup view | accepted |
| A-03/UI-03 | INFO | Single-token owner model; form fields without `id`/`name` (a11y) | code audit, console | accepted |

Negative results (equal-value evidence):

- **SSRF: denied.** Verification reads stored photos from disk
  (`resolvePath` + `#safeJoin`, `index.ts:401`; zero HTTP fetches — fix
  `2cb351a` holds). The Python worker accepts base64 bytes and local model
  paths only; the sole runtime fetch is OpenWA from the allowlist-gated
  `OPENWA_BASE_URL`.
- **Signed photos: no traversal, no forgery.** HMAC-SHA256 hex over
  `${expiresAt}:${relativePath}`, constant-time compare, expiry checked
  before containment and read (`photos.ts:69->75->82->91`). Live negatives
  (invalid signature, `../../etc/passwd`, far-future expiry, bare `/photos/`)
  all returned 404 with no leak.
- **Stored XSS: not exploitable.** A person named
  `<img src=x onerror=window.__xss=1>` created through the admin API renders
  as escaped text in the SPA (`window.__xss` never set, no injected element),
  served content types are allowlisted (`image/*` else
  `application/octet-stream`) and `nosniff` + CSP `script-src 'self'` hold on
  every response.
- **Dependency audit:** `pnpm audit` (dev + prod) reports zero known
  vulnerabilities; Trivy filesystem scan (CRITICAL/HIGH) passes in CI.
- **Admin API path audit:** containment (`#safeJoin`) on every filesystem
  operation; no traversal, no TOCTOU of consequence; promote is rename-only
  within `PHOTOS_DIR`.

## 4. Deployment Security (Coolify)

- The production compose runs as `dockercompose` build pack; Coolify routes
  web traffic through its proxy (TLS at the edge) and does **not** publish
  compose `ports:` to the host (verified: 1996/1883/8883 closed on the
  server; 1996 open only inside the compose network).
- The broker TLS listener (8883) is **active inside the container** in both
  stacks, driven by base64 certificate envs (`MOSQUITTO_TLS_*_B64`)
  materialized into the `config-private` volume by the entrypoint
  (`0c84348`, after `14eb197` reverted a deploy-unsafe file-path design).
  The image tag is pinned (`doorcloud-mosquitto:cd-14`, `746a05e`) so
  sub-service rebuilds reach production. External exposure of 8883 is
  **deferred until a device exists**; the runbook (proxy TCP entrypoint +
  labels, or Raw Compose) is in `docs/device-firmware-mqtt-cutover.md`.
- Local development binds the web surface to loopback only
  (`127.0.0.1:1996:1996`, `a10be5b`): plain-HTTP Basic credentials no longer
  cross the LAN, while localhost, tests and container-to-container traffic
  are unaffected.
- Credential rotation (2026-08-29) replaced the web Basic password in the
  local `.env`, `.env.prod`, the `DOORCLOUD_ENV_PROD` secret and the Coolify
  app environment, eliminating a configuration drift where the pipeline
  source held a stale (and previously recorded) password. Verified live:
  old password -> 401, new password -> 200, on local and production.

## 5. Conclusion

### 5.1 Primary Findings

1. No CRITICAL or HIGH vulnerabilities. The layered controls held under
   dynamic testing: HMAC verify-then-read signed photos, magic-byte upload
   validation, rate-limited constant-time Basic auth, ACL-scoped broker
   accounts, non-root container, and a fail-closed TLS listener.
2. The findings that existed were availability or defense-in-depth defects
   (the dual-auth clash broke the admin UI; upload and multipart error
   handling allowed content planting and 500s), all fixed and re-verified
   with live probes.
3. Deployment drift is the recurring operational risk class: a stale
   pipeline password and a deploy-unsafe TLS design were both caught only by
   comparing repository configuration against the running environment.

### 5.2 Residual Risk (accepted, owned)

- `8883` external exposure and device firmware: pending hardware; runbook
  documented.
- `WEB_AUTH_PASS` strength and rotation cadence: owner-owned.
- Local LAN HTTP surface: removed by the loopback bind; remote access is the
  HTTPS proxy path.

### 5.3 Future Work

- Wire Trivy image scanning on the Coolify server (compose builds the images
  there).
- Device firmware cutover to `mqtts://<host>:8883` with CA pinning.
- Periodic re-run of the orchestrated pentest after significant surface
  changes (the playbook and rules of engagement live in the ledger).

## References

1. Strix (open-source AI pentesting tool): https://github.com/usestrix/strix
2. Strix documentation index: https://docs.strix.ai/llms.txt
3. Coolify Docker Compose knowledge base: https://coolify.io/docs/knowledge-base/docker/compose
4. Coolify CLI: https://github.com/coollabsio/coolify-cli
5. Trivy scanner: https://github.com/aquasecurity/trivy
6. Trivy GitHub Action: https://github.com/aquasecurity/trivy-action
7. pnpm audit: https://pnpm.io/cli/audit
8. @fastify/multipart (error codes `FST_*`): https://github.com/fastify/fastify-multipart
9. RFC 6266 (Content-Disposition): https://datatracker.ietf.org/doc/html/rfc6266
10. RFC 5987 (character set and language encoding for HTTP header field parameters): https://datatracker.ietf.org/doc/html/rfc5987
11. Node.js `crypto.timingSafeEqual`: https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
12. OWASP Top 10: https://owasp.org/www-project-top-ten/
13. Eclipse Mosquitto: https://mosquitto.org/
14. GitHub Actions `workflow_run` event: https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#workflow_run
15. InsightFace model releases (buffalo_s supply chain): https://github.com/deepinsight/insightface/releases
16. dlib model files: http://dlib.net/files/
17. Traefik TCP routing (deferred 8883 exposure runbook): https://doc.traefik.io/traefik/routing/routers/
18. Internal: ADRs in `docs/adr/`, SDD archives in
    `openspec/changes/archive/` (2026-08-14-security-hardening-plan,
    2026-08-26-strix-hardening-fixes), pentest ledger
    `strix_runs/orchestrated-pentest/RESULTS.md` (gitignored, local).
