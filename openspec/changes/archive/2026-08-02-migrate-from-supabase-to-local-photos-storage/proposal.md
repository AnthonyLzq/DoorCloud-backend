# Proposal: Migrate from Supabase to a local photos storage

## Intent

Eliminate the Supabase dependency for a local, single-instance, single-user
deployment. Supabase currently backs two concerns: the `users` table (CRUD in
`src/database/supabase/queries/user.ts`) and the `photos` storage bucket
(upload / `createSignedUrls` / list). Both become local concerns: photos live
on disk under `PHOTOS_DIR`, and the single user is modeled as local config.
After this change `@supabase/*` is removed and `SUPABASE_URL`/`SUPABASE_KEY`
leave the env contract.

## Scope

### In Scope
- New local photo storage module (`upload`, `list`, `getUrl`) writing under `PHOTOS_DIR`.
- Serve photos via `@fastify/static` so the URL contract stays reachable for `verify()` and OpenWA `send-image`.
- Single user as local config (`USER_ID`, `USER_NAME`, `USER_PHONE` via Zod) replacing the `users` table; drop `POST /api/user` create route.
- Remove `src/database/supabase/` module, supabase init in `src/network/server.ts:68`, and `@supabase/supabase-js` + `@supabase/postgrest-js` deps.
- Env changes: remove `SUPABASE_URL`/`SUPABASE_KEY`, add `PHOTOS_DIR`, `PHOTOS_BASE_URL`, `USER_*`; update `.env.example`.
- Update tests (`test/user.test.ts`, `test/server.test.ts`, `test/index.test.ts`) and docs.
- Backup CLI (`pnpm photos:backup`): copies `PHOTOS_DIR` to a configurable destination — either a local folder path or a POST endpoint that emulates a webhook (signature + body) for remote pushes. Config passed via CLI args/env.

### Out of Scope
- Multi-user or multi-instance support.
- Cloud migration path or bucket sync.
- Scheduled backup automation (cron/systemd); the CLI is invoked manually or externally.
- Backup config UI (endpoint + minimal front form to set the local folder or webhook link, incl. webhook signature) — recorded as a future desire only (see note).

## Capabilities

### New Capabilities
- `photo-storage`: local disk photo upload, list, and URL generation served under `PHOTOS_DIR`.
- `user-config`: single local user (id, name, phone) resolved from env/config.

### Modified Capabilities
- `face-verification`: stored photo URLs now come from local static serving instead of Supabase signed URLs; the `verify()` fetch-by-URL contract is preserved.

## Approach

Use `@fastify/static` mounted at `/photos` over `PHOTOS_DIR`; the storage
module returns `PHOTOS_BASE_URL`-rooted URLs identical in shape to current
signed URLs. This single serving strategy satisfies **both** consumers:
`verify()` keeps its per-fetch-timeout HTTP download, and OpenWA `send-image`
gets the externally reachable URL it needs. Switching `verify()` to disk
reads would save nothing (a static route is required for OpenWA regardless)
and would churn the critical face-recognition service — so we keep the URL
contract. Tradeoff: photos become reachable on the network without auth;
acceptable for a local single-instance deployment, tokenization deferred.

`PHOTOS_BASE_URL` is the externally reachable base for served photos (e.g.
`http://<host>:1996/photos`). Both `verify()` (in-process) and OpenWA consume
it. OpenWA runs on the same host/network (default `http://localhost:2785`);
if it runs in Docker, `localhost` inside the container does not resolve to
the backend — `PHOTOS_BASE_URL` must be the host's reachable address.

`src/services/user.ts` reads the single user from config instead of the DB;
folder naming (`${name}-${id}`) and `uploadPhotos` validation stay. Supabase
removal is clean: delete the module, drop the `database` re-export, remove
the deps.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/database/supabase/*` | Removed | client, queries, types, re-exports |
| `src/storage/photos.ts` | New | upload/list/getUrl over `PHOTOS_DIR` |
| `src/network/http/routes/user.ts` | Modified | drop create route; validate against local user |
| `src/services/user.ts` | Modified | use local user config + storage module |
| `src/network/server.ts` | Modified | register static; remove supabase init |
| `src/config/env.ts`, `.env.example` | Modified | remove SUPABASE_*, add PHOTOS_*/USER_* |
| `src/config/user.ts` | New | single-user config shape |
| `src/services/face-recognition/index.ts` | Unchanged | verify() URL contract preserved |
| `test/*.ts` | Modified | re-point mocks to storage/user config |
| `package.json` | Modified | remove @supabase deps, add @fastify/static, add `photos:backup` script |
| `scripts/photos-backup.ts` | New | backup CLI: local folder copy or webhook POST (signature + body) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Verify contract breakage | Low | Keep URL fetch; static route mirrors signed-URL shape; re-use existing verify tests |
| OpenWA cannot reach local URLs | Med | Document `PHOTOS_BASE_URL` (host-reachable, Docker caveat) |
| Path traversal on `/photos` | Med | `@fastify/static` restricts to root; test traversal payloads |
| Tests churn (5 files mock supabase) | Med | Re-point mocks to storage module + user config; keep assertions |
| `.env` migration (SUPABASE_* removal) | Med | Remove from schema so stale vars are ignored; update `.env.example` |

## Rollback Plan

Revert commits: restore `src/database/supabase/`, the `database` re-export,
supabase init in `server.ts`, env schema, and deps. Photos already on disk
can be re-uploaded to the bucket via the backup CLI.

## Dependencies

- `@fastify/static` (new runtime dep).
- Existing `PHOTOS_DIR` contents copied from the current bucket before cutover.

## Success Criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test:local` pass with no supabase mocks.
- [ ] No `@supabase/*` in `package.json` or `src/`.
- [ ] `verify()` runs against local static URLs (existing tests green).
- [ ] OpenWA `send-image` delivers a served local URL.
- [ ] `.env.example` has no `SUPABASE_*`.
- [ ] `pnpm photos:backup` copies `PHOTOS_DIR` to a local folder and to a webhook POST endpoint.

## Backup Decision

Backup is **decided**: the backup CLI (`pnpm photos:backup`) is in scope as a
manual/external tool. Scheduled automation (cron/systemd) and the config UI
(endpoint + minimal front form to choose a local folder or webhook link with
signature) are deferred as a **future desire** — out of scope for this change.
