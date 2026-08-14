# Delta for HTTP Security Hardening

Existing REQ-1..REQ-5 (CORS allowlist, x-powered-by removal, docs) remain valid
and are unchanged.

## ADDED Requirements

### REQ-6: Request rate limiting

The system SHALL rate-limit requests on setup, admin, and photo-upload routes
so credential guessing or upload bursts cannot overwhelm auth or storage.

#### Scenario: Burst limited

- GIVEN a client exceeds the configured rate window on /setup/* or /admin/*
- WHEN further requests arrive
- THEN the server responds 429

#### Scenario: Normal traffic unaffected

- GIVEN a client stays within the limit
- WHEN it calls the protected routes
- THEN requests proceed normally

#### Scenario: Healthz exempt

- GIVEN `GET /healthz`
- WHEN polled by the container healthcheck
- THEN it is not rate-limited

### REQ-7: Security response headers

The system SHALL send a strict Content-Security-Policy whose `img-src` includes
the `PHOTOS_BASE_URL` origin, plus `X-Content-Type-Options: nosniff` and
`frame-ancestors 'none'` on HTTP responses.

#### Scenario: Headers present

- GIVEN any HTTP response
- THEN it carries the CSP, nosniff, and frame-ancestors 'none' headers

#### Scenario: SPA images allowed

- GIVEN a signed photo URL whose origin is `PHOTOS_BASE_URL` (possibly cross-origin)
- WHEN the SPA loads it
- THEN CSP img-src permits the origin

#### Scenario: Inline script blocked

- GIVEN the SPA HTML
- WHEN it is served under the CSP
- THEN inline scripts are blocked (script-src without 'unsafe-inline')

### REQ-8: Framework and dependency posture

The system SHALL run fastify at a patched version addressing the HTTP/2 DDoS
and host-confusion advisories, and SHALL record remaining unreachable
advisories (ip-address, adm-zip, semver tooling chain) in a repository advisory
register with a reachability assessment.

#### Scenario: Patched fastify

- GIVEN the lockfile resolves fastify
- THEN it is at the patched version covering both findings

#### Scenario: Advisory register exists

- GIVEN the repository documentation
- WHEN a maintainer audits dependencies
- THEN an advisory note records the remaining advisories as low/unreachable
  with the reason for keeping them