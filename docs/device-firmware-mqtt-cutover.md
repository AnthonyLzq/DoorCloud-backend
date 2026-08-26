# Device Firmware MQTT Cutover (TLS)

Status: DESIGN READY (2026-08-26). Broker-side TLS is implemented as an
**opt-in, Coolify-compatible** listener (8883). Dormant by default (no
plaintext fallback). Nothing changes for the current deployment until the
three `MOSQUITTO_TLS_*_B64` env vars are set.

## Why env-content (base64) instead of file paths

- Coolify's compose parser cannot bind **repo-relative** files into
  containers (baking a private key into the image is worse: image layers).
- mosquitto 2.x cannot expand env vars in config files.
- So the certificates travel as **base64 content** through env vars (secrets
  per app in Coolify UI, or the local gitignored `.env`); the entrypoint
  materializes them into the existing `config-private` volume and renders the
  listener. Same pattern as the passwordfile.

## Activate the 8883 TLS listener

1. Generate a CA + server certificate (see recipe below) in
   `infra/mosquitto/certs/` (gitignored, never commit).
2. Base64-encode and set all three env vars **together** (all-or-nothing,
   fail-closed) at the mosquitto service:

```bash
export MOSQUITTO_TLS_CA_B64="$(base64 -w0 infra/mosquitto/certs/ca.crt)"
export MOSQUITTO_TLS_CERT_B64="$(base64 -w0 infra/mosquitto/certs/server.crt)"
export MOSQUITTO_TLS_KEY_B64="$(base64 -w0 infra/mosquitto/certs/server.key)"
```

   - Local: put the three lines in the gitignored `.env` and
     `docker compose up -d --build mosquitto`.
   - Coolify: set them as app env vars (or database-type secrets) before the
     next deploy; the 8883 port is already published by the compose file.
3. Verify: `docker logs doorcloud-mosquitto | grep "8883 TLS listener enabled"`
   and connect with the CA pinned, e.g.
   `mosquitto_sub -h <host> -p 8883 --cafile ca.crt -u doorcloud-device -P '<pass>'`.

## Generating certificates (per deployment)

```bash
mkdir -p infra/mosquitto/certs && cd infra/mosquitto/certs
openssl genrsa -out ca.key 4096
openssl req -x509 -new -key ca.key -sha256 -days 3650 -out ca.crt \
  -subj "/CN=DoorCloud LAN CA"
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/CN=doorcloud-broker"
printf "subjectAltName=DNS:mosquitto,DNS:localhost,DNS:doorcloud.noirsystems.net,IP:127.0.0.1,IP:192.168.176.4\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n" > san.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 825 -sha256 -extfile san.ext
rm -f server.csr san.ext
```

Adjust the SAN list (DNS/IP) to the real broker endpoints before deploying.
Keep `ca.key` offline (only needed to sign more certs).

## Device side (when a device exists)

- Physical firmware endpoint: `mqtts://<broker-host>:8883`, username
  `MQTT_DEVICE_USER`, password `MQTT_DEVICE_PASS`, CA pinned (the same
  `ca.crt` content).
- `apps/backend/scripts/photo-send.ts` still defaults to plaintext (dev
  harness); switch its defaults to `mqtts:8883` (+ `MQTT_CA`) at the same
  time the firmware cuts over.

## Security notes

- `allow_anonymous false` + ACLs apply to both listeners (1883 internal,
  8883 TLS device surface).
- 1883 has no host mapping (CD-13); 8883 is published but **dormant** until
  the TLS envs are set (connection refused, no plaintext fallback).
- The internal backend still uses `mosquitto:1883` plaintext inside the
  trusted compose network (CD-7, accepted).

## Follow-up checklist

- [ ] (optional local) Set `MOSQUITTO_TLS_*_B64` in `.env` to activate 8883.
- [ ] (prod, when ready) Set the same envs in Coolify and verify 8883 there.
- [ ] Point the physical firmware at `mqtts://<host>:8883` + CA pin.
- [ ] Switch `photo-send.ts` defaults to `mqtts` after firmware cutover.
