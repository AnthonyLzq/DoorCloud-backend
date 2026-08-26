# Spec: HTTP Security Hardening

## Overview

Restrict CORS configuration to use an allowlist of origins instead of allowing all origins (`*`). Remove the legacy `x-powered-by: Simba.js` header. Maintain backward compatibility by defaulting to `*` when `CORS_ORIGINS` is not set.

## Requirements

### REQ-1: CORS Origins Environment Variable

The system SHALL support a `CORS_ORIGINS` environment variable to configure allowed origins.

**Scenarios:**

- **Given** the environment configuration schema
- **When** the application starts
- **Then** `CORS_ORIGINS` SHALL be an optional environment variable
- **And** `CORS_ORIGINS` SHALL accept a comma-separated list of origins (e.g., `http://localhost:3000,https://app.doorcloud.com`)
- **And** if `CORS_ORIGINS` is not set or empty, the system SHALL default to a non-reflecting policy (deny cross-origin) instead of reflecting an arbitrary `Origin`

- **Given** `CORS_ORIGINS` is set to `http://localhost:3000,https://app.doorcloud.com`
- **When** the environment is parsed
- **Then** the system SHALL parse it as an array of two origins: `['http://localhost:3000', 'https://app.doorcloud.com']`

- **Given** `CORS_ORIGINS` is set to a single origin `https://app.doorcloud.com`
- **When** the environment is parsed
- **Then** the system SHALL parse it as an array of one origin: `['https://app.doorcloud.com']`

### REQ-2: CORS Configuration with Allowlist

The Fastify CORS plugin SHALL be configured with the parsed origins and SHALL NOT reflect an arbitrary request `Origin` when `CORS_ORIGINS` is unset.

**Scenarios:**

- **Given** `CORS_ORIGINS` is set to `http://localhost:3000,https://app.doorcloud.com`
- **When** the Fastify CORS plugin is registered
- **Then** the plugin SHALL be configured with `origin: ['http://localhost:3000', 'https://app.doorcloud.com']`
- **And** requests from `http://localhost:3000` SHALL be allowed
- **And** requests from `https://app.doorcloud.com` SHALL be allowed
- **And** requests from `https://evil.com` SHALL be rejected with CORS error

- **Given** `CORS_ORIGINS` is not set
- **When** the Fastify CORS plugin is registered
- **Then** the plugin SHALL NOT be configured with `origin: true` (which reflects the request `Origin`)
- **And** cross-origin requests SHALL be denied (no reflected `Access-Control-Allow-Origin`)

- **Given** `CORS_ORIGINS` is set to `*`
- **When** the Fastify CORS plugin is registered
- **Then** the plugin SHALL default to a non-reflecting safe policy, not reflect an arbitrary `Origin`

### REQ-3: Remove x-powered-by Header

The system SHALL NOT send the `x-powered-by: Simba.js` header.

**Scenarios:**

- **Given** the HTTP server is running
- **When** any HTTP request is received
- **Then** the response SHALL NOT include the header `x-powered-by: Simba.js`
- **And** the response SHALL NOT include any `x-powered-by` header

- **Given** the preHandler hook in `src/network/server.ts`
- **When** the hook is executed
- **Then** the hook SHALL NOT set `reply.header('x-powered-by', 'Simba.js')`
- **And** the hook SHALL be removed or refactored to only set necessary headers

### REQ-4: Remove Redundant CORS Headers

The system SHALL rely on `@fastify/cors` for CORS headers instead of manually setting them in preHandler.

**Scenarios:**

- **Given** the preHandler hook in `src/network/server.ts`
- **When** the hook is executed
- **Then** the hook SHALL NOT manually set `Access-Control-Allow-Origin`
- **And** the hook SHALL NOT manually set `Access-Control-Allow-Methods`
- **And** the hook SHALL NOT manually set `Access-Control-Allow-Headers`
- **And** CORS headers SHALL be managed exclusively by `@fastify/cors`

### REQ-5: Documentation Update

The system documentation SHALL reflect the new CORS configuration.

**Scenarios:**

- **Given** the `README.md` file
- **When** environment variables are documented
- **Then** `CORS_ORIGINS` SHALL be documented as an optional variable
- **And** the documentation SHALL explain the comma-separated format
- **And** the documentation SHALL mention the default behavior (allow all origins)
- **And** the documentation SHALL provide examples for common use cases

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

### REQ-9: Upload size limits and robust multipart errors

The system SHALL enforce explicit multipart limits on `POST /api/user/upload` (a per-file `fileSize` and a file-count limit) and SHALL return `413` when a limit is exceeded and `400` for an empty or malformed multipart body.

#### Scenario: Oversized file limited

- GIVEN a multipart upload to `/api/user/upload` with a file over the configured `fileSize`
- WHEN the route handles it
- THEN the server SHALL return `413`

#### Scenario: Empty body is 400

- GIVEN a request to `/api/user/upload` with an empty or malformed multipart body
- WHEN the route handles it
- THEN the server SHALL return `400` (not `500`)

#### Scenario: Normal upload unaffected

- GIVEN a single valid image part within the size limit
- WHEN the route stores it
- THEN the upload proceeds and returns the signed URL

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `src/config/env.ts` | Modify | Add `CORS_ORIGINS` validation |
| `src/network/server.ts` | Modify | Configure CORS with allowlist, remove x-powered-by and redundant headers |
| `README.md` | Modify | Document `CORS_ORIGINS` environment variable |

## Non-Goals

- Implementing per-route CORS configuration (rejected, overkill for current use case)
- Adding CORS headers to error responses manually (rejected, @fastify/cors handles this)
- Supporting regex or wildcard patterns in CORS_ORIGINS (rejected, keep it simple)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Clients break when CORS_ORIGINS is set | Medium | High | Default to `*` when not set (backward compatible) |
| Misconfigured CORS_ORIGINS blocks legitimate clients | Medium | Medium | Document the format clearly, provide examples |
| Removing x-powered-by breaks clients that depend on it | Low | Low | No known clients depend on this header |

## Success Criteria

- [ ] `CORS_ORIGINS` added to `src/config/env.ts` with proper validation
- [ ] CORS configured with allowlist when `CORS_ORIGINS` is set
- [ ] CORS defaults to allow all origins when `CORS_ORIGINS` is not set
- [ ] `x-powered-by: Simba.js` header removed
- [ ] Redundant CORS headers removed from preHandler
- [ ] `README.md` updated with `CORS_ORIGINS` documentation
- [ ] Manual testing confirms CORS works with allowlist
- [ ] Manual testing confirms backward compatibility (no CORS_ORIGINS = allow all)

## Dependencies

- No external dependencies
- Existing `@fastify/cors` plugin already installed
