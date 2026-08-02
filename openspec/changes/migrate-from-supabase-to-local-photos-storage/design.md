# Design: Migrate from Supabase to a local photos storage

## Technical Approach

Replace both Supabase concerns — the `users` table and the `photos` storage bucket — with local primitives: photos live on disk under `PHOTOS_DIR` and are served by `@fastify/static` at `GET /photos/*`; the single user is resolved from `USER_*` env via a new `src/config/user.ts`; a backup CLI (`pnpm photos:backup`) copies `PHOTOS_DIR` to a local folder or a signed webhook. The `verify()` fetch-by-URL contract is preserved so the critical face-recognition service and its tests stay untouched. Covers photo-storage RF-1..RF-7, user-config RF-1..RF-4, face-verification RF-7.

## Architecture Decisions

| # | Option | Tradeoff | Decision |
|---|---|---|---|
| D1 | Static route | @fastify/static: root-restricted (blocks `../` and absolute segments), MIME/etag built in; new dep. Custom `sendFile` route: no dep but hand-rolled traversal defense + MIME | `@fastify/static` v8+ (RF-4) |
| D2 | verify() input | URL fetch: leaves `face-recognition/index.ts` untouched, reuses tests; photos public + HTTP round-trip (OK for single-instance; OpenWA needs a public URL anyway). Disk reads: tighter, but churns a critical file and still needs a serving route | Keep URL contract (RF-7) |
| D3 | Backup destinations | Specs require both local folder (RF-6) and webhook (RF-7) | `--dest <path|url>` selects strategy; both implemented |
| D4 | HMAC scheme | Per-file bearer vs HMAC over raw body + timestamp: HMAC is tamper-evident and replay-bounded | HMAC-SHA256 lowercase hex in `X-DoorCloud-Signature`; `X-DoorCloud-Timestamp` (Unix ms); receiver SHOULD reject stale (RF-7) |
| D5 | Directory layout | Preserve current naming vs redesign | Preserve: verified `{name}-{id}/{fieldname}-{uuid}.{ext}`, no-match numeric-timestamp prefix (RF-1/RF-2); no renaming migration |
| D6 | @supabase deps | Drop both vs keep unused | Drop `@supabase/postgrest-js` + `@supabase/supabase-js` (no runtime use; success criteria) |
| D7 | Module home | `src/storage/photos.ts` (proposal) vs `src/services/photo-storage` vs `src/database/local` | `src/storage/photos.ts` behind a `PhotoStorage` interface; `src/database/*` deleted (only held supabase) |
| D8 | lastMessage persistence | In-memory (resets on restart) vs SQLite-backed | SQLite via `node:sqlite` `DatabaseSync` in a small `src/storage/state.ts` (table `user_state(id, last_message_at)`), reusing the `data/benchmarks.db` precedent (`src/services/benchmark/storage.ts`); persists across restarts exactly like the old Supabase row (RF-2) |

## Data Flow

```
MQTT photo/send ─► sendPhotoThroughWhatsapp
                      ├─ list(PHOTOS_DIR/{name}-{id}) ─filter no-match──┐
                      │                                                 ▼
                      │                            build {PHOTOS_BASE_URL}/{path} URLs
                      │                                                 ▼
                      │                                           verify(urls) ─► fetch per-url, 10s timeout
                      ├─ upload(no-match → numeric prefix, else {name}-{id}/...)
                      └─ OpenWA send-image({PHOTOS_BASE_URL}/...)   [permanent, no 900s expiry]
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/storage/photos.ts` | Create | `PhotoStorage` interface + disk impl (upload/list/getUrl) over `PHOTOS_DIR` |
| `src/config/user.ts` | Create | Active user `{id, name, phone}` resolved from `getEnv()` |
| `src/storage/state.ts` | Create | `UserState` module over `node:sqlite` `DatabaseSync` (`data/app-state.db`, table `user_state(id, last_message_at)`); persists `lastMessage` across restarts |
| `src/config/env.ts` | Modify | Remove `SUPABASE_URL`/`SUPABASE_KEY`; add `PHOTOS_DIR`, `PHOTOS_BASE_URL`, `USER_ID/NAME/PHONE`, optional `BACKUP_DEST/SECRET` |
| `src/network/server.ts` | Modify | Drop `supabaseConnection` init (line 68); register `@fastify/static` in `#config()` |
| `src/network/http/routes/user.ts` | Modify | Remove `POST /api/user` create route; keep `/:folderID/upload` |
| `src/services/user.ts` | Modify | Use `photoStorage` + `getActiveUser()`; `lastMessage` read/write via `UserState`; no DB queries |
| `src/database/**` | Delete | supabase module, `database` barrel, types |
| `scripts/photos-backup.ts` | Create | Backup CLI (folder copy / signed webhook) |
| `package.json` | Modify | Drop `@supabase/*` deps, add `@fastify/static`, add `photos:backup` script |
| `.env.example` | Modify | Swap `SUPABASE_*` for `PHOTOS_*`/`USER_*`/`BACKUP_*` |
| `src/services/face-recognition/index.ts` | Unchanged | verify() URL contract preserved |
| `test/user.test.ts`, `test/server.test.ts`, `test/index.test.ts` | Modify | Re-point mocks off `../src/database` |
| `test/photo-storage.test.ts`, `test/photos-backup.test.ts` | Create | New unit coverage |

## Interfaces / Contracts

```ts
// src/storage/photos.ts
export interface PhotoStorage {
  upload(userFolder: string, filename: string, buffer: Buffer): Promise<string> // relative path
  list(userFolder: string): Promise<string[]>         // file names; no-match exclusion stays in user.ts
  getUrl(relativePath: string): string                // `${PHOTOS_BASE_URL}/${relativePath}`
}
```

Backup CLI contract:
```
pnpm photos:backup --dest <folder|http(s) url> [--secret <s>] [--dry-run]
  dest is a URL → per-file POST `${dest}?path=<rel>`, body=raw bytes,
    headers: X-DoorCloud-Signature=hex(hmac-sha256(body, secret)), X-DoorCloud-Timestamp=ms
  else recursive fs.cp into dest, overwriting existing files (RF-6)
  exit 0 all ok; 1 any failure; env fallback BACKUP_DEST / BACKUP_SECRET
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | photo-storage upload/list/getUrl, no-match filtering, traversal-safe paths | tmp dir via `mkdtempSync`, real fs |
| Unit | static route: `200` for stored file; `../` / absolute segment → `4xx` | Fastify `app.inject` |
| Unit | user.ts with storage + user-config mocked: verify URL list, CSV, WhatsApp, no-match write path | mock `src/storage/photos`, `src/config/user` |
| Unit | `UserState` (state.ts): write/read `last_message_at`, restart survival, greeting gating (first photo / >16h) | temp db file via `mkdtempSync`/explicit path + `unlinkSync` cleanup, mirroring `test/benchmark-storage.test.ts` |
| Unit | backup CLI: folder copy + overwrite, webhook HMAC header, non-2xx → exit 1, dry-run | mocked `fetch`/fs; argv injection |
| Env | `parseEnv` accepts new vars; rejects missing `PHOTOS_DIR`; no `SUPABASE_*` required | `test/index.test.ts` `validEnv` |
| Integration | `test/mqtt.integration.test.ts` | Unchanged (broker-only, no supabase) |

## Threat Matrix

N/A — no git/PR automation, subprocess, or executable-classification boundary is introduced. Web path-traversal is not part of this matrix; it is covered by spec RF-4 and the static-route unit tests above.

## Migration / Rollout

Pre-cutover: download current bucket contents into `PHOTOS_DIR` preserving the `{name}-{id}/...` layout. `.env`: delete `SUPABASE_URL`/`SUPABASE_KEY`; add `PHOTOS_DIR`, `PHOTOS_BASE_URL`, `USER_ID`, `USER_NAME`, `USER_PHONE`. Removing them from the schema makes stale vars ignored. Rollback = `git revert` + restore `SUPABASE_*` env; disk photos are re-uploadable to the bucket via the backup CLI.

## Open Questions

- [ ] Confirm `PHOTOS_BASE_URL` value (host-reachable; Docker caveat for OpenWA) — deployment-specific, document with no code default.
