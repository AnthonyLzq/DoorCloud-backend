#!/bin/sh
set -eu

base_config="${1:-/mosquitto/config/mosquitto.conf}"
target="/mosquitto/config-private/passwordfile"
rendered_config="/mosquitto/config-private/mosquitto.conf"
backend_user="${MQTT_USER:-${MOSQUITTO_BACKEND_USER:-doorcloud-backend}}"
backend_pass="${MQTT_PASS:-${MOSQUITTO_BACKEND_PASSWORD:-doorcloud-backend-local}}"
device_user="${MQTT_DEVICE_USER:-doorcloud-device}"
device_pass="${MQTT_DEVICE_PASS:-doorcloud-device-local}"

mkdir -p "$(dirname "$target")"
rm -f "$target"
mosquitto_passwd -b -c "$target" "$backend_user" "$backend_pass"
mosquitto_passwd -b "$target" "$device_user" "$device_pass"
chown mosquitto:mosquitto "$target" 2>/dev/null || true
chmod 600 "$target"

# T5.3: render the final broker config from the baked base plus the 8883 TLS
# listener. mosquitto 2.x cannot expand env vars in config files, so the TLS
# block is appended from the MOSQUITTO_TLS_* env provided by compose; it
# stays disabled until all three paths are set (no plaintext 8883 fallback).
tls_cafile="${MOSQUITTO_TLS_CAFILE:-}"
tls_certfile="${MOSQUITTO_TLS_CERTFILE:-}"
tls_keyfile="${MOSQUITTO_TLS_KEYFILE:-}"

: > "$rendered_config"
cat "$base_config" >> "$rendered_config"

if [ -n "$tls_cafile" ] || [ -n "$tls_certfile" ] || [ -n "$tls_keyfile" ]; then
  if [ -z "$tls_cafile" ] || [ -z "$tls_certfile" ] || [ -z "$tls_keyfile" ]; then
    echo "[doorcloud] MOSQUITTO_TLS_CAFILE, MOSQUITTO_TLS_CERTFILE and MOSQUITTO_TLS_KEYFILE must all be set together" >&2
    exit 1
  fi
  cat >> "$rendered_config" <<EOF

listener 8883 0.0.0.0
cafile $tls_cafile
certfile $tls_certfile
keyfile $tls_keyfile
EOF
  echo "[doorcloud] 8883 TLS listener enabled"
fi

chown mosquitto:mosquitto "$rendered_config" 2>/dev/null || true
chmod 644 "$rendered_config"
if [ -n "$tls_cafile" ]; then
  # Bind-mounted certs keep host ownership; make them readable by the broker
  # user when the entrypoint runs as root (no-op otherwise).
  chown mosquitto:mosquitto "$tls_cafile" "$tls_certfile" "$tls_keyfile" 2>/dev/null || true
fi
echo "[doorcloud] passwordfile generated for: $backend_user, $device_user"

exec mosquitto -c "$rendered_config"
