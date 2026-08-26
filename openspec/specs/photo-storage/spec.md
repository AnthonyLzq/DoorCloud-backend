# Spec: Photo Storage

## Overview

Local-disk photo storage that replaces the Supabase `photos` bucket. Photos are
written under `PHOTOS_DIR`; each person folder is an identity
(`PHOTOS_DIR/{Person}/...`), no-match photos sink into `unidentified/`, and
folder/photo CRUD primitives back the admin API. Photos are served over a
signed photo URL route so the existing URL contract keeps working for
`verify()` and OpenWA `send-image`. A backup CLI copies `PHOTOS_DIR` to a local
folder or a webhook endpoint.

## Requirements

### RF-1: Store photos on local disk

The system MUST write uploaded photos to disk under `PHOTOS_DIR`. Reference
photos SHALL be stored in the person's folder (folder name IS identity:
`PHOTOS_DIR/{Person}/...`); no-match photos SHALL be written to the
`unidentified/` sink folder instead of the owner folder.

#### Scenario: Upload writes to disk

- GIVEN `PHOTOS_DIR` is configured and writable
- WHEN an uploaded photo is stored
- THEN it SHALL be written under `PHOTOS_DIR/{Person}/...`

#### Scenario: No-match photo sink

- GIVEN a verified door photo does not match any person
- WHEN the photo is stored
- THEN it SHALL be written under `PHOTOS_DIR/unidentified/...`

### RF-2: List stored photos

The system MUST list a person's reference photos from `PHOTOS_DIR/{Person}`, and
SHALL hide any legacy numeric-prefix files still present in person folders. When
the person folder does not exist, listing SHALL return an empty list.

#### Scenario: Reference list excludes no-match

- GIVEN a person folder contains reference and legacy no-match photos
- WHEN photos are listed
- THEN only non-numeric-prefix files SHALL be returned

#### Scenario: Missing person folder

- GIVEN the person folder does not exist yet
- WHEN photos are listed
- THEN an empty list SHALL be returned

#### Scenario: Legacy files flagged for migration

- GIVEN the owner folder contains legacy timestamp-prefixed files from before this change
- WHEN `list()` hides them and `listDirectories()` runs
- THEN they SHALL remain hidden from verification
- AND the operator SHALL be able to move them to `unidentified/` via `movePhoto`

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

### RF-8: Unidentified sink excluded from known persons

`listDirectories()` SHALL exclude the `unidentified/` folder from known persons; unmatched photos SHALL be reachable only through the unidentified primitives.

#### Scenario: Tray list excludes person identity

- GIVEN `unidentified/` contains photos
- WHEN `listDirectories()` runs
- THEN `unidentified` SHALL NOT appear as a person

### RF-9: Folder primitives

The system SHALL provide `createFolder`, `renameFolder`, and `deleteFolder` primitives operating under `PHOTOS_DIR` with recursive delete support.

#### Scenario: Delete removes subtree

- GIVEN a person folder with photos
- WHEN `deleteFolder` runs
- THEN the whole subtree SHALL be removed

### RF-10: Photo primitives

The system SHALL provide `deletePhoto` and `movePhoto` primitives; `movePhoto` SHALL move, not copy, the file into a target person folder.

#### Scenario: Move relocates file

- GIVEN `unidentified/x.jpg`
- WHEN `movePhoto` moves it to `{Person}/`
- THEN the file SHALL exist only in the target folder

### RF-11: Containment guarantee

All new primitives SHALL resolve paths through the existing `#safeJoin` containment check and SHALL reject traversal or absolute segments.

#### Scenario: Traversal rejected

- GIVEN a filename or folder name containing `../` or an absolute path
- WHEN a primitive runs
- THEN the operation SHALL fail and MUST NOT touch paths outside `PHOTOS_DIR`

### RF-12: Upload content validation

Uploaded photos SHALL be validated as an allowed image type (JPEG, PNG, WebP, GIF) before being written to disk. The system SHALL reject uploads whose content type or content does not match the allowlist, so an attacker cannot plant arbitrary content (e.g., HTML/SVG) into the same-origin store.

#### Scenario: Allowed image accepted

- GIVEN a valid JPEG/PNG/WebP/GIF upload
- WHEN it is validated
- THEN it SHALL be stored under `PHOTOS_DIR/{Person}/...`

#### Scenario: Disallowed content rejected

- GIVEN an upload whose content is not an allowed image
- WHEN it is validated
- THEN the system SHALL reject it (400/415) and SHALL NOT write a file

#### Scenario: Content and extension agree

- GIVEN a file whose declared mimetype is an allowed image
- WHEN the actual content is sniffed
- THEN the stored extension SHALL be derived from the verified content, not trusted from the client mimetype alone

### RF-13: Content-Disposition on signed serving

The `GET /photos/:signature/:expiresAt/*` route SHALL send a `Content-Disposition` header on photo responses so browsers treat the payload as a file/image rather than guessing content type.

#### Scenario: Serve includes Content-Disposition

- GIVEN a valid signed photo URL request
- WHEN the route streams the file
- THEN the response SHALL include a `Content-Disposition` header
- AND `X-Content-Type-Options: nosniff` SHALL remain present

## Non-Goals

Scheduled backup automation (cron/systemd) and a backup configuration UI are
out of scope for this change.
