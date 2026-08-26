# Delta for Photo Admin API

## MODIFIED Requirements

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

(Previously: the API rejected only rename `from` and delete, and did not reject creating `Ana` or renaming any folder `to` `Ana`.)

## ADDED Requirements

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
