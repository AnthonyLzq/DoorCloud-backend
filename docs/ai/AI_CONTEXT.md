# AI Context - DoorCloud Backend

## Critical rules

DO NOT read unless explicitly required:
- `pnpm-lock.yaml`
- `metrics/**`
- `.goals/**`
- `openspec/changes/archive/**`
- `*.png`, `*.csv`
- `docs/face-recognition-*.md`

Prefer targeted search with `rg` before reading whole files.

## Key flows

### MQTT Photo Flow

```
HTTP route -> MQTT publish -> Python IPC -> Face recognition -> MQTT response
```

Files (all under `apps/backend`):
- `src/network/http/routes/setup.ts` - HTTP entry point
- `src/network/mqtt/routes/photo.ts` - MQTT handler
- `src/services/face-recognition/python-manager.ts` - IPC manager
- `scripts/face_recognition_server.py` - Python worker
- `test/mqtt.integration.test.ts` - Integration tests

### Python IPC Contract

Request format:
```json
{
  "id": 1,
  "method": "load_model",
  "args": ["model-name", {"type": "dlib", "path": "..."}]
}
```

Response format:
```json
{
  "id": 1,
  "success": true,
  "model": "model-name"
}
```

Protocol: JSON-line over stdin/stdout pipes. All Python prints must use `flush=True`.

### HTTP Routes

Files (all under `apps/backend`):
- `src/network/http/routes/setup.ts` - Setup endpoints; serves the SPA
- `src/network/http/routes/admin-photos.ts` - Photo admin API (Bearer `SETUP_TOKEN`)
- `src/services/user.ts` - User service
- `src/storage/photos.ts` - Local photo storage (disk)

### Web app (SPA)

`apps/web` is a Preact SPA served same-origin by the backend (hash routing),
absorbing the old `renderSetupHtml` page and adding the photo admin:

- `src/views/Setup.tsx` - pairing flow driven by `createSetupController`
- `src/views/Admin.tsx` - person CRUD + unidentified tray (owner protected)
- Talks to `/setup/*` and `/admin/photos/*` (Bearer `SETUP_TOKEN` from localStorage)
- Built to `apps/web/dist`; served via `@fastify/static` at `/` and `/setup`
  (`WEB_DIST` env, default `apps/web/dist`); the `/admin/*` API wins over static

`packages/shared` holds the zod DTOs (`@doorcloud/shared`) both sides validate
against (consumed as built `dist` via `workspace:*`).

### WhatsApp Integration

Files:
- `src/integrations/whatsapp/setup.ts` - WhatsApp setup
- `src/integrations/whatsapp/openwa.ts` - OpenWA client

## Critical files (do not refactor without tests)

- `apps/backend/src/services/face-recognition/python-manager.ts` (434 lines, IPC critical)
- `apps/backend/src/services/face-recognition/onnx-provider.ts` (ONNX runtime)
- `apps/backend/src/network/mqtt/mqtt.ts` (MQTT client)
- `apps/backend/scripts/face_recognition_server.py` (Python IPC server)

## Architecture overview

- **HTTP**: Fastify routes in `apps/backend/src/network/http/`
- **MQTT**: Client in `apps/backend/src/network/mqtt/`
- **Face recognition**: Hybrid ONNX (Node.js) + Python process
- **WhatsApp**: OpenWA integration in `apps/backend/src/integrations/whatsapp/`
- **Web app**: Preact SPA in `apps/web` (setup + photo admin)
- **Shared DTOs**: zod schemas in `packages/shared` (`@doorcloud/shared`)
- **Storage**: Photos on disk via `apps/backend/src/storage/photos.ts` served at `/photos`; user state via `src/storage/state.ts` (SQLite)
- **Config**: Environment validation in `apps/backend/src/config/env.ts`

## Local storage

Photos:
- `PHOTOS_DIR/{Person}/...` — one folder per KNOWN person; the folder name IS
  the identity (`Bryan Ramos`, `Henry Cordero`, `Diana Kevans`, ...), files
  inside may be named anything
- Verification ALWAYS compares the probe against every person folder:
  `listDirectories()` + `list()` in `src/storage/photos.ts`; `user.ts` builds
  reference photos with a Promise.all over folders
- Matched door photos are stored back into that person's folder
  (`{foundName}-{uuid}.{ext}`); unmatched photos go to the reserved
  `PHOTOS_DIR/unidentified/` tray (`UNIDENTIFIED_FOLDER`, `{uuid}.{ext}`) and
  are excluded from `listDirectories()` — a person folder never re-uses them
- The admin photo API (`/admin/photos/*`, Bearer `SETUP_TOKEN`) lists/creates/
  renames/deletes persons and photos and can promote tray photos into a
  person folder (move); the owner folder (`USER_NAME`) can never be renamed
  or deleted from the UI
- Uploads keep the client file name (sanitized + uuid); served statically at
  `GET /photos/*`; URLs built from `PHOTOS_BASE_URL`
- `src/storage/photos.ts` - `PhotoStorage` interface
  (upload/list/listDirectories/getUrl) + tray primitives

User config and state:
- Single user from `USER_NAME` (`src/config/user.ts`); `USER_PHONE` optional;
  photos live under `PHOTOS_DIR/{USER_NAME}`
- `last_message_at` persisted in SQLite `data/app-state.db`, table
  `user_state(id, last_message_at)` under the fixed `local` key, via
  `src/storage/state.ts`

Backup:
- `scripts/photos-backup.ts` - `pnpm photos:backup` copies `PHOTOS_DIR` to a
  local folder or a signed webhook

## Error handling patterns

**Python IPC:**
- Timeout: 30s default
- Auto-restart: up to 3 attempts on crash
- Pending requests rejected on process death

**MQTT:**
- Subscription errors logged and rejected
- Message processing errors caught and logged
- Connection loss requires manual intervention

**HTTP:**
- CustomError class with status codes
- Storage errors throw 500
- Validation errors return 400

## Testing

```bash
pnpm test:local     # Unit tests
pnpm test:mqtt      # MQTT integration (requires Docker)
pnpm typecheck      # Type checking
pnpm lint           # Linting
```

## Code conventions

- No semicolons
- Single quotes
- 80 char line limit
- No emojis in code/commits/docs
- Absolute imports from `src/`
- Zod for validation
- Conventional commits
