# Design: Strix Hardening Fixes

## Technical Approach

Thin, additive deltas over the existing Fastify auth/upload surfaces. The only architectural fork is the dual-header auth layering (F-01), resolved by exempting the Bearer-governed API prefixes from the global Basic hook. Each fix is localized and ships with a unit test; no line budget is in effect, so the whole change lands as one PR direct to main. Maps to specs: auth-fail-closed AUTH-4, http-security-hardening REQ-1/REQ-2/REQ-9, photo-storage RF-12/RF-13, photo-admin-api PA-3/PA-7.

## Architecture Decisions

### Decision: Basic↔Bearer layering (F-01)

**Choice**: Extend `isExemptPath` in `web-auth.ts` to also exempt `/admin` and `/setup`, so those prefixes are authorized only by the route-level Bearer `setupAuthMiddleware`. Basic stays on `/` (SPA) and `/assets`.
**Alternatives considered**: Move `webAuth` off the global hook and annotate each route (invasive, future routes skip Basic); make webAuth accept Bearer (muddies the layering, would silently drop Basic intent); proxy-level Basic (deployment-coupled).
**Rationale**: Fastify runs global `preHandler` hooks before route-level hooks, so a prefix exemption lets the Bearer middleware win without reordering. The admin/setup data is already Bearer-gated; only the empty `/setup` SPA page becomes publicly reachable (JS-only, no secrets). This is the smallest change that restores availability.

### Decision: Upload content validation (U-01)

**Choice**: Sniff magic bytes in a new small helper `apps/backend/src/utils/image-validation.ts` (the existing shared utils module) -> `validateImage(buffer, declaredMimetype): { ext, mimetype }`, and derive the stored extension from the sniffed content, not the client mimetype. Reject non-image types (400/415).
**Alternatives considered**: Rely on client mimetype allowlist (spoofable); decode via sharp (heavier, but catches corrupted files).
**Rationale**: Magic-byte sniff is cheap and sufficient to prevent content-planting, and the serving allowlist (`photos.ts`) already defends content-type on read. Reuses the exact set the face-recognition pipeline consumes (jpeg/png/webp/gif).

### Decision: Upload size limits + robust errors (U-02/U-03)

**Choice**: Give `/api/user/upload` its own multipart limits via `request.parts({ limits: { files: 1, fileSize } })` (mirroring `ADMIN_UPLOAD_LIMITS`), and map Fastify's `FST_REQ_FILE_TOO_LARGE` to 413 and empty/malformed body to 400 (never 500).
**Alternatives considered**: Globally set `fileSize`/`files:1` (over-constrains the admin bulk upload); leave status mapping to the generic error handler (keeps 500).
**Rationale**: Per-route limits preserve the admin bulk path while bounding the Basic-only write primitive; explicit 413/400 gives the client actionable feedback and stops the empty-body 500.

## Data Flow

```
Request ──▶ webAuthMiddleware (global preHandler)
             │  isExemptPath? /healthz /photos /admin /setup → skip Basic
             │  else → require Basic (/, /assets)
             ▼
Route-level preHandler (setupAuth: Bearer) for /admin + /setup
             ▼
Handler (upload/renames/delete/serve)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/backend/src/utils/image-validation.ts` | Create | Magic-byte sniff -> `{ ext, mimetype }`, reject non-image |
| `network/http/middleware/web-auth.ts` | Modify | `isExemptPath` adds `/admin`, `/setup` (F-01) |
| `network/server.ts` | Modify | CORS dev default (no `origin:true` reflection) |
| `network/http/routes/user.ts` | Modify | Per-route multipart limits + 413/400 mapping |
| `services/user.ts` | Modify | Use `validateImage`; derive ext from sniff |
| `network/http/routes/admin-photos.ts` | Modify | Owner guards (create `name`, rename `to`); filename `.`/`..` reject; use `validateImage` |
| `network/http/routes/photos.ts` | Modify | `Content-Disposition` on signed serve |
| `test/web-auth.test.ts, user.test.ts, admin-photos.test.ts` | Modify | New cases per fix |

## Interfaces / Contracts

```ts
// utils/image-validation.ts
export declare function validateImage(
  buffer: Buffer,
  declaredMimetype: string
): { ext: string; mimetype: string } // throws 400/415 if not allowed
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `validateImage` sniffing (each format + reject) | `user.test.ts` / new `image-validation.test.ts` |
| Unit | F-01 exempt paths (admin/setup reachable w/ Bearer; `/` needs Basic) | `web-auth.test.ts` |
| Unit | Owner guards (`name===USER_NAME` create, `to===USER_NAME` rename, `.`/`..`) | `admin-photos.test.ts` |
| Unit | Upload limits → 413; empty body → 400; CORS dev default | `user.test.ts`, `server.test.ts` |
| Integration | MQTT not touched | existing suites stay green |

## Threat Matrix

`N/A — no shell commands, subprocesses, VCS/PR automation, executable-file classification, or process-integration boundary is introduced or changed; this change adjusts Fastify HTTP middleware/routes only.`

## Migration / Rollout

No data migration. One PR to main; additive guards are non-breaking, and the only behavioral change (CORS dev default) does not affect the same-origin SPA.

## Open Questions

- [ ] None blocking — all technical choices are decided above.
