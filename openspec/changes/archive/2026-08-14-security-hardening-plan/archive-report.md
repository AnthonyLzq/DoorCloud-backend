# Archive Report: security-hardening-plan

**Change**: security-hardening-plan (SEC-01..SEC-14)
**Archived to**: `openspec/changes/archive/2026-08-14-security-hardening-plan/`
**Archived on**: 2026-08-14
**Intent**: Close the SEC-01..SEC-14 audit findings — patched deps, dead-code removal, fail-closed auth, rate limits + security headers, secret write-gating, MQTT surface reduction with single port source, non-root container, sha256-pinned model downloads, and SSRF-free `verify()`.

## Verdict

**PASS WITH WARNINGS** — closed. verify: 27/27 tasks, 45/49 scenarios compliant + 4 partial (implementation-verified; RF-7 resolved by spec rewording at close), 14/18 requirements fully complete, 0 blockers, 0 CRITICAL, 0 failing tests. Typecheck 4/4, lint 3/3, hermetic unit 327 backend + 43 web + 43 shared, MQTT integration 2/2, web e2e 2/2 — all green at close.

## Review Gate Note

Review mode OFF for this change: the user kill switch disabled receipt-driven development, so no native review transaction/ledger/receipt exists and none was expected. No approval is fabricated. Per the archive gate, `reviewGate.delivery` is `disabled/unmanaged` (kill switch off, review disabled) — the only relaxation the gate admits; there is no review artifact to validate and nothing blocking on that axis.

## Final-State Facts (terminal record of the cycle)

Facts below describe the change AT CLOSE, ranked by the Final-State Authority: native verification report (highest for delivery + verification) over intermediate snapshots; the orchestrator launch prompt final-state facts outrank `verify-report`/`apply-progress` where later work changed counts or status.

- **Verdict**: PASS WITH WARNINGS. 0 CRITICAL, 0 failing. The machine envelope (`verdict: fail`) is the canonical strict-module marker for incomplete evidence (4 partial scenarios), not a delivery failure; the human verdict and all gates pass.
- **Implementation**: 6 chained slices, 27/27 tasks complete (all marked `[x]` in the archived `tasks.md` — Task Completion Gate passed on the persisted artifact, no stale-checkbox reconciliation needed).
- **Commits**:
  - Slices 1-4: earlier commits (superseded snapshot titles `1f02140`, `0a5b385`, `6530a82`, `6752bbc`, `07286cd`, `0e724b1` per apply-progress/slice records).
  - Slice 5 (MQTT/network): `12efddb`, `657844f`, `37434a8`, `a8b4e89`, `3d8f215`; CI fixes `cd6778a`, `b85053a`, `34f530c`, `e22d049`, `7d7d643`.
  - Slice 6 (container/supply/SSRF): `2cb351a` (SSRF disk read), `7fa552a` (sha256 pin), `bc16a9a` (non-root).
  - Change artifacts: `fbb45ae` (proposal/specs/design/tasks/verify-report persisted; includes the two corrected specs below).
- **Spec corrections applied before close (included in `fbb45ae`)**: `face-verification` RF-1 rationale rewritten without the `@vladmandic/human` mention + RF-7 scenario narrowed to "face-recognition runtime dependency tree (apps/backend)"; `container-deployment` CD-7 names `docker-compose.yaml` (was `compose.yaml`).
- **Verification at close** (native report + launch-prompt facts, not stale snapshots): typecheck 4/4 fresh, lint 3/3 fresh, hermetic unit 327 + 43 + 43, MQTT integration 2/2 (single `MOSQUITTO_PORT` source, default 1884), web e2e 2/2 (`csp-photos` + `smoke`); CI green. 45/49 scenarios compliant; 4 partial; 0 failing. Requirements 14/18 fully complete, 4 partial (REQ-6 in-window pass assertion, REQ-7 frame-ancestors explicit assertion, SECRET-1 direct http+allowlist accept test, RF-7 wording) — RF-7 wording gap closed by the spec correction above; the remaining 3 partials are test-precision items with implementation proven by inspection and no failing behavior.
- **Deploy**: Coolify deploy remains blocked by a server-side outage (API error 530/1033) — NOT a code issue, no deploy work attempted at archive.

## Spec Sync

Seven delta specs merged into `openspec/specs/` (two new domains copied as full main specs, five deltas applied):

| Domain | Action | Source of truth (updated) |
|--------|--------|---------------------------|
| `auth-fail-closed` | Created (new domain; delta IS the full spec) | `openspec/specs/auth-fail-closed/spec.md` |
| `secret-handling` | Created (new domain; delta IS the full spec) | `openspec/specs/secret-handling/spec.md` |
| `http-security-hardening` | Updated (ADDED REQ-6 rate limiting, REQ-7 headers/CSP, REQ-8 deps posture) | `openspec/specs/http-security-hardening/spec.md` |
| `ci-mosquitto-integration` | Updated (MODIFIED REQ-3: single `MOSQUITTO_PORT` source, no drift) | `openspec/specs/ci-mosquitto-integration/spec.md` |
| `face-verification` | Updated (MODIFIED RF-1 disk-read/zero-fetch; ADDED RF-7 deps posture) | `openspec/specs/face-verification/spec.md` |
| `container-deployment` | Updated (MODIFIED CD-7 `${VAR:?}`; ADDED CD-11 non-root, CD-12 sha256 pin, CD-13 MQTT surface) | `openspec/specs/container-deployment/spec.md` |
| `web-front` | Updated (MODIFIED WF-1 static >= 10; ADDED WF-10 CSP compatibility, WF-11 happy-dom hygiene) | `openspec/specs/web-front/spec.md` |

No REMOVED/RENAMED requirements. Existing requirements outside the deltas were preserved verbatim (REQ-1..5 in http-security-hardening, REQ-1/2/4/5/6 in ci-mosquitto-integration, RF-2..6 in face-verification, CD-1..4/8..10 in container-deployment, WF-2..9 in web-front). No destructive merge — `config.yaml` `rules.archive` "warn before destructive deltas" did not trigger.

## Archive Contents

- `proposal.md` — present (scope, approach, rollback)
- `exploration.md` — present
- `specs/{auth-fail-closed,secret-handling,http-security-hardening,ci-mosquitto-integration,face-verification,container-deployment,web-front}/spec.md` — all 7 delta specs present
- `design.md` — present
- `tasks.md` — present (27/27 tasks complete, all `[x]`)
- `verify-report.md` — present (PASS WITH WARNINGS)
- `archive-report.md` — this file

## Engram Persistence

- Topic key: `sdd/security-hardening-plan/archive-report` (hybrid: filesystem + Engram, `capture_prompt: false`, project `doorcloud-backend`).
- Observation IDs for traceability (project `doorcloud-backend`):
  - `#189` — `sdd/security-hardening-plan/explore`
  - `#191` — `sdd/security-hardening-plan/spec`
  - `#192` — design (persisted under session topic `sdd/usando el plan que armaste.../design`)
  - `#194` — apply-progress slices 1+2
  - `#217` — apply-progress slice 6
  - `#254` — verify-report
  - Supporting evidence: `#196` (slice 3), `#216` (T3.3 e2e), `#220` (slice 4 deployed), `#252` (slice 6 committed), `#218` (hard rule: sub-agents never commit without approval)
- Note per verify WARNING: apply-progress observations for slices 3-5 were not located in Engram under the standard topic; their evidence lives in `tasks.md` per-task `Verify:` lines and commit history. No contradiction with the close state.

## Risks

- **CRITICAL**: None.
- **Deploy pending**: Coolify deploy blocked by server-side outage (API 530/1033) — open operational item, not a code defect.
- **Benchmark-only human retention**: `@vladmandic/human` still declared at root for benchmark scripts (`scripts/embed-one-model.ts`, `benchmark-human.ts`, `_run-repeat-human.ts`) — runtime tree is clean (`deps-posture` proves it); the corrected RF-7 scenario narrows the claim to the runtime tree. Future benchmark migration may drop it.
- **Unpinned model zips**: `download-models.sh` buffalo_l/m + dlib zips remain unpinned (benchmark-only, out of scope; recorded in apply #217).
- **Device firmware cutover**: plaintext 1883 no longer host-published; LAN firmware still uses it. Deferred explicitly with `docs/device-firmware-mqtt-cutover.md` (T5.4) — documented follow-up, not silent removal.
- **Partial-scenario test precision**: REQ-6 in-window pass, REQ-7 frame-ancestors assertion, SECRET-1 direct http+allowlist accept test — 3 suggestion-level test additions; behavior verified by inspection, no failing behavior.
- **Cosmetic**: pre-existing lint warning `apps/web/src/auth.ts:61` (useOptionalChain, file touched by an older change); `state.yaml` was not present in the change folder (orchestrator-owned artifact, absent for this change — archived folder mirrors the source folder).

## Skill Resolution

`paths-injected` — skill path provided by orchestrator (`sdd-archive/SKILL.md`); shared phase + openspec convention contracts loaded alongside.

## Next Recommended

- Orchestrator: commit the archive move + merged main specs + this report (sub-agents do not commit without approval — rule #218). Suggested conventional commit: `docs(sdd): archive security-hardening-plan` / `chore(sdd)`.
- Then: attempt Coolify deploy once the server-side outage clears (530/1033).
- SDD cycle complete for this change. Ready for the next change.