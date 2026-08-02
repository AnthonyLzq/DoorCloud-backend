# Archive Report: migrate-from-supabase-to-local-photos-storage

| Field | Value |
|-------|-------|
| Change | migrate-from-supabase-to-local-photos-storage |
| Archived to | `openspec/changes/archive/2026-08-02-migrate-from-supabase-to-local-photos-storage/` |
| Archived on | 2026-08-02 |
| Verdict | PASS |
| Tasks | 24/24 complete |
| Specs | photo-storage (7 requirements), user-config (4 requirements), face-verification (RF-7 delta) |
| Quality gates at close | 241/241 tests, typecheck clean, lint clean |

## Final-State Authority Note

The compact review `review-a3805487957597f8` was APPROVED (post-apply gate
allow) with a bounded 199-line correction that changed the photo serving
contract: `GET /photos/:signature/:expiresAt/*` now serves HMAC-SHA256 signed
URLs (PHOTOS_URL_SECRET, 30s expiry) instead of the plain static route, and
`DiskPhotoStorage.list()` returns `[]` on ENOENT instead of failing. HEAD is
`0f4bf90`; working tree clean. The archived specs in this folder reflect the
signed URL contract.

## Review Correction Summary

- CRITICAL R1-001 (photos served without auth): resolved by signed URL route
  with HMAC-SHA256 validation and 30s expiry; traversal/absolute paths and
  tampered/expired signatures rejected (400/404).
- CRITICAL R3-001 (ENOENT kills MQTT flow): resolved by `list()` returning
  `[]` on a missing user folder, matching Supabase behavior.
- WARNING/SUGGESTION findings from review-a3805487957597f8 were triaged as
  follow-ups; none blocked delivery.

## Verify Warnings at Close

The verify snapshot reported a WARNING that photo-storage RF-3/RF-4 and
face-verification RF-7 still described the old plain static route. The delta
specs were updated at archive time to reflect the signed URL contract, and the
base specs under `openspec/specs/photo-storage/` and
`openspec/specs/user-config/` were created/synced accordingly.
