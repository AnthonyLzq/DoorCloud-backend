# Delta for Face Verification

## ADDED Requirements

### RF-7: Dependency and dead-code posture

The face-recognition runtime SHALL use `sharp` >= 0.35 and SHALL NOT depend on
`@vladmandic/human`, `@tensorflow/tfjs-node`, or their `allowBuilds` entry in
the workspace manifest.

#### Scenario: Patched sharp

- GIVEN the lockfile resolves sharp
- THEN it is >= 0.35

#### Scenario: Dead deps absent from runtime

- GIVEN the face-recognition runtime dependency tree (apps/backend)
- THEN no tfjs-node or human package is present

#### Scenario: allowBuilds cleaned

- GIVEN pnpm-workspace.yaml
- THEN no allowBuilds entry references tfjs-node

## MODIFIED Requirements

### RF-1: Face verification result

The system SHALL expose `FaceRecognitionService.verify()` that detects a face,
aligns it, computes a Buffalo-S embedding, and compares it against stored user
photos read from local disk, performing zero HTTP fetches during verification,
returning `{match, name, similarity?}` where `match` is boolean, `name`
identifies the matched user, and `similarity` is a cosine score in [0,1].
(Previously: reference photos were fetched over HTTP via their signed URLs)

**Rationale:** Reads stored reference photos from local disk instead of fetching
their signed URLs, preserving the `{match, name}` contract the WhatsApp photo
flow depends on, and eliminates the SSRF path when `PHOTOS_BASE_URL` is
misconfigured.

**Scenarios:**

- **Given** a photo with a detectable face and a stored photo of the same person
- **When** `verify()` runs
- **Then** the result SHALL be `{match: true, name, similarity}`

- **Given** the best cosine similarity is below the configured threshold
- **When** `verify()` runs
- **Then** the result SHALL be `{match: false}` without `name`

- **Given** a door photo arrives for verification and `PHOTOS_BASE_URL` points at an attacker host
- **When** `verify()` runs
- **Then** no HTTP request leaves the process and the result matches the local-disk comparison