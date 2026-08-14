# Delta for Web Front

## ADDED Requirements

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

## MODIFIED Requirements

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