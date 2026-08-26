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

# CD-14: render the final broker config from the baked base plus the 8883 TLS
# listener. mosquitto 2.x cannot expand env vars in config files, so the TLS
# block is appended from MOSQUITTO_TLS_*_B64 env provided by compose. The
# certificates travel as base64 content (single-line, secret-friendly) and are
# materialized into the existing config-private volume by the entrypoint, so
# no host bind or shared volume is required (Coolify-compatible). The listener
# stays disabled until all three envs are set (no plaintext 8883 fallback).
tls_ca_b64="${MOSQUITTO_TLS_CA_B64:-}"
tls_cert_b64="${MOSQUITTO_TLS_CERT_B64:-}"
tls_key_b64="${MOSQUITTO_TLS_KEY_B64:-}"

: > "$rendered_config"
cat "$base_config" >> "$rendered_config"

tls_dir="/mosquitto/config-private/certs"
tls_cafile=""
tls_certfile=""
tls_keyfile=""

if [ -n "$tls_ca_b64" ] || [ -n "$tls_cert_b64" ] || [ -n "$tls_key_b64" ]; then
  if [ -z "$tls_ca_b64" ] || [ -z "$tls_cert_b64" ] || [ -z "$tls_key_b64" ]; then
    echo "[doorcloud] MOSQUITTO_TLS_CA_B64, MOSQUITTO_TLS_CERT_B64 and MOSQUITTO_TLS_KEY_B64 must all be set together" >&2
    exit 1
  fi

  mkdir -p "$tls_dir"
  tls_cafile="$tls_dir/ca.crt"
  tls_certfile="$tls_dir/server.crt"
  tls_keyfile="$tls_dir/server.key"
  printf '%s' "$tls_ca_b64" | base64 -d > "$tls_cafile"
  printf '%s' "$tls_cert_b64" | base64 -d > "$tls_certfile"
  printf '%s' "$tls_key_b64" | base64 -d > "$tls_keyfile"
  chown mosquitto:mosquitto "$tls_cafile" "$tls_certfile" "$tls_keyfile" 2>/dev/null || true
  chmod 644 "$tls_cafile" "$tls_certfile" 2>/dev/null || true
  chmod 600 "$tls_keyfile" 2>/dev/null || true

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
echo "[doorcloud] passwordfile generated for: $backend_user, $device_user"

exec mosquitto -c "$rendered_config"
