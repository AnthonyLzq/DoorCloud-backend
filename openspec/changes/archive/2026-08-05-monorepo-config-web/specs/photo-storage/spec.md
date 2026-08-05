# Delta for Photo Storage

## MODIFIED Requirements

### RF-1: Store photos on local disk

The system MUST write uploaded photos to disk under `PHOTOS_DIR`. Reference photos SHALL be stored in the person's folder (folder name IS identity: `PHOTOS_DIR/{Person}/...`); no-match photos SHALL be written to the `unidentified/` sink folder instead of the owner folder.
(Previously: no-match photos were written into `PHOTOS_DIR/{USER_NAME}` with a numeric timestamp prefix.)

#### Scenario: Upload writes to disk

- GIVEN `PHOTOS_DIR` is configured and writable
- WHEN an uploaded photo is stored
- THEN it SHALL be written under `PHOTOS_DIR/{Person}/...`

#### Scenario: No-match photo sink

- GIVEN a verified door photo does not match any person
- WHEN the photo is stored
- THEN it SHALL be written under `PHOTOS_DIR/unidentified/...`

### RF-2: List stored photos

The system MUST list a person's reference photos from `PHOTOS_DIR/{Person}`, and SHALL hide any legacy numeric-prefix files still present in person folders. When the person folder does not exist, listing SHALL return an empty list.
(Previously: listing excluded numeric-prefix no-match files, which were stored in the user folder.)

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

## ADDED Requirements

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
