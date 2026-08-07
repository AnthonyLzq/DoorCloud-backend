# Spec: Container Deployment

## Overview

Makes the backend image operatable as a production door service: a `/healthz`
liveness endpoint, graceful SIGTERM drain, a compose `doorcloud` service that
joins the existing mosquitto/openwa network, persistent photo + SQLite state,
and a runtime-`:ro` models mount. The SPA stays same-origin (served by the
backend, not a separate web container).

## Requirements

### CD-1: Liveness `/healthz`

The backend HTTP server MUST expose `GET /healthz` that returns HTTP `200`
without requiring authentication, without leaking environment, model, photo, or
user data, and bound to the configured `HOST` so a container healthcheck can
reach it.

#### Scenario: Healthcheck succeeds

- GIVEN a running backend
- WHEN `GET /healthz` is requested
- THEN the response is `200` with an empty/minimal body
- AND no token header or secret is required

#### Scenario: No sensitive data leaked

- GIVEN `GET /healthz` is requested
- THEN the response body MUST NOT include PHOTOS_URL_SECRET, SETUP_TOKEN,
  MQTT_PASS/USER, or photo/user identity

### CD-2: Graceful SIGTERM shutdown

On SIGTERM the backend MUST drain in-flight work within a grace period, then
exit cleanly; a bounded force-exit fallback MUST remain so the process cannot
hang past the container stop timeout.

#### Scenario: Clean drain

- GIVEN the container receives SIGTERM
- THEN it closes MQTT, shuts down the face-recognition service, closes the
  HTTP server, and exits 0 within the grace window

#### Scenario: Hung drain does not wedge

- GIVEN graceful shutdown has not completed by the limit
- THEN the process force-exits (non-zero) so the container stops unblocked

### CD-3: Image healthcheck and dist root

The Docker image MUST declare a `HEALTHCHECK` wired to the `/healthz` endpoint.
The runtime `dist` root MUST be `/app/apps/backend/dist` (no `src/` nesting)
so module-relative paths resolve (`backendRoot`/`repoRoot` stay stable).

#### Scenario: Healthy container

- GIVEN a booted image
- THEN `docker inspect` shows the healthcheck consulted `/healthz` and the
  container reaches `healthy`

#### Scenario: Boot failure surfaces

- GIVEN the process or its models fail to start
- WHEN the healthcheck window elapses
- THEN the container is marked `unhealthy` and Compose can restart per policy

#### Scenario: Dist root resolves paths

- GIVEN the image `WORKDIR`/`NODE_PATH` resolves to `/app/apps/backend/dist`
- THEN runtime path discovery points at `/app/apps/backend` without a `src/` nested dist

### CD-4: Image build via turbo

The Dockerfile MUST build the workspace through the turbo graph (shared first),
so the image contains a working `apps/backend/dist` and the SPA `dist` without
hand-wiring the shared build.

#### Scenario: Broad assembly

- GIVEN the Dockerfile runs the turbo build of the backend and shared packages
- THEN the image contains a working `apps/backend/dist` under the locked root

#### Scenario: No manual shared step

- GIVEN the image build omits the old standalone `pnpm --filter @doorcloud/shared build`
- THEN the dependency-graph build still produces a valid shared `dist` for consumers

## Compose Service

### CD-7: Compose doorcloud service

The root `compose.yaml` MUST define a `doorcloud` service that joins the same
network as `mosquitto` and `openwa`, sets `MQTT_HOST=mosquitto`, loads a source
`.env` via `env_file`, uses `restart: unless-stopped`, exposes the healthcheck
on `/healthz`, and mounts runtime state.

#### Scenario: MQTT to broker

- GIVEN the `doorcloud` and `mosquitto` services are up on one network
- WHEN the backend connects
- THEN it publishes/subscribes against host `mosquitto` on port `1883`

#### Scenario: Restart on crash

- GIVEN the `doorcloud` process exits unexpectedly
- THEN Compose restarts the service because `restart: unless-stopped` is set

### CD-8: Persistent volumes

`PHOTOS_DIR` and the SQLite `STATE_DB_PATH` MUST live on mounted volumes so
photos and `last_message_at` survive container recreation. `STATE_DB_PATH` MUST
be set inside a mounted path in `compose.yaml`.

#### Scenario: Photos persist

- GIVEN photos accumulate in the photo-volume under `PHOTOS_DIR`
- WHEN the container is recreated
- THEN those photos are still listed/stored

#### Scenario: State persists

- GIVEN `STATE_DB_PATH` points into a mounted volume
- WHEN the container is recreated
- THEN `last_message_at` is preserved

### CD-9: Runtime models mount

ONNX models MUST be mounted `:ro` from the host `MODELS_DIR` at runtime rather
than baked into the image, so the image stays small and models are swappable
without a rebuild. Non-ONNX/Python models are out of scope for the container.

#### Scenario: Models served

- GIVEN the models directory is mounted at the backend `MODELS_DIR` location
  with read-only mode
- WHEN the ONNX provider loads
- THEN untrained-face recognition initializes without a rebuild

#### Scenario: Missing runtime models

- GIVEN `MODELS_DIR` is not present at boot
- THEN startup fails fast and the container is marked unhealthy instead of
  reporting false liveness

## Env Handoff and Docs

### CD-10: Env handoff and README

The README Docker section MUST be corrected (image is `bookworm-slim`, not
Alpine; the SPA is same-origin; document the `doorcloud` compose service,
volumes, env variables, `MODELS_DIR` runtime mount, and the `docker compose up`
run path). The `.env` handoff for the container MUST be documented including
which variables are hard-required (`MQTT_*`, `PHOTOS_*`, `PHOTOS_URL_SECRET`,
`USER_NAME`) versus optional.

#### Scenario: README reflects reality

- GIVEN a fresh operator reads the Docker section
- THEN it states the `bookworm-slim` base, the compose `doorcloud` usage, the
  mounted volume/state/modals, and required env, with no dropped Alpine claim

#### Scenario: Env handoff complete

- GIVEN a user launches via `docker compose`
- THEN every variable needed by `env.ts` validation is supplied through
  `env_file`/`environment` so the service boots

## Non-Goals

Python/non-ONNX models in the image, a separate web container/CDN (SPA stays
same-origin), multi-instance scaling, cloud-specific deploy.