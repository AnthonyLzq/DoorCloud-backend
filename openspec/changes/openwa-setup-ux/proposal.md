# Proposal: OpenWA Setup Page UX (auto-poll + auto-load QR)

## Intent

The `/setup` page (`renderSetupHtml`, `src/network/http/routes/setup.ts`) has no loading state or polling: after Start, users must manually re-click "Refresh status" and "Load QR". Goal: auto-poll ~3s, auto-load QR when ready, show clear failures — self-driving pairing. Frontend-only.

## Scope

### In Scope
- Extract UX into testable state machine `src/network/http/setup-ui.ts`
- Start button loading state (disabled, "Starting...") + double-start guard
- Auto-poll ~3s, capped ~20 polls (~60s); stop on `qr_ready` (auto-load QR), `connected`, `session: null`, or 3 failures
- Page load: `qr_ready` → auto QR; `connected` → status; else idle
- Manual "Load QR" / "Refresh status" remain as recovery
- Module delivery + Vitest coverage
- Docs: README (~297-302), `docs/ai/MESSAGE_FLOWS.md`

### Out of Scope
- Backend changes (endpoints, schemas, `integrations/whatsapp`)
- QR expiry auto-refresh, other setup features, dead-session auto-restart

## Capabilities

### New Capabilities
- `openwa-setup-ux`: `/setup` pairing UX — loading state, auto-poll, auto QR load, page-load handling, failure caps, manual recovery

### Modified Capabilities
None (user-config flow untouched)

## Approach

- `setup-ui.ts`: zero-import, dependency-injected `createSetupController({ request, elements, onStateChange })` + status-decision helper; `POLL_INTERVAL=3000`, `MAX_POLLS=20`, `MAX_FAILURES=3`.
- Delivery (no bundler): esbuild step `scripts/build-setup-ui.mjs` → `dist/public/setup-ui.js`; `renderSetupHtml` inlines it at startup (cached); wired into `preservice` + `build`; fail-fast if missing.
- Route handlers and endpoints unchanged.

## Alternatives Considered

- Inline JS only: untestable — rejected
- Backend `wait-qr`: long-held HTTP, duplicates CLI logic — rejected
- Serve tsc-emitted `dist` file: breaks `tsx` dev flow — rejected

## Affected Areas

| Area | Impact | Change |
|------|--------|--------|
| `src/network/http/setup-ui.ts` | New | State machine controller |
| `src/network/http/routes/setup.ts` | Modified | renderSetupHtml uses controller |
| `scripts/build-setup-ui.mjs` | New | esbuild compile step |
| `test/setup-ui.test.ts` | New | Fake timers + mocked fetch |
| `package.json` | Modified | esbuild devDep, script, preservice |
| `README.md`, `MESSAGE_FLOWS.md` | Modified | Auto-poll flow, soften manual order |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Unknown OpenWA statuses | Med | Keep polling by default; `session: null` short-circuits |
| esbuild dep rejected | Med | tsc-dist fallback |
| QR expires mid-scan | Low | Manual Load QR retained |

## Rollback Plan

Git-revert the commit; frontend-only, no data migration; page returns to manual flow.

## Dependencies

- esbuild (new devDependency, pending approval)
- Endpoints `/setup/openwa/status|start|qr` (unchanged)

## Success Criteria

- [ ] Start → disabled + "Starting..." → auto-poll → QR auto-loads
- [ ] Stops on `connected`; error on 3 failures or `session: null`
- [ ] Stops after ~20 polls; no concurrent polls on double-click
- [ ] Page load: `qr_ready` auto-QR, `connected` status, else idle
- [ ] `pnpm test:local`, `typecheck`, `lint` pass

## Open Questions / Assumptions

- esbuild devDependency assumed approved (fallback: tsc-dist prod-only)
- OpenWA statuses passed verbatim; unknown values keep polling
- "disconnected" stays manual — confirm at spec phase
