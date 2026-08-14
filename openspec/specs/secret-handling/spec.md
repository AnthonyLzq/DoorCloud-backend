# Spec: Secret Handling

## Overview

Closes the OpenWA exfiltration chain (SEC-07): the base URL is validated
against a host allowlist (loopback or allowlisted; HTTPS recommended for remote
hosts), and the runtime stops persisting the API key to a `.env` file in
production. Environment/compose `env_file` becomes the sole authoritative
source of secrets in prod; the local dev write flow is preserved.

## Requirements

### SECRET-1: OpenWA base-URL constraint

The system SHALL validate `OPENWA_BASE_URL` as a URL whose host is loopback or
on a configured allowlist, and SHALL reject any other value during configuration
validation and the setup schema. HTTPS is the recommended posture for remote
hosts; the allowlist is the trust boundary that blocks exfiltration of
`OPENWA_API_KEY` to arbitrary hosts. TLS for the internal OpenWA link is
deferred to Slice 5 (T5.4 cutover note).

#### Scenario: HTTPS allowlisted host accepted

- GIVEN `OPENWA_BASE_URL=https://wa.example.com` and `wa.example.com` is allowlisted
- WHEN configuration loads
- THEN validation passes

#### Scenario: Loopback host accepted without allowlist

- GIVEN `OPENWA_BASE_URL=http://localhost:2785` (local dev)
- WHEN configuration loads
- THEN validation passes

#### Scenario: Non-allowlisted host rejected

- GIVEN `OPENWA_BASE_URL=https://evil.example.com` and the host is not allowlisted
- WHEN configuration loads
- THEN validation rejects the value

#### Scenario: Allowlisted non-HTTPS host accepted (internal trust)

- GIVEN `OPENWA_BASE_URL=http://openwa:2785` and `openwa` is allowlisted
  (internal docker network, TLS cutover deferred to T5.4)
- WHEN configuration loads
- THEN validation passes

#### Scenario: Setup schema shares the constraint

- GIVEN the setup endpoint receives a non-loopback, non-allowlisted base URL
- WHEN the payload is validated
- THEN the request fails with a validation error

### SECRET-2: No runtime secret persistence in production

The system SHALL NOT write `OPENWA_API_KEY` or the OpenWA configuration to a
`.env` file at runtime in production; the environment supplied by
compose/`env_file` SHALL be authoritative there. Non-production runs MAY keep
the existing local `.env` write flow.

#### Scenario: Prod setup does not touch disk

- GIVEN a production container
- WHEN a setup/pairing request completes
- THEN no `.env` file write occurs on the runtime filesystem

#### Scenario: Dev write preserved

- GIVEN a local non-production run
- WHEN setup completes
- THEN the existing local `.env` write behavior is unchanged