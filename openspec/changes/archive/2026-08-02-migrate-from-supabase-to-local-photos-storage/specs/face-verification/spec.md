# Delta for Face Verification

## ADDED Requirements

### RF-7: Stored-photo URLs fetched from signed local serving

The system SHALL keep `verify()` fetching each stored photo over HTTP by URL,
now sourced from the local photo-storage signed URL route (HMAC-SHA256,
30-second expiry) instead of Supabase signed URLs, with the same per-fetch
timeout (`VERIFY_FETCH_TIMEOUT_MS`) and photo cap (`FACE_VERIFY_MAX_PHOTOS`).
The `verify()` signature and the `user.ts → verify()` URL-list flow SHALL
remain unchanged.

#### Scenario: Verify against signed URLs (end-to-end)

- GIVEN stored photos are served under signed URLs rooted at `PHOTOS_BASE_URL`
- WHEN `verify(buffer, [{name, url}], opts)` runs with those URLs
- THEN each stored photo SHALL be downloaded over HTTP with the per-fetch timeout
- AND the result SHALL be `{match, name, similarity?}` as before

#### Scenario: Fetch timeout preserved

- GIVEN a stored-photo URL is unreachable
- WHEN `verify()` fetches it
- THEN the fetch SHALL abort after `VERIFY_FETCH_TIMEOUT_MS`
- AND the verification SHALL not hang
