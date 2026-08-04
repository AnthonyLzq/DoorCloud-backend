# Proposal: pnpm Monorepo + Preact Config Web App

## Intent

Config UI is inline HTML (untestable, manual pairing); build BROKEN (`dist/src/...` vs `dist/index.js` — Docker crash-loops); no photo management; unmatched photos pollute owner folder. Fix: workspace reshape, Preact SPA, unidentified tray.

## Scope

### In Scope
- Workspace: `apps/backend` (moved as-is), `apps/web`, `packages/shared` (`workspace:*`)
- SPA at `/`: setup (absorbs openwa-setup-ux) + photo admin; `GET /setup` serves it; inline HTML dropped
- `/admin/photos` API (SETUP_TOKEN) + storage primitives
- Unidentified tray: unmatched → `unidentified/`; promote/delete; excluded from `listDirectories()`
- M1 build fix; CI/Dockerfile/docs

### Out of Scope
Benchmark repackaging, QR expiry auto-refresh, other setup features, trash folder

## Capabilities

### New Capabilities
- `web-front`: SPA — setup UX (3s poll cap 20, auto-QR, page-load per state, 3-failure cap, manual recovery) + photo admin + tray
- `photo-admin-api`: persons CRUD (`?confirm=true`), photos list/upload/delete, promote; owner-folder guard

### Modified Capabilities
- `photo-storage`: no-match sink → `unidentified/`; excluded from listing; create/rename/deleteFolder, delete/movePhoto
- `user-config`: owner folder stays clean; never renamed/deleted from UI

## Approach

- **M1**: reshape workspace; move src/bin/test/configs → `apps/backend`; root = orchestrator; repoint 12 benchmark scripts; FIX tsc emit + `start`; module-relative paths. Gate: tests, typecheck, lint, `docker build`, boot
- **M2**: zod DTOs (admin, setup, envelope) → shared
- **M3**: Preact app; admin routes + primitives; `@fastify/static` at `/` (prod), Vite proxy (dev); per-route multipart limits
- **M4**: CI, docs, `.env` on Pi
- Preact: ~4 KB, React-compatible, user's choice (Svelte 5 overridden)

## Alternatives

Svelte 5, vanilla, keep-at-root, wait-qr, trash folder — rejected

## Affected Areas

| Area | Impact |
|------|--------|
| `pnpm-workspace.yaml`, root `package.json`, `apps/backend/*` | Mod/Moved |
| `storage/photos.ts`, `services/user.ts` | Modified |
| `routes/{setup,admin-photos}.ts`, `server.ts` | Mod/New |
| `scripts/*.ts` (12), `Dockerfile`, workflows, docs | Modified |
| `apps/web/**`, `packages/shared/**` | New |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| cwd-path regression (face rec silent fail) | Med | module-relative, boot gate |
| Owner-folder delete/rename | Low | guards + safeJoin |
| Docker build | Med | M1 gate |
| Multipart limits too low | Med | per-route |

## Rollback Plan

Git-revert per commit (M1–M4 independent); `photos:backup` covers deletes.

## Dependencies

Vite, Preact, `@fastify/static` (declared), zod, `workspace:*`.

## Success Criteria

- [ ] Fresh build + Docker boot
- [ ] Setup self-drives (polls, auto-QR, failure cap)
- [ ] Photo CRUD + promote/delete; owner protected
- [ ] Unmatched → `unidentified/`; person folders clean
- [ ] test:local, typecheck, lint pass (workspace)

## Open Questions

- Setup token in localStorage (assumed)
- Promote = move, not copy (assumed)
- M1 build-fix in design (assumed)
- `renderSetupHtml` fallback until M3 (assumed)
