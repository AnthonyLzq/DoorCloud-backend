# Spec: Auth Fail-Closed

## Overview

Production deployments MUST require explicit auth configuration. `SETUP_TOKEN`,
`WEB_AUTH_USER`, and `WEB_AUTH_PASS` become mandatory in production; compose
references them with `${VAR:?}` so a misconfigured deploy fails fast instead of
serving open. The auth middleware fails closed whenever a required secret is
missing, and token comparison runs in constant time. Dev environments keep the
existing behavior.

## Requirements

### AUTH-1: Production-required auth secrets

The system SHALL require `SETUP_TOKEN`, `WEB_AUTH_USER`, and `WEB_AUTH_PASS` in
production and SHALL fail startup when any is unset.

#### Scenario: Prod with all secrets boots

- GIVEN NODE_ENV=production and all three auth vars are set
- WHEN the server starts
- THEN it boots with auth middleware active

#### Scenario: Prod missing secret fails fast

- GIVEN NODE_ENV=production and SETUP_TOKEN is unset
- WHEN configuration loads
- THEN startup fails with a validation error

#### Scenario: Compose substitution fails fast

- GIVEN a compose deploy without SETUP_TOKEN in the environment
- WHEN `docker compose up` runs
- THEN compose aborts with a substitution error before the service starts

#### Scenario: Dev unchanged

- GIVEN a non-production environment with the vars unset
- WHEN the server starts
- THEN the existing dev behavior is preserved

### AUTH-2: Fail-closed auth middleware

The auth middleware SHALL reject unauthorized requests with 401 and SHALL NOT
bypass authentication when a required secret is unset in production.

#### Scenario: Unset secret rejects

- GIVEN a protected route and SETUP_TOKEN unset in production
- WHEN a request arrives without a token
- THEN the response is 401

#### Scenario: Wrong token rejects

- GIVEN SETUP_TOKEN is configured
- WHEN a request carries a different token
- THEN the response is 401

### AUTH-3: Constant-time token comparison

The system SHALL compare auth tokens in constant time so response timing does
not leak valid values.

#### Scenario: Constant-time equality used

- GIVEN a request carrying a candidate token
- WHEN the middleware validates it
- THEN the comparison runs via a constant-time primitive over equal-length digests

#### Scenario: Length mismatch handled

- GIVEN a candidate token shorter/longer than the secret
- WHEN the middleware validates it
- THEN it rejects without throwing or leaking length timing

### AUTH-4: Basic web auth scope (dual-header layering)

The system SHALL apply the HTTP Basic layer (`webAuthMiddleware`) only to the web/static surfaces and SHALL NOT intercept the API surfaces governed by the Bearer `setupAuthMiddleware`. Requests to `/admin` and `/setup` SHALL carry a Bearer `SETUP_TOKEN` and SHALL be authorized by `setupAuthMiddleware`; the Basic layer SHALL exempt them so both middlewares never contend for the same `authorization` header.

#### Scenario: Admin API reachable with Bearer

- GIVEN `WEB_AUTH_*` and `SETUP_TOKEN` are both configured
- WHEN a request to `/admin/photos/persons` carries `Authorization: Bearer <token>`
- THEN the Basic layer SHALL NOT reject it
- AND `setupAuthMiddleware` SHALL authorize it and return 200

#### Scenario: Setup API reachable with Bearer

- GIVEN `WEB_AUTH_*` and `SETUP_TOKEN` are both configured
- WHEN a request to `/setup/config` carries `Authorization: Bearer <token>`
- THEN the Basic layer SHALL NOT reject it
- AND `setupAuthMiddleware` SHALL authorize it

#### Scenario: Main SPA behind Basic

- GIVEN `WEB_AUTH_*` are configured
- WHEN a request to `/` or `/assets/*` carries no Basic auth
- THEN the Basic layer SHALL reject it with 401

#### Scenario: Wrong Bearer still rejected

- GIVEN a request to `/admin/photos/persons` with an invalid Bearer token
- WHEN `setupAuthMiddleware` validates it
- THEN the response is 401