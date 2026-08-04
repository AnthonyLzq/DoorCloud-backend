# Delta for User Config

## MODIFIED Requirements

### RF-2: User service uses local config

The system MUST derive the owner folder from the local config (`{USER_NAME}`) for reference photos, and MUST route no-match photos to the `unidentified/` sink so the owner folder stays clean.
(Previously: the user folder doubled as the no-match sink; unmatched photos accumulated there.)

#### Scenario: Folder naming preserved

- GIVEN `USER_NAME=Ana`
- WHEN `uploadPhotos` stores a reference file
- THEN it SHALL be written under the `Ana/...` folder

#### Scenario: No-match never pollutes owner folder

- GIVEN a door photo does not match any person
- WHEN the photo is stored
- THEN it SHALL NOT be written under `Ana/`
- AND it SHALL be written under `unidentified/`

## ADDED Requirements

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

Multi-user support stays out of scope.
