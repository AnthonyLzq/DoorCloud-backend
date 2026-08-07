# Archive Report: produccion-turbo-doorcloud

**Change**: produccion-turbo-doorcloud
**Archived at**: 2026-08-07
**Intent**: production project — Turborepo dev orchestration + dockerize backend+web (same-origin). Image `doorcloud`.

## Verdict

**PASS** — closed. verify PASS, 13/13 requirements, 25/25 scenarios, 0 blockers, 385 unit tests green, 0 CRITICAL / 0 WARNING.

## Final-State Facts (terminal record of the cycle)

Facts below describe the change AT CLOSE, from the highest-authority sources available (orchestrator launch prompt final-state facts + native verification report). Intermediate snapshots (`verify-report`, `tasks.md`) were superseded where later/lower-ranked claims conflict; no conflict required silent resolution.

- **Verdict**: PASS (verify PASS, 13/13 requirements, 25/25 scenarios, 0 blockers, 385 tests green, 0 CRITICAL, 0 WARNING).
- **Tasks**: 21/21 complete by committed implementation, mapping 1:1 to committed work units.
- **Commits on master** (work units, one commit per phase):
  | Commit | Phase |
  |--------|-------|
  | `1981625` | plan (proposal) |
  | `a9a65b5` | tasks |
  | `f5fe40a` | turbo task graph |
  | `f8f8f2b` | per-package dev scripts |
  | `92a94b6` | `/healthz` + SIGTERM graceful shutdown |
  | `8f523ba` | Dockerfile + compose |
  | `9e2715e` | image rename to `doorcloud` |
  | `11579e9` | CI through turbo |
  | `67575f0` | README Docker section + env handoff |
  | `9ce5d1e` | untag image as `doorcloud` (final image/service name) |
- **Image/service name**: `doorcloud` (untagged); `container_name: doorcloud`.
- **Dockerized proof**: `docker compose up` produced a healthy `doorcloud`; `/healthz` → 200; SPA `/` and `/setup` → 200; MQTT to `mosquitto` (protocol `mqtt`); named `PHOTOS_DIR` + `STATE_DB_PATH` volumes and `:ro` runtime models mount verified. Validated live during apply; verify confirmed statically.

### Stale-checkbox reconciliation (exceptional, orchestrator-approved)

The persisted `tasks.md` retains all 21 `- [ ]` checkboxes — they were never backfilled by `sdd-apply`. This is a known cosmetic gap, NOT an indication of incomplete work. Per the orchestrator's explicit instruction and the Task Completion Gate's exceptional-repair path, tasks are recorded as **complete by committed implementation** (10 committed work-unit commits on master), NOT by checkbox state. Every task's work is present on master and green under `pnpm test:ci` (385 tests). The archived `tasks.md` is left untouched as the audit trail; see the Note in `verify-report.md` for corroboration.

## Spec Sync

Both delta specs describe NEW capability domains that did not yet exist in `openspec/specs/`. Per OpenSpec convention, they were written as full specs and copied directly to `openspec/specs/` as the new source of truth:

| Domain | Action | Source of truth (new) |
|--------|--------|------------------------|
| `task-orchestration` | Created (HEADless delta → full main spec) | `openspec/specs/task-orchestration/spec.md` |
| `container-deployment` | Created (full main spec) | `openspec/specs/container-deployment/spec.md` |

No existing requirement was REMOVED or MODIFIED; no RENAMED requirements. Preservations: N/A (both main specs are newly created).

## Archive Contents

- `proposal.md` — present
- `specs/task-orchestration/spec.md`, `specs/container-deployment/spec.md` — present
- `design.md` — present
- `tasks.md` — present (21 tasks, all complete by work-unit evidence per reconciliation note above)
- `verify-report.md` — present
- `archive-report.md` — this file

## Engram Persistence

- Topic key: `sdd/produccion-turbo-doorcloud/archive-report` (observation recorded in Engram, `capture_prompt: false`, project `doorcloud-backend`).

## Risks

- **CRITICAL**: None.
- **WARNING**: None.
  - *Cosmetic*: `tasks.md` checkboxes stale (all `[ ]`) — reconciled above; not treated as incomplete implementation.
  - *Cosmetic*: `apps/backend/package.json` engine warning (node 24 vs declared <23) surfaced at build; hermetic exit 0 regardless (local node 24.13.1).

## Skill Resolution

`paths-injected` — skill path provided by orchestrator (`sdd-archive/SKILL.md`); shared phase + openspec convention skills loaded alongside.

## Next Recommended

None — SDD cycle complete. Ready for the next change.