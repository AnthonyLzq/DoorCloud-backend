# Spec: Photo Storage

## Overview

Local-disk photo storage that replaces the Supabase `photos` bucket. Photos are
written under `PHOTOS_DIR`, listed per user folder, and served over a public
static route so the existing URL contract keeps working for `verify()` and
OpenWA `send-image`. A backup CLI copies `PHOTOS_DIR` to a local folder or a
webhook endpoint.

## Requirements

### RF-1: Store photos on local disk

The system MUST write uploaded photos to disk under `PHOTOS_DIR`, preserving
the current `{name}-{id}/{fieldname}-{uuid}.{ext}` layout for verified photos
and the numeric-prefix layout for no-match photos.

#### Scenario: Upload writes to disk

- GIVEN `PHOTOS_DIR` is configured and writable
- WHEN `uploadPhotos` stores an uploaded file
- THEN the file SHALL be written under `PHOTOS_DIR/{name}-{id}/...`

#### Scenario: No-match photo naming

- GIVEN a verified photo does not match the user
- WHEN the incoming photo is stored
- THEN its filename SHALL start with a numeric timestamp

### RF-2: List stored photos

The system MUST list a user's stored photos from `PHOTOS_DIR/{name}-{id}`,
excluding no-match files (numeric filename prefix).

#### Scenario: Reference list excludes no-match

- GIVEN a user folder contains matched and no-match photos
- WHEN photos are listed for verification
- THEN only non-numeric-prefix files SHALL be returned

### RF-3: Generate public URLs

The system MUST return URLs rooted at `PHOTOS_BASE_URL` whose shape matches the
previous Supabase signed URLs, so `verify()` and OpenWA consume them unchanged.

#### Scenario: URL contract preserved

- GIVEN a stored photo at `PHOTOS_DIR/{name}-{id}/x.jpg`
- WHEN its URL is generated
- THEN it SHALL equal `{PHOTOS_BASE_URL}/{name}-{id}/x.jpg`

### RF-4: Static serving route

The system MUST serve `PHOTOS_DIR` at the `GET /photos/*` route and MUST NOT
allow path traversal outside the served root.

#### Scenario: Photo is reachable

- GIVEN the static route is registered
- WHEN a client requests a stored photo path
- THEN the server SHALL return the file with `200`

#### Scenario: Traversal rejected

- GIVEN a request URL containing `../` or an absolute path segment
- WHEN the route handles it
- THEN the server SHALL return an error and MUST NOT read outside `PHOTOS_DIR`

### RF-5: Environment configuration

The system MUST validate `PHOTOS_DIR` and `PHOTOS_BASE_URL` via Zod and MUST
NOT require `SUPABASE_URL` or `SUPABASE_KEY` at startup.

#### Scenario: Local env loads

- GIVEN `PHOTOS_DIR` and `PHOTOS_BASE_URL` are set
- WHEN configuration loads
- THEN startup SHALL succeed without Supabase variables

#### Scenario: Missing PHOTOS_DIR

- GIVEN `PHOTOS_DIR` is unset
- WHEN configuration loads
- THEN startup SHALL fail with a Zod validation error

### RF-6: Backup to a local folder

The system MUST provide `pnpm photos:backup` that copies `PHOTOS_DIR` to a
configured destination folder, preserving the relative directory layout.
Re-running SHALL overwrite existing destination files with the current source
content.

#### Scenario: Local copy

- GIVEN a destination folder path is configured
- WHEN the backup CLI runs
- THEN every file under `PHOTOS_DIR` SHALL be copied preserving relative paths

#### Scenario: Destination write failure

- GIVEN the destination folder is not writable
- WHEN the backup CLI runs
- THEN the CLI SHALL report the failure and exit non-zero

#### Scenario: Re-run is safe

- GIVEN the destination already contains a copy
- WHEN the backup CLI runs again
- THEN existing files SHALL be overwritten with the current source content

### RF-7: Backup to a webhook endpoint

When a webhook destination is configured, the CLI MUST POST each file to the
endpoint with raw body bytes and an `X-DoorCloud-Signature` header containing
the lowercase hex HMAC-SHA256 of the body computed with the configured secret.
The CLI MUST report per-file success/failure and SHOULD include an
`X-DoorCloud-Timestamp` header; the receiver SHOULD reject stale timestamps.

#### Scenario: Signed webhook push

- GIVEN a webhook URL and secret are configured
- WHEN the CLI backs up a file
- THEN it SHALL POST the raw bytes with a valid HMAC signature header

#### Scenario: Webhook rejected

- GIVEN the endpoint responds with a non-2xx status
- WHEN the CLI posts a file
- THEN the CLI SHALL report the failure and exit non-zero

## Non-Goals

Scheduled backup automation (cron/systemd) and a backup configuration UI are
out of scope for this change.
