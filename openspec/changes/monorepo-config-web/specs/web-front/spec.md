# Spec: Web Front

## Overview

Single-page Preact app served at `/` (prod: `@fastify/static`; dev: Vite proxy). Absorbs the openwa-setup-ux pairing UX plus photo admin and the unidentified tray. Auth: `SETUP_TOKEN` from localStorage as Bearer.

## Requirements

### WF-1: App serving

The built app SHALL be served at `/` in prod and via the Vite dev proxy in dev; `GET /setup` SHALL serve the SPA.

#### Scenario: Prod same-origin

- GIVEN the built app is served
- WHEN a browser requests `/`
- THEN the SPA SHALL load from the same origin

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

## Non-Goals

QR expiry auto-refresh, dead-session auto-restart, multi-user management.
