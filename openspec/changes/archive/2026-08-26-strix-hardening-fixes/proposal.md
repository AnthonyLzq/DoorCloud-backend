# Proposal: Strix Hardening Fixes

## Intent

Follow-up on the 2026-08-26 orchestrated pentest (`strix_runs/orchestrated-pentest/RESULTS.md`): 0 CRITICAL/HIGH, but 1 availability finding + 2 MEDIUM + several LOW/INFO remain. The SEC-01..14 base hardening held; these are the residual gaps. Fix the dual-auth clash that makes `/admin` and `/setup` unreachable, harden the upload chain, and close the small admin-guard gaps — one change, direct to main.

## Scope

### In Scope
- **F-01 (availability)**: exempt `/admin` + `/setup` from the global web Basic layer so Bearer (`setupAuth`) governs their APIs; Basic stays on `/` + `/assets`. (chosen: "Bearer en APIs")
- **U-01**: validate upload content (type allowlist + sniff) at write time on `/api/user/upload` and `/admin` upload; reject non-image.
- **U-02**: explicit `fileSize` + file limit + 413 mapping on `/api/user/upload`.
- **U-03/F-02**: 400/413 (not 500) for empty/malformed multipart.
- **A-01**: symmetric owner guard — reject `name === USER_NAME` on create, `to === USER_NAME` on rename.
- **A-02**: reject `.`/`..` photo filename (400) on delete.
- **U-04**: `Content-Disposition` on `/photos` signed-URL serve (defense-in-depth).
- **F-03**: no arbitrary-Origin reflection in dev CORS (explicit safe default).
- **A-03**: document the single-token owner model + a minimal guard; no RBAC overhaul.

### Out of Scope
- Full RBAC / multi-principal token model (A-03 redesign)
- MQTT topic naming changes; secret-handling (already done SEC-07)
- MQTT integration-test expansion

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `auth-fail-closed`: F-01 dual-auth — scope web Basic to SPA/static, exempt `/admin` + `/setup` (Bearer-only), define header precedence.
- `http-security-hardening`: F-03 CORS dev default; U-02/U-03 upload `fileSize` + 400/413.
- `photo-storage`: U-01 content-type validation on upload; U-04 `Content-Disposition` on signed serve.
- `photo-admin-api`: A-01 symmetric owner guard; A-02 `.`/`..` filename → 400.

## Approach

Small, low-risk deltas. F-01 is the only design fork (Basic vs Bearer over one `authorization` header): extend `isExemptPath` in `web-auth.ts` to exempt `/admin` + `/setup`, keeping Basic on `/` + `/assets`. Upload validation centralized as a small helper (allowed image extensions + content sniff). Each fix lands with its unit test; verified via `pnpm test:local`. No line budget in effect → all commits/one PR go direct to main.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `network/http/middleware/web-auth.ts` | Modified | Exempt `/admin` + `/setup` from Basic |
| `network/server.ts` | Modified | multipart limits; CORS dev default |
| `network/http/routes/user.ts` | Modified | `fileSize` + 400/413 |
| `services/user.ts` | Modified | content validation |
| `network/http/routes/admin-photos.ts` | Modified | owner guards + `.`/`..` filename |
| `network/http/routes/photos.ts` | Modified | `Content-Disposition` |
| `apps/backend/test/*` | Modified | tests per fix |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Exempting `/setup` from Basic exposes the empty setup SPA page | High | Data stays Bearer-gated; page is JS-only, no secrets |
| Content validation rejects legitimate uploads | Med | Allowlist covers all face-recognition formats (jpg/jpeg/png/webp/gif) + unit tests |
| CORS dev default break local SPA | Low | same-origin SPA unaffected; explicit dev default |

## Rollback Plan

One revertible commit per fix; all are additive guards. Reverting the `isExemptPath` change restores the prior (broken) behavior; keeping the guards is non-breaking.

## Dependencies

None (no new deps; reuse `http-errors`/`CustomError` for 400/413).

## Success Criteria

- [ ] `/admin` + `/setup` APIs reachable with Bearer; `/` + `/assets` behind Basic
- [ ] Upload rejects non-image (400); oversized → 413; empty → 400 (no 500)
- [ ] Rename to `USER_NAME` and create `USER_NAME` rejected; `.`/`..` filename → 400
- [ ] `/photos` serves `Content-Disposition`
- [ ] `pnpm test:local` green
