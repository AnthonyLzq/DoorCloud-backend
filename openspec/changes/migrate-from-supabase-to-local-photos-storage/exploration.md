# Exploration: Migrate from Supabase to a local photos storage

## Current State

Supabase is used for TWO distinct concerns:

1. **`users` table** (relational): `createUser`, `getUserByUserID`,
   `updateUserLastMessage` in `src/database/supabase/queries/user.ts`.
2. **`photos` storage bucket** (blob): `uploadUserPhoto`,
   `getPhotosUrls` (createSignedUrls), `getAllFilesFromBucket` (list) in the
   same file.

The client is a lazy singleton (`global.__supabaseClient__`) in
`src/database/supabase/connection.ts`, initialized at server startup via
`supabaseConnection(this.#app.log)` in `src/network/server.ts:68`. All
consumers import through `database` → `database/supabase` re-exports.

### Photo flow end-to-end

- **Ingress (real-time)**: MQTT topic `doorcloud/v1/photo/send` →
  `handlePhotoSend` in `src/network/mqtt/routes/photo.ts` →
  `UserServices.sendPhotoThroughWhatsapp(userID, format, buffer)`.
- **Ingress (HTTP)**: `POST /api/user/:folderID/upload` →
  `UserServices.uploadPhotos(folderID, files)` → uploads each file, returns
  900s signed URLs.
- **Reference fetch**: `getAllFilesFromBucket(`${name}-${id}`)` lists the
  folder, filters out no-match photos (numeric filename prefix), then
  `getPhotosUrls(paths, 900)` produces signed URLs →
  `faceRecognitionService.verify(bufferPhoto, [{name, url}], ...)`.
- **Verify**: `FaceRecognitionService.verify`
  (`src/services/face-recognition/index.ts:353`) downloads each stored photo
  via `fetch(photo.url)` with a per-fetch 10s timeout
  (`VERIFY_FETCH_TIMEOUT_MS`), capped at `FACE_VERIFY_MAX_PHOTOS` (10),
  requires `init({ mode: 'onnx' })`.
- **Result**: appends `metrics/matchPhoto.csv`
  (`src/services/user.ts:154`), uploads the incoming photo back to the bucket
  (no-match → numeric timestamp prefix, match → name prefix), then sends the
  resulting signed URL through OpenWA `send-image` via
  `sendPhotoDetectionResultThroughWhatsapp`
  (`src/integrations/whatsapp/utils.ts:41`) → `POST /api/sessions/:id/messages/send-image`
  with `{ url: imageUrl }`.

### Existing local-disk precedent

The app already writes to local disk:
- `metrics/matchPhoto.csv` (`src/services/user.ts:154`) and
  `metrics/receivePhoto.csv` (`src/network/mqtt/routes/photo.ts:53`) via
  `appendFileSync`.
- `data/benchmarks.db` via `node:sqlite` `DatabaseSync`
  (`src/services/benchmark/storage.ts:40`) — a full local SQLite persistence
  pattern already in the codebase.

## Affected Areas

- `src/database/supabase/queries/user.ts` — all 6 Supabase queries; the 3
  photo ones (`uploadUserPhoto`, `getPhotosUrls`, `getAllFilesFromBucket`)
  are the migration target.
- `src/database/supabase/connection.ts` — supabase client singleton.
- `src/database/supabase/types.ts` — `UserSupabase` type.
- `src/database/index.ts`, `src/database/supabase/index.ts`,
  `src/database/supabase/queries/index.ts` — re-export surface.
- `src/services/user.ts` — only consumer of photo storage
  (`uploadPhotos`, `sendPhotoThroughWhatsapp`); also uses `users` queries.
- `src/services/face-recognition/index.ts:397-427` — `verify()` fetches
  stored photos over HTTP by URL; the URL contract is the key coupling.
- `src/integrations/whatsapp/openwa.ts` / `utils.ts` — `send-image` needs an
  externally reachable URL for the incoming photo.
- `src/network/http/routes/user.ts` — HTTP upload route (unchanged contract).
- `src/network/server.ts` — supabase init on startup.
- `src/config/env.ts` — `SUPABASE_URL`, `SUPABASE_KEY` required (lines 126-129);
  would need `PHOTOS_DIR` (+ public base URL) for local storage.
- `src/config/constants.ts` — `MAX_STORED_PHOTOS`, `VERIFY_FETCH_TIMEOUT_MS`.
- `test/user.test.ts` — mocks `../src/database` (all 5 queries) and asserts
  URL-based `verify` contract + CSV writes.
- `test/server.test.ts` — mocks `supabaseConnection`, asserts it is called on
  start (line 90-97).
- `test/index.test.ts` — `validEnv` requires `SUPABASE_URL`/`SUPABASE_KEY`;
  env validation tests would change if schema changes.
- `.env.example` — `SUPABASE_URL`, `SUPABASE_KEY`.

## Approaches

1. **Local disk + Fastify static serving, keep URL verify contract** (photos only)
   - New storage module (e.g. `src/database/photos` or `src/storage/photos`)
     with `upload`, `list`, `getUrl` mirroring current query functions; write
     files under `PHOTOS_DIR`. Serve via `@fastify/static` (new dep) or a
     small route; return `PHOTOS_BASE_URL`-rooted URLs.
   - `verify()` keeps `fetch(url)` contract unchanged.
   - Pros: minimal change to the critical face-recognition service; reuses
     existing verify tests; URL semantics preserved.
   - Cons: photos become permanently public unless a token is added; new dep;
     still an HTTP round-trip per stored photo; needs `PHOTOS_BASE_URL` so
     OpenWA can reach the served image.
   - Effort: Medium.

2. **Local disk + direct file reads for verify, private URL only for WhatsApp**
   - `verify()` reads stored photos from disk via an injected reader instead
     of `fetch(url)`; a signed/private Fastify route serves only the URL
     OpenWA needs for `send-image`.
   - Pros: removes the signed-URL concept and per-fetch HTTP overhead; photos
     not publicly exposed; tighter coupling to local reality.
   - Cons: changes the `verify` contract and a "critical file"
     (`face-recognition/index.ts`); larger test churn.
   - Effort: High.

3. **Full local migration — photos + users table (SQLite precedent)**
   - Also move `users` CRUD to `node:sqlite` (pattern exists in
     `benchmark/storage.ts`), drop `@supabase/*` deps entirely.
   - Pros: single local persistence story; removes Supabase entirely.
   - Cons: much larger scope (user CRUD, data migration, backup story);
     contradicts the stated scope "photos storage" unless explicitly wanted.
   - Effort: High.

## Recommendation

Scope the change to **photos storage only**; keep the `users` table on
Supabase (the change title says "photos storage"). Start with Approach 1 for
low risk, but implement the storage behind an interface so Approach 2 can be
adopted later. Confirm with the user whether users should stay on Supabase.

## Risks

- **Verify URL contract**: `verify()` downloads photos over HTTP; local
  serving must be reachable, or `verify` must switch to disk reads.
- **OpenWA reachability**: `send-image` needs an externally reachable URL;
  a local-only URL breaks WhatsApp image delivery unless OpenWA runs on the
  same host/network as the backend.
- **Single-instance assumption**: local disk is not shared across replicas;
  Supabase is. Multi-instance deployment is incompatible with local disk.
- **No expiry**: signed URLs (900s) provide time-boxed access; a static
  route makes photos permanently public unless tokenized.
- **Backup story**: Supabase provides managed storage; local disk needs its
  own backup procedure.
- **Data migration**: existing bucket contents must be copied to local disk;
  no migration tooling exists yet.

## Open Questions

- Is the scope ONLY photos storage, or also the `users` table?
- Does OpenWA run on the same host/network as the backend (local URL OK)?
- Is the deployment single-instance or replicated?
- Should URLs stay time-boxed (signed) or become permanent public URLs?

## Ready for Proposal

Yes — scope question (users vs photos) must be confirmed with the user first.
