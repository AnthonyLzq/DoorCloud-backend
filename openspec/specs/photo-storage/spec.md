# Spec: Photo Storage

## Overview

Local-disk photo storage that replaces the Supabase `photos` bucket. Photos are
written under `PHOTOS_DIR`, listed per user folder, and served over a signed
photo URL route so the existing URL contract keeps working for `verify()` and
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
excluding no-match files (numeric filename prefix). When the user folder does
not exist yet, listing MUST return an empty list instead of failing.

#### Scenario: Reference list excludes no-match

- GIVEN a user folder contains matched and no-match photos
- WHEN photos are listed for verification
- THEN only non-numeric-prefix files SHALL be returned

#### Scenario: Missing user folder

- GIVEN the user folder does not exist yet
- WHEN photos are listed
- THEN an empty list SHALL be returned

### RF-3: Generate public signed URLs

The system MUST return HMAC-signed URLs rooted at `PHOTOS_BASE_URL` whose shape
is `{PHOTOS_BASE_URL}/{signature}/{expiresAt}/{path}`, so `verify()` and OpenWA
consume them and the server can validate them before serving.

#### Scenario: Signed URL contract

- GIVEN a stored photo at `PHOTOS_DIR/{name}-{id}/x.jpg` and a configured
  `PHOTOS_URL_SECRET`
- WHEN its URL is generated
- THEN it SHALL equal `{PHOTOS_BASE_URL}/{signature}/{expiresAt}/{name}-{id}/x.jpg`
- AND `isUrlValid` SHALL accept the URL only before expiry and with a valid
  HMAC-SHA256 signature

### RF-4: Signed serving route

The system MUST serve `PHOTOS_DIR` at the `GET /photos/:signature/:expiresAt/*`
route and MUST NOT allow path traversal outside the served root. Requests with
an invalid signature, an expired timestamp, a traversal path, or an absolute
path segment MUST be rejected.

#### Scenario: Photo is reachable

- GIVEN the signed route is registered
- WHEN a client requests a stored photo path with a valid signature and an
  unexpired timestamp
- THEN the server SHALL return the file with `200`

#### Scenario: Traversal rejected

- GIVEN a request URL containing `../` or an absolute path segment
- WHEN the route handles it
- THEN the server SHALL return an error and MUST NOT read outside `PHOTOS_DIR`

#### Scenario: Invalid or expired signature rejected

- GIVEN a request URL with a tampered signature or an expired timestamp
- WHEN the route handles it
- THEN the server SHALL return `404`

### RF-5: Environment configuration

The system MUST validate `PHOTOS_DIR`, `PHOTOS_BASE_URL`, and
`PHOTOS_URL_SECRET` via Zod and MUST NOT require `SUPABASE_URL` or
`SUPABASE_KEY` at startup.

#### Scenario: Local env loads

- GIVEN `PHOTOS_DIR` and `PHOTOS_BASE_URL` are set
- WHEN configuration loads
- THEN startup SHALL succeed without Supabase variables

#### Scenario: Missing PHOTOS_DIR

- GIVEN `PHOTOS_DIR` is unset
- WHEN configuration loads
- THEN startup SHALL fail with a Zod validation error

#### Scenario: Missing PHOTOS_URL_SECRET

- GIVEN `PHOTOS_URL_SECRET` is unset or shorter than 16 characters
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
