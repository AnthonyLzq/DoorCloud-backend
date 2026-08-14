# Delta for CI Mosquitto Integration

## MODIFIED Requirements

### REQ-3: Environment Variables

The CI job SHALL provide required MQTT environment variables for integration
tests. The broker port SHALL come from a single source shared by the compose
port mapping and the test script, so they can never drift apart.
(Previously: compose hardcoded `1883:1883` while the test script defaulted to
`MOSQUITTO_PORT=1884`, a pre-existing port mismatch)

**Scenarios:**

- **Given** the MQTT integration tests run
- **When** the test suite connects to Mosquitto
- **Then** `MQTT_HOST` SHALL be set to `localhost`
- **And** `MQTT_PORT` SHALL be set to the mapped port
- **And** `MQTT_USER` SHALL be set to the test user
- **And** `MQTT_PASS` SHALL be set to the test password
- **And** `MQTT_PROTOCOL` SHALL be set to `mqtt` (not `mqtts` for local testing)

- **Given** a single `MOSQUITTO_PORT` variable drives the CI compose mapping
- **When** `run-integration-tests.sh` and the compose service both read it
- **Then** both connect on the same port

- **Given** `MOSQUITTO_PORT` differs from the default (e.g., 1884)
- **When** the CI job starts the broker
- **Then** `MQTT_PORT` matches the mapped port and the tests connect successfully