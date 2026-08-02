# Tasks: Migrate from Supabase to a local photos storage

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,500-1,700 (adds + deletions, incl. ~220 deleted) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 to PR 6 (stacked) |
| Delivery strategy | exception-ok |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Foundation: env + PhotoStorage + user config | PR 1 | `pnpm test:local test/photo-storage.test.ts test/index.test.ts` | `pnpm typecheck && pnpm lint` | Revert env.ts/.env.example; storage module unused |
| 2 | Static route + UserState | PR 2 | `pnpm test:local test/server.test.ts test/state.test.ts` | curl `GET /photos/<file>` | Revert server.ts static + state.ts (no consumer) |
| 3 | user.ts rewire + route removal | PR 3 | `pnpm test:local test/user.test.ts` | `pnpm typecheck` | Revert services/user.ts, routes/user.ts, schemas |
| 4 | Supabase removal + test re-point | PR 4 | `pnpm test:local && pnpm typecheck` | `rg @supabase src/` empty | Restore src/database/* + deps |
| 5 | Backup CLI | PR 5 | `pnpm test:local test/photos-backup.test.ts` | `pnpm photos:backup --dest /tmp/x --dry-run` | Revert scripts/photos-backup.ts + script |
| 6 | Docs + final gates | PR 6 | `pnpm test:local && pnpm typecheck && pnpm lint` | N/A (docs only) | Revert README/CHANGELOG |

## Phase 1: Foundation (env, photo storage, user config)

- [x] 1.1 RED: Extend `test/index.test.ts` env suite: `parseEnv` accepts `PHOTOS_DIR`/`PHOTOS_BASE_URL`/`USER_*`/`BACKUP_*` and succeeds with no `SUPABASE_*`; missing `PHOTOS_DIR` throws Zod error. Depends: none.
- [x] 1.2 GREEN: `src/config/env.ts`: drop `SUPABASE_URL`/`SUPABASE_KEY`; add required `PHOTOS_DIR`, `PHOTOS_BASE_URL`, `USER_ID`, `USER_NAME`, `USER_PHONE`; optional `BACKUP_DEST`/`BACKUP_SECRET`. Depends: 1.1.
- [x] 1.3 RED: New `test/photo-storage.test.ts` (tmp `PHOTOS_DIR` via `mkdtempSync`): upload writes `{name}-{id}/{fieldname}-{uuid}.{ext}`; list excludes numeric-prefix; getUrl = `{PHOTOS_BASE_URL}/{path}`; `../` path rejected. Depends: 1.2.
- [x] 1.4 GREEN: `src/storage/photos.ts`: `PhotoStorage` interface + disk impl over `PHOTOS_DIR` (upload/list/getUrl, traversal-safe path join). Depends: 1.3.
- [x] 1.5 GREEN: `src/config/user.ts`: `getActiveUser()` returns immutable `{id, name, phone}` from `getEnv()`. Depends: 1.2.
- [x] 1.6 GREEN: `.env.example`: swap `SUPABASE_*` for `PHOTOS_*`/`USER_*`/`BACKUP_*`. Depends: 1.2.

## Phase 2: Static serving + UserState persistence

- [x] 2.1 RED: `test/server.test.ts`: `GET /photos/<stored>` returns 200; `../` and absolute segment return 4xx and never read outside root. Depends: 1.2.
- [x] 2.2 GREEN: `src/network/server.ts` `#config()`: register `@fastify/static` at `/photos` rooted at `PHOTOS_DIR`. Depends: 2.1.
- [x] 2.3 RED: New `test/state.test.ts` (temp db via `mkdtempSync` + `unlinkSync`, mirroring `test/benchmark-storage.test.ts`): UserState writes/reads `last_message_at`; new instance on same file persists (restart survival). Depends: 1.2.
- [x] 2.4 GREEN: `src/storage/state.ts`: `UserState` over `node:sqlite` `DatabaseSync` (`data/app-state.db`, table `user_state(id, last_message_at)`). Depends: 2.3.

## Phase 3: Core rewiring (user service + routes)

- [x] 3.1 RED: Rewrite `test/user.test.ts` mocks off `../src/database` onto `../src/storage/photos`, `../src/config/user`, `../src/storage/state`; keep verify-call shape, no-match filter, CSV/WhatsApp contract, no-match upload write, greeting gating (null / >16h). Depends: 1.4, 1.5, 2.4.
- [x] 3.2 GREEN: `src/services/user.ts`: replace DB calls with `photoStorage` + `getActiveUser()` + `UserState`; numeric-prefix no-match write; build static URLs. Depends: 3.1.
- [x] 3.3 RED: Route test via `app.inject`: `POST /api/user` returns 404; `POST /api/user/:folderID/upload` still validates. Depends: 3.2.
- [x] 3.4 GREEN: `src/network/http/routes/user.ts`: remove create route, keep upload; `src/schemas/userSchemas.ts`: remove `userSchema`, keep `uploadUserPhotoParamsSchema`. Depends: 3.3.

## Phase 4: Supabase removal

- [x] 4.1 RED: `test/server.test.ts`: drop `supabaseConnection` mock; assert no supabase instantiation; static route registered. Depends: 3.2.
- [x] 4.2 GREEN: delete `src/database/**` (supabase module + `database` barrel); remove `supabaseConnection`/`database` imports from `server.ts`/`user.ts`; drop `@supabase/*` deps, add `@fastify/static` in `package.json`. Depends: 4.1.
- [x] 4.3 GREEN: `test/index.test.ts` `validEnv`: swap `SUPABASE_*` for `PHOTOS_*`/`USER_*`. Depends: 4.2.
- [x] 4.4 GATE: `pnpm test:local && pnpm typecheck && pnpm lint` green; no `@supabase` in `src/` or `package.json`. Depends: 4.2.

## Phase 5: Backup CLI

- [x] 5.1 RED: New `test/photos-backup.test.ts` (mocked `fetch`/fs, argv injection): folder copy preserves relative paths + overwrite; webhook POST raw bytes with HMAC-SHA256 hex header + timestamp; non-2xx -> exit 1; unwritable dest -> non-zero; dry-run writes nothing. Depends: 1.2.
- [x] 5.2 GREEN: `scripts/photos-backup.ts`: `--dest <folder|url>`, `--secret`, `--dry-run`; env fallback `BACKUP_DEST`/`BACKUP_SECRET`; exit 0 all-ok / 1 any-failure. Depends: 5.1.
- [x] 5.3 GREEN: `package.json`: add `photos:backup` script. Depends: 5.2.

## Phase 6: Docs and verification

- [x] 6.1 README: `PHOTOS_DIR`/`PHOTOS_BASE_URL` (Docker caveat)/`USER_*`/`BACKUP_*` and backup CLI usage. Depends: 5.2.
- [x] 6.2 CHANGELOG: rollout note incl. `.env` migration (delete `SUPABASE_*`). Depends: 6.1.
- [x] 6.3 GATE: full `pnpm test:local && pnpm typecheck && pnpm lint`; confirm `verify()` runs against local static URLs. Depends: 6.1.
