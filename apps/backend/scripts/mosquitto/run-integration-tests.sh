#!/usr/bin/env sh
set -eu

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not available. Start Docker before running MQTT integration tests." >&2
  exit 1
fi

# The backend runs from apps/backend; compose.yaml lives at the repo root.
# The integration overlay publishes the broker on MOSQUITTO_PORT (REQ-3);
# the base compose stays port-free so CD-13 holds for production.
COMPOSE="docker compose -f ../../docker-compose.yaml -f ../../docker-compose.integration.yaml"

cleanup() {
  $COMPOSE down --volumes >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

# REQ-3: one MOSQUITTO_PORT source drives the compose host mapping and this
# script, so the tests always connect to the mapped port (no 1883/1884 drift).
mosquitto_port="${MOSQUITTO_PORT:-1884}"
export MOSQUITTO_PORT="$mosquitto_port"

# CD-13: compose requires MQTT_PASS (${MQTT_PASS:?}) with no default
# fallback; the integration harness supplies the test credentials instead.
export MQTT_USER="${MQTT_USER:-doorcloud-backend}"
export MQTT_PASS="${MQTT_PASS:-doorcloud-backend-local}"

# Compose interpolates the whole file (all services) even when only
# mosquitto is started, so provide dev-only values for the doorcloud
# required vars. mosquitto never receives them; they exist so the harness
# can boot the broker without a full production environment.
export SETUP_TOKEN="${SETUP_TOKEN:-dev-setup-token}"
export WEB_AUTH_USER="${WEB_AUTH_USER:-dev}"
export WEB_AUTH_PASS="${WEB_AUTH_PASS:-dev}"
export PHOTOS_URL_SECRET="${PHOTOS_URL_SECRET:-dev}"
export USER_NAME="${USER_NAME:-Dev}"
export MODELS_CDN_URL="${MODELS_CDN_URL:-https://models.example.com}"

./scripts/mosquitto/create-password-file.sh ../../infra/mosquitto/passwordfile
$COMPOSE up -d mosquitto

container_id="$($COMPOSE ps -q mosquitto)"

if [ -z "$container_id" ]; then
  $COMPOSE logs mosquitto >&2
  exit 1
fi

attempts=0
while [ "$attempts" -lt 30 ]; do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$container_id" 2>/dev/null || echo starting)"

  if [ "$status" = "healthy" ]; then
    break
  fi

  if [ "$status" = "unhealthy" ]; then
    $COMPOSE logs mosquitto >&2
    exit 1
  fi

  attempts=$((attempts + 1))
  sleep 1
done

if [ "$status" != "healthy" ]; then
  $COMPOSE logs mosquitto >&2
  echo "Mosquitto did not become healthy in time." >&2
  exit 1
fi

RUN_MQTT_INTEGRATION=true \
MQTT_HOST=127.0.0.1 \
MQTT_PROTOCOL=mqtt \
MQTT_PORT="$mosquitto_port" \
MQTT_USER="$MQTT_USER" \
MQTT_PASS="$MQTT_PASS" \
pnpm test:mqtt:integration
