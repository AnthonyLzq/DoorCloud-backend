# Spec: User Config

## Overview

The single local user (name) is modeled as configuration instead of the
Supabase `users` table. `src/services/user.ts` reads the user from the
validated environment, derives the photo folder from the user name
(`{USER_NAME}`), and the `POST /api/user` create route is removed. Supabase is
removed from runtime paths and from the env contract. `USER_PHONE` is optional
because the destination chat is configured through `OPENWA_CHAT_ID` (settable
from the `/setup` page).

## Requirements

### RF-1: Single user from environment

The system MUST resolve the active user from `USER_NAME` validated by Zod, and
MUST expose it to services as an immutable value.

#### Scenario: User config loads

- GIVEN `USER_NAME` is set
- WHEN configuration loads
- THEN the resolved user SHALL match the configured value

#### Scenario: Missing user variable

- GIVEN `USER_NAME` is unset
- WHEN configuration loads
- THEN startup SHALL fail with a Zod validation error

### RF-2: User service uses local config

The system MUST derive the owner folder from the local config (`{USER_NAME}`) for reference photos, and MUST route no-match photos to the `unidentified/` sink so the owner folder stays clean.

#### Scenario: Folder naming preserved

- GIVEN `USER_NAME=Ana`
- WHEN `uploadPhotos` stores a reference file
- THEN it SHALL be written under the `Ana/...` folder

#### Scenario: No-match never pollutes owner folder

- GIVEN a door photo does not match any person
- WHEN the photo is stored
- THEN it SHALL NOT be written under `Ana/`
- AND it SHALL be written under `unidentified/`

### RF-3: HTTP user creation removed

The system MUST NOT expose `POST /api/user`; requests to it SHALL return a
route-not-found error.

#### Scenario: Create route removed

- GIVEN the server is running
- WHEN a client POSTs to `/api/user`
- THEN the server SHALL respond with route-not-found (`404`)

### RF-4: No Supabase in runtime paths

The system MUST NOT load or call Supabase for photos or users. `@supabase/*`
SHALL be removed from runtime imports and dependencies, and `SUPABASE_URL` /
`SUPABASE_KEY` SHALL be absent from the validated env contract.

#### Scenario: Runtime without Supabase

- GIVEN the server starts
- WHEN startup completes
- THEN no Supabase client SHALL be instantiated
- AND no `SUPABASE_*` variable SHALL be required

### RF-5: Optional destination phone

The system MUST NOT require `USER_PHONE`; WhatsApp sends SHALL target
`OPENWA_CHAT_ID`, which can be set from the `/setup` page.

#### Scenario: Startup without USER_PHONE

- GIVEN `USER_NAME` is set and `USER_PHONE` is unset
- WHEN configuration loads
- THEN startup SHALL succeed

### RF-6: Owner folder integrity

The system SHALL NOT rename or delete the folder named `USER_NAME` through any admin or UI operation; verification SHALL keep comparing against all known person folders, including the owner.

#### Scenario: Owner rename rejected

- GIVEN `USER_NAME=Ana`
- WHEN an admin rename targets `Ana`
- THEN the operation SHALL be rejected and the folder SHALL remain `Ana`

#### Scenario: Owner still verified

- GIVEN the owner folder `Ana` exists
- WHEN verification runs
- THEN `Ana/` SHALL be included in reference matching

## Non-Goals

Multi-user support is out of scope; the system models exactly one local user.
