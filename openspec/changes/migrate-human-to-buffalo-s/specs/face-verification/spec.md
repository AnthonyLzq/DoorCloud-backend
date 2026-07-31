# Delta for Face Verification

## ADDED Requirements

### Requirement: RF-1: Face verification result

The system SHALL expose `FaceRecognitionService.verify()` that detects a face, aligns it, computes a Buffalo-S embedding, and compares it against stored user photos, returning `{match, name, similarity?}` where `match` is boolean, `name` identifies the matched user, and `similarity` is a cosine score in [0,1].

**Rationale:** Replaces `@vladmandic/human` L2 comparison while preserving the `{match, name}` contract the WhatsApp photo flow depends on.

#### Scenario: Matching a stored photo

- GIVEN a photo with a detectable face and a stored photo of the same person
- WHEN `verify()` runs
- THEN the result SHALL be `{match: true, name, similarity}`

#### Scenario: No stored photo matches

- GIVEN the best cosine similarity is below the configured threshold
- WHEN `verify()` runs
- THEN the result SHALL be `{match: false}` without `name`

### Requirement: RF-2: No-face handling

The system SHALL return `{match: false}` without throwing when no face is detected, and SHALL log a message distinct from a low-similarity non-match.

**Rationale:** The no-face case must stay silent for the WhatsApp contract yet remain distinguishable for debugging.

#### Scenario: Photo without a face

- GIVEN a photo with no detectable face
- WHEN `verify()` runs
- THEN no error SHALL be thrown
- AND the result SHALL be `{match: false}`

### Requirement: RF-3: Detection and alignment in ONNXProvider

The system SHALL detect faces with `det_500m.onnx`, apply NMS, and warp the detected face to ArcFace 112x112 alignment before embedding with `w600k_mbf.onnx`.

**Rationale:** Full-ONNX production path avoids Python IPC latency and a second stack; alignment is the highest-risk piece.

#### Scenario: Single face

- GIVEN a photo containing one face
- WHEN detection and alignment run
- THEN NMS SHALL yield one face box
- AND the crop SHALL be warped to 112x112

#### Scenario: Detection fails

- GIVEN a photo with no detectable face
- WHEN detection runs
- THEN no embedding SHALL be computed
- AND `verify()` SHALL return `{match: false}`

### Requirement: RF-4: Configurable verification threshold

The system SHALL validate `FACE_VERIFY_THRESHOLD` via Zod as a number in [0,1] and SHALL use it as the match threshold in `verify()`. When unset, the default SHALL be the value derived from the benchmark ROC at the target FAR.

**Rationale:** Threshold drives false positives/negatives; a ROC-derived default with env override enables empirical calibration before the production flip.

#### Scenario: Threshold provided

- GIVEN `FACE_VERIFY_THRESHOLD=0.55`
- WHEN configuration loads
- THEN the threshold SHALL be 0.55

#### Scenario: Threshold default

- GIVEN the variable is unset
- WHEN configuration loads
- THEN the threshold SHALL be the ROC-derived default

#### Scenario: Invalid threshold

- GIVEN `FACE_VERIFY_THRESHOLD=banana`
- WHEN configuration loads
- THEN startup SHALL fail with a Zod validation error

### Requirement: RF-5: ONNX-only model lifecycle

The system SHALL initialize FaceRecognitionService in ONNX-only mode from `Server.start`, loading `det_500m.onnx` and `w600k_mbf.onnx` once per process, and SHALL NOT initialize `@vladmandic/human` or the Python process in the production startup path.

**Rationale:** Removes the heavy human runtime dependency and the dead-weight Python process from production; lib/human and PythonManager stay available for benchmark scripts.

#### Scenario: Server start

- GIVEN the server starts
- WHEN FaceRecognitionService initializes
- THEN both ONNX models SHALL load once
- AND human SHALL NOT be initialized
- AND no Python process SHALL be spawned

#### Scenario: Benchmark baseline preserved

- GIVEN a benchmark script runs
- WHEN it requests human or Python models
- THEN lib/human and PythonManager SHALL still work

### Requirement: RF-6: user.ts integration and matchPhoto.csv

The system SHALL route `UserService` photo processing through `FaceRecognitionService.verify()` instead of `compareFaces`, and SHALL keep `metrics/matchPhoto.csv` rows in the existing `1/0,<seconds>` format.

**Rationale:** The MQTT photo flow and metrics compatibility are preserved.

#### Scenario: Photo processed

- GIVEN an MQTT photo message for a user
- WHEN the user service processes it
- THEN each stored photo SHALL be verified
- AND a matchPhoto.csv row SHALL be appended in the existing format

#### Scenario: No face in photo

- GIVEN a photo with no face
- WHEN the user service processes it
- THEN the WhatsApp result SHALL be `success: false` without name
- AND a `0` row SHALL be appended to matchPhoto.csv

## MODIFIED Requirements

None - new capability; no existing spec covers photo processing.

## REMOVED Requirements

None.
