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
- `src/database/supabase/queries/user.ts` - User queries

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
- **Database**: Supabase in `src/database/supabase/`
- **Config**: Environment validation in `src/config/env.ts`

## Database schema (Supabase)

Tables:
- `users` - id, name, phone, lastMessage

Storage buckets:
- `photos` - User photo storage

Key queries:
- `createUser(name, phone)` - INSERT
- `getUserByUserID(id)` - SELECT
- `uploadUserPhoto(path, buffer)` - Storage upload
- `getPhotosUrls(paths, time)` - Signed URLs

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
- Database errors throw 500
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
