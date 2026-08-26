# Spec: Photo Admin API

## Overview

REST API under `/admin/photos` behind `setupAuthMiddleware` (Bearer `SETUP_TOKEN`, open when unset). Drives person folders, per-person photos, and the unidentified tray. Failures use the `{ error, message }` envelope.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/photos/persons` | List persons (name + photo count) |
| POST | `/admin/photos/persons` | Create folder `{ name }` |
| PATCH | `/admin/photos/persons/:name` | Rename `{ name }` |
| DELETE | `/admin/photos/persons/:name?confirm=true` | Hard-delete folder |
| GET | `/admin/photos/persons/:name/photos` | List photos + signed URLs |
| POST | `/admin/photos/persons/:name/photos` | Multipart upload |
| DELETE | `/admin/photos/persons/:name/photos/:filename` | Delete one photo |
| GET | `/admin/photos/unidentified` | List unidentified + signed URLs |
| DELETE | `/admin/photos/unidentified/:filename` | Delete unidentified photo |
| POST | `/admin/photos/unidentified/:filename/promote` | Promote (MOVE) `{ person }` |

## Requirements

### PA-1: Auth and envelope

Every endpoint SHALL require a valid `SETUP_TOKEN` Bearer (or run open when unset) and SHALL return failures as `{ error, message }` with appropriate status codes.

#### Scenario: Missing token

- GIVEN `SETUP_TOKEN` is set and no Bearer is sent
- WHEN a request hits `/admin/photos/persons`
- THEN the API SHALL return 401 with an error envelope

#### Scenario: Error envelope

- GIVEN any request fails validation or storage
- WHEN the API responds
- THEN the body SHALL be `{ error, message }`

### PA-2: Folder name validation

Creating or renaming SHALL validate the name: non-empty, no path separators, not `.`/`..`, and unique among existing persons.

#### Scenario: Invalid name

- GIVEN a name containing a separator or equal to `.`
- WHEN a create request is sent
- THEN the API SHALL return 400

#### Scenario: Duplicate name

- GIVEN an existing folder `Ana`
- WHEN a create or rename targets `Ana`
- THEN the API SHALL return 409

### PA-3: Owner folder guard

The API SHALL reject any operation that would create, rename-to, or delete the folder named `USER_NAME`, so the owner identity cannot be overwritten or removed.

#### Scenario: Owner delete rejected

- GIVEN `USER_NAME=Ana`
- WHEN DELETE `/admin/photos/persons/Ana?confirm=true` is sent
- THEN the API SHALL return 403
- AND the folder SHALL remain

#### Scenario: Owner create rejected

- GIVEN `USER_NAME=Ana`
- WHEN POST `/admin/photos/persons` with `{ name: "Ana" }` is sent
- THEN the API SHALL return 403 and SHALL NOT create the folder

#### Scenario: Owner rename-to rejected

- GIVEN `USER_NAME=Ana` and a person `Bryan`
- WHEN PATCH `/admin/photos/persons/Bryan` with `{ name: "Ana" }` is sent
- THEN the API SHALL return 403 and SHALL NOT rename

### PA-4: Person CRUD

GET SHALL list persons with photo counts; POST SHALL create via the storage primitive; PATCH SHALL rename to a non-existing target; DELETE SHALL hard-delete recursively only with `?confirm=true`.

#### Scenario: Confirm required

- GIVEN a person folder exists
- WHEN DELETE is sent without `confirm=true`
- THEN the API SHALL return 400 and SHALL NOT delete

#### Scenario: Rename moves folder

- GIVEN person `Bryan` exists and `Bryan2` does not
- WHEN PATCH renames to `Bryan2`
- THEN the folder SHALL be renamed and photos preserved

### PA-5: Photos per person

GET SHALL list photos with signed URLs via `getUrl`; POST SHALL accept multipart uploads under per-route limits; DELETE SHALL remove a single photo with containment.

#### Scenario: Upload

- GIVEN a person folder
- WHEN a multipart photo is posted
- THEN it SHALL be stored in that folder and listed thereafter

### PA-6: Unidentified tray

GET SHALL list files under `unidentified/` with signed URLs; DELETE SHALL remove one; promote SHALL MOVE the file into the target person folder, never copy.

#### Scenario: Promote is a move

- GIVEN `unidentified/x.jpg` and person `Bryan`
- WHEN promote `{ person: "Bryan" }` succeeds
- THEN `x.jpg` SHALL exist under `Bryan/` and SHALL NOT remain under `unidentified/`

#### Scenario: Promote to missing person

- GIVEN the target person folder does not exist
- WHEN promote is requested
- THEN the API SHALL return 404

### PA-7: Photo filename validation

Photo DELETE endpoints SHALL reject the literal filenames `.` and `..` with a client error (400 from the filename schema, or a router 404 that never reaches the handler) and SHALL NOT perform a filesystem operation, instead of surfacing a `500` from an invalid path.

#### Scenario: Dot filename rejected

- GIVEN a request to DELETE `/admin/photos/persons/:name/photos/.`
- WHEN the route validates the filename
- THEN the API SHALL reject it with `400` or a router `404` (never `500`)

#### Scenario: Double-dot filename rejected

- GIVEN a request to DELETE `/admin/photos/persons/:name/photos/..`
- WHEN the route validates the filename
- THEN the API SHALL reject it with `400` or a router `404` (never `500`)

#### Scenario: Valid filename passes

- GIVEN a request to DELETE `/admin/photos/persons/:name/photos/x.jpg`
- WHEN the route validates the filename
- THEN the API SHALL proceed and SHALL NOT return 400

## Non-Goals

Trash/soft-delete, bulk operations, and multi-user auth are out of scope.
