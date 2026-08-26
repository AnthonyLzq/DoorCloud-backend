# Delta for Auth Fail-Closed

## ADDED Requirements

### AUTH-4: Basic web auth scope (dual-header layering)

The system SHALL apply the HTTP Basic layer (`webAuthMiddleware`) only to the web/static surfaces and SHALL NOT intercept the API surfaces governed by the Bearer `setupAuthMiddleware`. Requests to `/admin` and `/setup` SHALL carry a Bearer `SETUP_TOKEN` and SHALL be authorized by `setupAuthMiddleware`; the Basic layer SHALL exempt them so both middlewares never contend for the same `authorization` header.

(Previously: the global Basic layer exempted only `/healthz` and `/photos`, so `/admin` and `/setup` were rejected before `setupAuth` could run.)

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
