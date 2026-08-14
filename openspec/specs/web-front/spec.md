# Spec: Web Front

## Overview

Single-page Preact app served at `/` (prod: `@fastify/static`; dev: Vite proxy). Absorbs the openwa-setup-ux pairing UX plus photo admin and the unidentified tray. Auth: `SETUP_TOKEN` from localStorage as Bearer.

## Requirements

### WF-1: App serving

The built app SHALL be served at `/` in prod (via `@fastify/static` >= 10, the
patched major) and via the Vite dev proxy in dev; `GET /setup` SHALL serve the
SPA.
(Previously: served via `@fastify/static` 8.x)

#### Scenario: Prod same-origin

- GIVEN the built app is served
- WHEN a browser requests `/`
- THEN the SPA SHALL load from the same origin

#### Scenario: Upgraded static plugin unchanged

- GIVEN `@fastify/static` 10.x is registered in prod
- WHEN `/` and `/setup` are requested
- THEN the SPA assets serve identically to the previous major

### WF-2: Setup auth

The app SHALL read `SETUP_TOKEN` from localStorage and send it as Bearer on setup/admin requests.

#### Scenario: Token attached

- GIVEN a token is in localStorage
- WHEN the app calls a protected endpoint
- THEN the request SHALL carry the Bearer header

#### Scenario: No token stored

- GIVEN localStorage has no token
- WHEN the app loads
- THEN the app SHALL fail with 401 and prompt for a token

### WF-3: Page-load state handling

On page load the view SHALL render per status: `qr_ready` auto-loads the QR, `connected` shows status, else idle.

#### Scenario: qr_ready on load

- GIVEN status returns `qr_ready`
- WHEN the page loads
- THEN the QR image SHALL load automatically

#### Scenario: Idle on load

- GIVEN status returns `disconnected`
- WHEN the page loads
- THEN the view SHALL show idle with Start enabled

### WF-4: Start flow

Starting SHALL disable the button, show "Starting...", guard double start, then poll.

#### Scenario: Start disables

- GIVEN the user clicks Start
- WHEN pairing starts
- THEN the button SHALL disable until resolution
- AND repeated clicks SHALL NOT start a second poll

### WF-5: Auto-poll

The view SHALL poll status every ~3s, capped at ~20 polls, stopping on `qr_ready`, `connected`, `session: null`, or 3 failures.

#### Scenario: Poll drives to QR

- GIVEN Start completed
- WHEN status becomes `qr_ready` before the cap
- THEN polling SHALL stop and the QR SHALL auto-load

#### Scenario: Poll cap

- GIVEN status stays unpaired
- WHEN 20 polls complete
- THEN polling SHALL stop and the view SHALL show a still-waiting state

### WF-6: Failure handling and recovery

Three consecutive failures SHALL show an error; "Load QR" and "Refresh status" SHALL remain as manual recovery.

#### Scenario: Failure cap

- GIVEN three consecutive poll failures
- WHEN the third occurs
- THEN the view SHALL show an error state

#### Scenario: Manual refresh

- GIVEN an error or idle state
- WHEN the user clicks "Refresh status"
- THEN a single status request SHALL run

### WF-7: Persons admin

The photo admin view SHALL list, create, rename, and delete persons (delete with confirm), and SHALL NOT expose rename/delete for the owner folder.

#### Scenario: CRUD flows

- GIVEN the admin view is open
- WHEN the user creates, renames, or deletes a person
- THEN the list SHALL refresh

#### Scenario: Owner protected

- GIVEN a person folder equals `USER_NAME`
- WHEN the admin view renders it
- THEN rename and delete controls SHALL be absent

### WF-8: Photo management per person

The view SHALL list photos with signed URLs, upload via multipart, and delete photos.

#### Scenario: Upload

- GIVEN a person is selected
- WHEN the user uploads a photo
- THEN it SHALL appear in the photo list

### WF-9: Unidentified tray

The tray SHALL list unidentified photos with previewable signed URLs, promote one to a person (MOVE), and delete one.

#### Scenario: Promote moves

- GIVEN an unidentified photo
- WHEN the user promotes it to a person
- THEN it SHALL leave the tray and appear in that person's photos

#### Scenario: Tray delete

- GIVEN an unidentified photo
- WHEN the user deletes it
- THEN it SHALL leave the tray

### WF-10: Strict-CSP compatibility

The built SPA SHALL remain fully functional under the strict Content-Security-Policy
added by the HTTP layer, including loading signed photos whose origin is the
`PHOTOS_BASE_URL` host (which may differ from the serving origin).

#### Scenario: Cross-origin photos load

- GIVEN a signed photo URL from the `PHOTOS_BASE_URL` origin
- WHEN the admin or setup view renders it
- THEN the image loads under the CSP img-src allowlist

#### Scenario: No inline scripts

- GIVEN the production SPA bundle
- WHEN it is served with the CSP
- THEN it executes without inline scripts or 'unsafe-inline'

### WF-11: Dev-tooling dependency hygiene

The SPA workspace SHALL use a non-vulnerable `happy-dom` version.

#### Scenario: Patched happy-dom

- GIVEN the apps/web lockfile entry
- THEN happy-dom resolves at a version without the advisory

## Non-Goals

QR expiry auto-refresh, dead-session auto-restart, multi-user management.
