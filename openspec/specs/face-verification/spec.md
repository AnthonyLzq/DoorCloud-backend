# Spec: Face Verification

## Overview

Detect and verify a face in an incoming photo against a user's stored photos using an ONNX-only InsightFace Buffalo-S pipeline (`det_500m.onnx` detection + `w600k_mbf.onnx` recognition), replacing the `@vladmandic/human` L2 comparison in the MQTT photo flow while preserving the WhatsApp `{match, name}` contract and the `metrics/matchPhoto.csv` format. The threshold is configurable via `FACE_VERIFY_THRESHOLD` and defaults to the value derived from the benchmark ROC at the target FAR.

## Requirements

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

### RF-2: No-face handling

The system SHALL return `{match: false}` without throwing when no face is detected, and SHALL log a message distinct from a low-similarity non-match.

**Rationale:** The no-face case must stay silent for the WhatsApp contract yet remain distinguishable for debugging.

**Scenarios:**

- **Given** a photo with no detectable face
- **When** `verify()` runs
- **Then** no error SHALL be thrown
- **And** the result SHALL be `{match: false}`

### RF-3: Detection and alignment in ONNXProvider

The system SHALL detect faces with `det_500m.onnx`, apply NMS, and warp the detected face to ArcFace 112x112 alignment before embedding with `w600k_mbf.onnx`.

**Rationale:** Full-ONNX production path avoids Python IPC latency and a second stack; alignment is the highest-risk piece.

**Scenarios:**

- **Given** a photo containing one face
- **When** detection and alignment run
- **Then** NMS SHALL yield one face box
- **And** the crop SHALL be warped to 112x112

- **Given** a photo with no detectable face
- **When** detection runs
- **Then** no embedding SHALL be computed
- **And** `verify()` SHALL return `{match: false}`

### RF-4: Configurable verification threshold

The system SHALL validate `FACE_VERIFY_THRESHOLD` via Zod as a number in [0,1] and SHALL use it as the match threshold in `verify()`. When unset, the default SHALL be the value derived from the benchmark ROC at the target FAR.

**Rationale:** Threshold drives false positives/negatives; a ROC-derived default with env override enables empirical calibration before the production flip.

**Scenarios:**

- **Given** `FACE_VERIFY_THRESHOLD=0.55`
- **When** configuration loads
- **Then** the threshold SHALL be 0.55

- **Given** the variable is unset
- **When** configuration loads
- **Then** the threshold SHALL be the ROC-derived default

- **Given** `FACE_VERIFY_THRESHOLD=banana`
- **When** configuration loads
- **Then** startup SHALL fail with a Zod validation error

### RF-5: ONNX-only model lifecycle

The system SHALL initialize FaceRecognitionService in ONNX-only mode from `Server.start`, loading `det_500m.onnx` and `w600k_mbf.onnx` once per process, and SHALL NOT initialize `@vladmandic/human` or the Python process in the production startup path.

**Rationale:** Removes the heavy human runtime dependency and the dead-weight Python process from production; lib/human and PythonManager stay available for benchmark scripts.

**Scenarios:**

- **Given** the server starts
- **When** FaceRecognitionService initializes
- **Then** both ONNX models SHALL load once
- **And** human SHALL NOT be initialized
- **And** no Python process SHALL be spawned

- **Given** a benchmark script runs
- **When** it requests human or Python models
- **Then** lib/human and PythonManager SHALL still work

### RF-6: user.ts integration and matchPhoto.csv

The system SHALL route `UserService` photo processing through `FaceRecognitionService.verify()` instead of `compareFaces`, and SHALL keep `metrics/matchPhoto.csv` rows in the existing `1/0,<seconds>` format.

**Rationale:** The MQTT photo flow and metrics compatibility are preserved.

**Scenarios:**

- **Given** an MQTT photo message for a user
- **When** the user service processes it
- **Then** each stored photo SHALL be verified
- **And** a matchPhoto.csv row SHALL be appended in the existing format

- **Given** a photo with no face
- **When** the user service processes it
- **Then** the WhatsApp result SHALL be `success: false` without name
- **And** a `0` row SHALL be appended to matchPhoto.csv

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
