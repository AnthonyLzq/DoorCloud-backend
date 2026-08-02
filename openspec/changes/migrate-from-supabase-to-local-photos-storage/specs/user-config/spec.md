# Spec: User Config

## Overview

The single local user (id, name, phone) is modeled as configuration instead of
the Supabase `users` table. `src/services/user.ts` reads the user from the
validated environment, folder naming (`{name}-{id}`) and photo validation are
preserved, and the `POST /api/user` create route is removed. Supabase is
removed from runtime paths and from the env contract.

## Requirements

### RF-1: Single user from environment

The system MUST resolve the active user from `USER_ID`, `USER_NAME`, and
`USER_PHONE` validated by Zod, and MUST expose it to services as an immutable
value.

#### Scenario: User config loads

- GIVEN `USER_ID`, `USER_NAME`, `USER_PHONE` are set
- WHEN configuration loads
- THEN the resolved user SHALL match the configured values

#### Scenario: Missing user variable

- GIVEN `USER_NAME` is unset
- WHEN configuration loads
- THEN startup SHALL fail with a Zod validation error

### RF-2: User service uses local config

The system MUST derive the user folder from the local config
(`{USER_NAME}-{USER_ID}`) and MUST keep `uploadPhotos` validation (numeric
`userID`, reject invalid folder) and the WhatsApp last-message behavior.

#### Scenario: Folder naming preserved

- GIVEN `USER_NAME=Ana` and `USER_ID=123`
- WHEN `uploadPhotos` stores a file
- THEN it SHALL be written under the `Ana-123/...` folder

#### Scenario: Invalid folder rejected

- GIVEN a folder with a non-numeric `userID`
- WHEN `uploadPhotos` is called
- THEN the call SHALL fail with a `400` error

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

## Non-Goals

Multi-user support is out of scope; the system models exactly one local user.
