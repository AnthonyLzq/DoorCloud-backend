# Delta for HTTP Security Hardening

## MODIFIED Requirements

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

(Previously: when unset or empty, the system defaulted to allowing all origins (`*`).)

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

(Previously: when unset, the plugin was configured with `origin: true`, reflecting any requested `Origin`.)

## ADDED Requirements

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
