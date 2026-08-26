# Delta for Photo Storage

## ADDED Requirements

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
