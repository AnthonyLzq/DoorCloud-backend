#!/bin/sh
set -eu

config_path="${1:-/mosquitto/config/mosquitto.conf}"
target="/mosquitto/config-private/passwordfile"
backend_user="${MQTT_USER:-${MOSQUITTO_BACKEND_USER:-doorcloud-backend}}"
backend_pass="${MQTT_PASS:-${MOSQUITTO_BACKEND_PASSWORD:-doorcloud-backend-local}}"
device_user="${MQTT_DEVICE_USER:-doorcloud-device}"
device_pass="${MQTT_DEVICE_PASS:-doorcloud-device-local}"

mkdir -p "$(dirname "$target")"
rm -f "$target"
mosquitto_passwd -b -c "$target" "$backend_user" "$backend_pass"
mosquitto_passwd -b "$target" "$device_user" "$device_pass"
chmod 600 "$target"
echo "[doorcloud] passwordfile generated for: $backend_user, $device_user"

exec mosquitto -c "$config_path"