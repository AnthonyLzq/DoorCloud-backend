# Spec: CI Mosquitto Integration

## Overview

Add a GitHub Actions workflow job that runs MQTT integration tests using a local Mosquitto broker in Docker. This ensures MQTT functionality is validated on every push, matching the local development experience.

## Requirements

### REQ-1: Mosquitto Integration Test Job

The CI pipeline SHALL include a dedicated job for MQTT integration tests.

**Scenarios:**

- **Given** a push to the main branch or a pull request
- **When** GitHub Actions triggers the CI workflow
- **Then** a job named `mqtt-integration` SHALL run
- **And** the job SHALL start a Mosquitto broker using Docker Compose
- **And** the job SHALL run `pnpm test:mqtt`
- **And** the job SHALL pass only if all MQTT integration tests pass

### REQ-2: Mosquitto Service Configuration

The CI job SHALL configure Mosquitto with authentication and proper health checks.

**Scenarios:**

- **Given** the CI job starts the Mosquitto service
- **When** the service is initialized
- **Then** the password file SHALL be generated using `scripts/mosquitto/create-password-file.sh`
- **And** the Mosquitto container SHALL use the configuration from `infra/mosquitto/mosquitto.conf`
- **And** the Mosquitto container SHALL use the ACL file from `infra/mosquitto/aclfile`
- **And** the job SHALL wait for the Mosquitto healthcheck to pass before running tests

### REQ-3: Environment Variables

The CI job SHALL provide required MQTT environment variables for integration tests.

**Scenarios:**

- **Given** the MQTT integration tests run
- **When** the test suite connects to Mosquitto
- **Then** `MQTT_HOST` SHALL be set to `localhost`
- **And** `MQTT_PORT` SHALL be set to `1883` (or the mapped port)
- **And** `MQTT_USER` SHALL be set to the test user
- **And** `MQTT_PASS` SHALL be set to the test password
- **And** `MQTT_PROTOCOL` SHALL be set to `mqtt` (not `mqtts` for local testing)

### REQ-4: Job Dependencies

The MQTT integration job SHALL run in parallel with other test jobs but after setup.

**Scenarios:**

- **Given** the CI workflow is triggered
- **When** jobs are scheduled
- **Then** the `mqtt-integration` job SHALL run in parallel with `test` and `lint` jobs
- **And** the job SHALL NOT depend on the success of other jobs (independent validation)
- **And** the job SHALL use the same Node.js and pnpm versions as other jobs

### REQ-5: Failure Handling

The CI job SHALL fail clearly when MQTT integration tests fail.

**Scenarios:**

- **Given** an MQTT integration test fails
- **When** the test suite completes
- **Then** the job SHALL exit with a non-zero status code
- **And** the job logs SHALL show which test(s) failed
- **And** the job SHALL NOT mask or ignore MQTT-specific errors

### REQ-6: Cleanup

The CI job SHALL clean up Docker resources after tests complete.

**Scenarios:**

- **Given** the MQTT integration tests complete (pass or fail)
- **When** the job finishes
- **Then** Docker containers SHALL be stopped
- **And** Docker volumes SHALL be removed
- **And** no orphaned containers SHALL remain on the runner

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/test.yml` | Modify | Add `mqtt-integration` job |
| `scripts/mosquitto/run-integration-tests.sh` | Verify | Ensure script works in CI environment |

## Non-Goals

- Running Mosquitto without Docker (rejected, inconsistent with local setup)
- Testing against external MQTT brokers in CI (rejected, adds external dependencies)
- Modifying the integration test logic (out of scope, tests already exist)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Docker not available in CI runner | Low | High | Use GitHub-hosted runners with Docker pre-installed |
| Mosquitto startup takes too long | Low | Medium | Add healthcheck wait with timeout |
| Port conflicts in CI | Low | Medium | Use non-standard port (1884) if needed |
| Password file generation fails | Low | Medium | Verify script permissions and dependencies |

## Success Criteria

- [ ] `mqtt-integration` job added to `.github/workflows/test.yml`
- [ ] Job starts Mosquitto using Docker Compose
- [ ] Job waits for Mosquitto healthcheck
- [ ] Job runs `pnpm test:mqtt` successfully
- [ ] Job fails when tests fail
- [ ] Job cleans up Docker resources
- [ ] CI passes on a test PR with this change

## Dependencies

- Docker must be available in GitHub Actions runners (standard for ubuntu-latest)
- `scripts/mosquitto/run-integration-tests.sh` must work in CI environment
- `infra/mosquitto/` configuration files must be present
