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
- **And** if `CORS_ORIGINS` is not set or empty, the system SHALL default to allowing all origins (`*`)

- **Given** `CORS_ORIGINS` is set to `http://localhost:3000,https://app.doorcloud.com`
- **When** the environment is parsed
- **Then** the system SHALL parse it as an array of two origins: `['http://localhost:3000', 'https://app.doorcloud.com']`

- **Given** `CORS_ORIGINS` is set to a single origin `https://app.doorcloud.com`
- **When** the environment is parsed
- **Then** the system SHALL parse it as an array of one origin: `['https://app.doorcloud.com']`

### REQ-2: CORS Configuration with Allowlist

The Fastify CORS plugin SHALL be configured with the parsed origins.

**Scenarios:**

- **Given** `CORS_ORIGINS` is set to `http://localhost:3000,https://app.doorcloud.com`
- **When** the Fastify CORS plugin is registered
- **Then** the plugin SHALL be configured with `origin: ['http://localhost:3000', 'https://app.doorcloud.com']`
- **And** requests from `http://localhost:3000` SHALL be allowed
- **And** requests from `https://app.doorcloud.com` SHALL be allowed
- **And** requests from `https://evil.com` SHALL be rejected with CORS error

- **Given** `CORS_ORIGINS` is not set
- **When** the Fastify CORS plugin is registered
- **Then** the plugin SHALL be configured with `origin: true` (allow all origins, backward compatible)
- **And** requests from any origin SHALL be allowed

- **Given** `CORS_ORIGINS` is set to `*`
- **When** the Fastify CORS plugin is registered
- **Then** the plugin SHALL be configured with `origin: true` (allow all origins)
- **And** this SHALL be equivalent to not setting `CORS_ORIGINS`

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
