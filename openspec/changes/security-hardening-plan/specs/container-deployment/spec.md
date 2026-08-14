# Delta for Container Deployment

## ADDED Requirements

### CD-11: Non-root container runtime

The image MUST run the backend as a non-root user with ownership of the
writable runtime paths (photos, state, models), and MUST NOT run as root.

#### Scenario: Non-root process

- GIVEN a started container
- THEN the main process runs with a non-zero uid

#### Scenario: Writable runtime paths

- GIVEN photos and state are mounted on volumes
- THEN the non-root user can read and write them

#### Scenario: Signals and healthcheck intact

- GIVEN the container runs non-root
- THEN `/healthz` stays reachable and SIGTERM still drains cleanly

### CD-12: Checksum-pinned model downloads

Model download scripts MUST verify a pinned sha256 checksum of the artifact
before extraction or use.

#### Scenario: Verified download

- GIVEN the model artifact downloads
- THEN its sha256 matches the pinned value before extraction

#### Scenario: Checksum mismatch fails

- GIVEN the downloaded bytes do not match the pin
- THEN the download fails and no extraction occurs

### CD-13: MQTT network surface

The compose stack MUST NOT publish MQTT (1883) or OpenWA (2785) ports to the
host; broker traffic MUST stay on the internal compose network. MQTT
credentials MUST be required in production compose (no default fallback), and
the generated mosquitto `passwordfile` MUST be gitignored.

#### Scenario: Ports not published

- GIVEN `docker compose ps` runs
- THEN no 1883/2785 host port mappings are published

#### Scenario: Internal connectivity intact

- GIVEN backend and mosquitto share the compose network
- THEN the backend still connects to `mosquitto` on 1883 internally

#### Scenario: Default creds rejected

- GIVEN production compose runs without `MQTT_PASS` set
- THEN compose fails fast instead of starting with default credentials

#### Scenario: Passwordfile untracked

- GIVEN git status
- THEN `infra/mosquitto/passwordfile` is not tracked

## MODIFIED Requirements

### CD-7: Compose doorcloud service

The root `docker-compose.yaml` MUST define a `doorcloud` service that joins the same
network as `mosquitto` and `openwa`, sets `MQTT_HOST=mosquitto`, loads a source
`.env` via `env_file`, uses `restart: unless-stopped`, exposes the healthcheck
on `/healthz`, and mounts runtime state. Secret variables (`SETUP_TOKEN`,
`WEB_AUTH_*`, `MQTT_*`) MUST be referenced with `${VAR:?}` so a missing
variable aborts compose instead of shipping open.
(Previously: secrets fell back to empty/default values with `${VAR:-}`)

#### Scenario: MQTT to broker

- GIVEN the `doorcloud` and `mosquitto` services are up on one network
- WHEN the backend connects
- THEN it publishes/subscribes against host `mosquitto` on port `1883`

#### Scenario: Restart on crash

- GIVEN the `doorcloud` process exits unexpectedly
- THEN Compose restarts the service because `restart: unless-stopped` is set

#### Scenario: Missing secret aborts compose

- GIVEN SETUP_TOKEN is unset in the environment
- WHEN `docker compose up` runs
- THEN compose fails fast with a substitution error