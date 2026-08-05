# Archive Report: face-recognition-benchmarking

| Field | Value |
|-------|-------|
| Change | face-recognition-benchmarking |
| Archived to | `openspec/changes/archive/2026-08-05-face-recognition-benchmarking/` |
| Archived on | 2026-08-05 |
| Verdict | ARCHIVED (planning-only; delivered outside SDD tracking) |
| Status | `archived` |
| Tasks | N/A (planning-only; no implementation task set was applied) |
| Specs | 4 planning spec drafts (NOT synced to `openspec/specs/`) |

## Nature of This Archive

This change is an OBSOLETE PLANNING-ONLY artifact. Per its original `state.yaml`:
`Phase: Planning`, created 2024-01-17, `Proposal` done, `Specs`/`Design`/
`Tasks`/`Implementation` NOT done. It was never executed as an SDD cycle. The
work it set out to describe was nonetheless built and delivered OUTSIDE this
change's tracking, so there is no delta spec to sync into the main spec store
and no task artifact to reconcile. This archive records that honest outcome
rather than manufacturing a false "cycle complete."

## Final-State Authority Note

This archive report is the terminal record and reflects final state AT CLOSE
(2026-08-05). Direction comes from the orchestrator's launch prompt
(highest-ranked source here, per the authority hierarchy), which states the
hybrid face-recognition benchmark system + demographic bias analysis were built
and delivered through the codebase and benchmark pipeline, not through this
change's SDD spec flow. There was no native review receipt and no
`verify-report.md` because the change never entered apply or verify; no CRITICAL
or WARNING verification issues exist for this change. The planning spec files
(`specs/benchmark-system.spec.md`, `onnx-provider.spec.md`, `python-manager.spec.md`,
`unified-api.spec.md`) and `design.md` were preserved as historical planning
artifacts but were NOT tracked or verified, and were intentionally NOT synced
into `openspec/specs/`.

## Why Archived Without a Spec Merge

1. `state.yaml` marks `Phase: Planning` with only `Proposal` done - the spec,
   design, tasks, and implementation were never executed in this lineage.
2. The intended system's functionality was BUILT and DELIVERED outside this
   change's SDD flow:
   - Hybrid face-recognition service lives in
     `apps/backend/src/services/face-recognition` (ONNX provider + Python
     manager, IPC contract).
   - Benchmark and demographic bias analysis live in `docs/benchmark-analysis.md`
     and the `scripts/` pipeline (`benchmark:analyze`, `benchmark:plots`, etc.),
     along with the BFW/dlib benchmark work from prior sessions.
3. No specs or tasks existed (or were tracked) to verify, merge into
   `openspec/specs/`, or reconcile against a terminal receipt.

Merging the planning spec files verbatim into the main spec store would have
been incorrect: they describe intended design, not the current source of truth,
and the delivered system's real contract is captured by the code and
`docs/benchmark-analysis.md`, not by these unexecuted drafts.

## What Was Preserved

The archived folder preserves the full planning artifact set untouched:

- `proposal.md` - original hybrid benchmarking proposal (2024-01-17)
- `design.md` - hybrid ONNX + Python design
- `specs/` - 4 planning spec drafts (benchmark-system, onnx-provider,
  python-manager, unified-api) - historical only, not tracked/verified
- `tasks.md` - draft task breakdown (unapplied)
- `state.yaml` - rewritten to structured form, `status: archived`, with
  `archive_reason` documenting the delivery-outside-tracking outcome

## Note on the tasks artifact

The archived `tasks.md` contains a draft task breakdown that was never applied
under a real SDD execution (state marked implementation not done). It is
preserved unmodified as planning history; it does not represent completed,
shippable work and was not used as an authoritative completion ledger.

## SDD Lifecycle Outcome

This change is closed as **archived planning-only** with an honest record:
delivered via the codebase and the benchmark pipeline
(`docs/benchmark-analysis.md`), not via this change's SDD spec flow; no
specs/tasks existed to verify in this lineage. Ready for the next change.