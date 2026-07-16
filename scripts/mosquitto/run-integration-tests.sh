#!/usr/bin/env sh
set -eu

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not available. Start Docker before running MQTT integration tests." >&2
  exit 1
fi

cleanup() {
  docker compose down --volumes >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

./scripts/mosquitto/create-password-file.sh
docker compose up -d mosquitto

container_id="$(docker compose ps -q mosquitto)"

if [ -z "$container_id" ]; then
  docker compose logs mosquitto >&2
  exit 1
fi

attempts=0
while [ "$attempts" -lt 30 ]; do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$container_id" 2>/dev/null || echo starting)"

  if [ "$status" = "healthy" ]; then
    break
  fi

  if [ "$status" = "unhealthy" ]; then
    docker compose logs mosquitto >&2
    exit 1
  fi

  attempts=$((attempts + 1))
  sleep 1
done

if [ "$status" != "healthy" ]; then
  docker compose logs mosquitto >&2
  echo "Mosquitto did not become healthy in time." >&2
  exit 1
fi

RUN_MQTT_INTEGRATION=true \
MQTT_HOST=127.0.0.1 \
MQTT_PROTOCOL=mqtt \
MQTT_PORT=1883 \
MQTT_USER=doorcloud-backend \
MQTT_PASS="${MOSQUITTO_BACKEND_PASSWORD:-doorcloud-backend-local}" \
pnpm test:mqtt:integration
