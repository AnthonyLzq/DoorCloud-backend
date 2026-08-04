#!/usr/bin/env sh
set -eu

password_file="${1:-infra/mosquitto/passwordfile}"
password_dir="$(dirname "$password_file")"
password_name="$(basename "$password_file")"
backend_user="${MQTT_USER:-${MOSQUITTO_BACKEND_USER:-doorcloud-backend}}"
backend_password="${MQTT_PASS:-${MOSQUITTO_BACKEND_PASSWORD:-doorcloud-backend-local}}"
device_user="doorcloud-device"
device_password="${MOSQUITTO_DEVICE_PASSWORD:-doorcloud-device-local}"

mkdir -p "$password_dir"
rm -f "$password_file"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD/$password_dir:/mosquitto-passwords" \
  eclipse-mosquitto:2 \
  mosquitto_passwd -b -c "/mosquitto-passwords/$password_name" \
  "$backend_user" "$backend_password"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD/$password_dir:/mosquitto-passwords" \
  eclipse-mosquitto:2 \
  mosquitto_passwd -b "/mosquitto-passwords/$password_name" \
  "$device_user" "$device_password"

chmod 644 "$password_file"
echo "Created $password_file for users: $backend_user, $device_user"
