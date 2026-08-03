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

Files:
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

Files:
- `src/network/http/routes/setup.ts` - Setup endpoints
- `src/services/user.ts` - User service
- `src/storage/photos.ts` - Local photo storage (disk)

### WhatsApp Integration

Files:
- `src/integrations/whatsapp/setup.ts` - WhatsApp setup
- `src/integrations/whatsapp/openwa.ts` - OpenWA client

## Critical files (do not refactor without tests)

- `src/services/face-recognition/python-manager.ts` (434 lines, IPC critical)
- `src/services/face-recognition/onnx-provider.ts` (ONNX runtime)
- `src/network/mqtt/mqtt.ts` (MQTT client)
- `scripts/face_recognition_server.py` (Python IPC server)

## Architecture overview

- **HTTP**: Fastify routes in `src/network/http/`
- **MQTT**: Client in `src/network/mqtt/`
- **Face recognition**: Hybrid ONNX (Node.js) + Python process
- **WhatsApp**: OpenWA integration in `src/integrations/whatsapp/`
- **Storage**: Photos on disk via `src/storage/photos.ts` served at `/photos`; user state via `src/storage/state.ts` (SQLite)
- **Config**: Environment validation in `src/config/env.ts`

## Local storage

Photos:
- `PHOTOS_DIR/{Person}/...` — one folder per KNOWN person; the folder name IS
  the identity (`Bryan Ramos`, `Henry Cordero`, `Diana Kevans`, ...), files
  inside may be named anything
- Verification ALWAYS compares the probe against every person folder:
  `listDirectories()` + `list()` in `src/storage/photos.ts`; `user.ts` builds
  reference photos with a Promise.all over folders
- Matched door photos are stored back into that person's folder
  (`{foundName}-{uuid}.{ext}`); unmatched go to `PHOTOS_DIR/{USER_NAME}` with
  a numeric-timestamp prefix (never re-used as reference)
- Uploads keep the client file name (sanitized + uuid); served statically at
  `GET /photos/*`; URLs built from `PHOTOS_BASE_URL`
- `src/storage/photos.ts` - `PhotoStorage` interface
  (upload/list/listDirectories/getUrl)

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
