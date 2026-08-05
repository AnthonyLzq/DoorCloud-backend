# Archive Report: openwa-setup-ux

| Field | Value |
|-------|-------|
| Change | openwa-setup-ux |
| Archived to | `openspec/changes/archive/2026-08-05-openwa-setup-ux/` |
| Archived on | 2026-08-05 |
| Verdict | SUPERSEDED (no independent delivery work) |
| Status | `superseded` by `monorepo-config-web` |
| Tasks | N/A (none planned - specs/design/tasks flagged skip) |
| Specs | none (no delta specs produced) |

## Nature of This Archive

This change was NOT implemented, verified, or delivered as its own SDD cycle.
It was superseded before any spec/design/task/apply work began. Its `state.yaml`
already referenced the superseding change (`monorepo-config-web`), and the
intended `/setup` pairing UX was absorbed and rewritten by that change. This
archive records the supersession, not a completed cycle.

## Final-State Authority Note

This archive report is the terminal record for the superseded change and
reflects final state AT CLOSE (2026-08-05). Only `proposal.md`,
`exploration.md`, and `state.yaml` existed in the change folder - there were no
`specs/`, `design.md`, `tasks.md`, or `verify-report.md` artifacts because the
work was never planned under this change's SDD lineage (phases spec..verify are
`skipped`). There is no persisted artifact to reconcile against a review receipt
here: the change never entered apply or verify, so no native review or
independent verification governed it. The relevant delivery lineage lives on
the supersessor archive:
`openspec/changes/archive/2026-08-05-monorepo-config-web/`.

## Why It Was Superseded

The OpenWA setup-page UX described in `proposal.md` (auto-poll ~3s capped ~20,
double-start guard, auto-load QR when ready, page-load handling, failure caps,
manual recovery) was implemented as part of the monorepo SPA rewrite delivered
by `monorepo-config-web` (commits `40cdbad`, `17ed825`):

- The legacy inline `renderSetupHtml` page was deleted.
- The pairing UX now lives in the Preact SPA at `apps/web`, specifically the
  `Setup` view driven by `apps/web/src/controller/setup-controller.ts` (WF-1..6)
  (`views/Setup.tsx` + `createSetupController`).
- The OpenWA endpoints `/setup/openwa/status|start|qr` were unchanged and are
  consumed by the new SPA.

Because the UX was rewritten rather than built from this change's delta specs,
syncing this change's deltas into `openspec/specs/` would have been wrong - no
delta specs existed here to merge. The source of truth for the delivered UX is
the `monorepo-config-web` spec lineage (see its archive report).

## What Was Preserved

The archived folder preserves the original planning artifacts untouched:

- `proposal.md` - intended `/setup` pairing UX scope
- `exploration.md` - current-state analysis of `renderSetupHtml`
- `state.yaml` - rewritten to structured form, `status: superseded`,
  `superseded_by: monorepo-config-web`

## SDD Lifecycle Outcome

This change is closed as **superseded**. No SDD cycle (apply/verify) ran under
it; the behavior it proposed was delivered through `monorepo-config-web`.
Ready for the next change.