# Device Firmware MQTT Cutover (TLS)

Status: PARTIALLY DONE (2026-08-26). The broker-side 8883 TLS listener is
**active** in the local compose stack; the device CLI defaults to `mqtts`.
Physical firmware must still point at `mqtts://<broker-host>:8883` with the CA
pinned, and the Coolify production deploy must mount its own certs.

## Broker side (done)

- Provisioned a per-deployment CA + broker server certificate in
  `infra/mosquitto/certs/` (gitignored, never committed). SAN covers
  `mosquitto`, `localhost`, `doorcloud.noirsystems.net`, `127.0.0.1` and the
  LAN IP.
- `docker-compose.yaml` mosquitto service mounts `infra/mosquitto/certs` at
  `/mosquitto/certs` (read-only) and sets the `MOSQUITTO_TLS_*` defaults to
  those container paths; the 8883 listener is published on the host.
- `password-generator.sh` renders the 8883 listener on startup (fail-closed:
  no plaintext 8883 fallback) and adjusts cert ownership for the broker user.
- Verified live: TLS CONNACK 0 with backend and device credentials; host-side
  `mqtts://localhost:8883` connection with CA pin succeeds, and without the
  CA the handshake is rejected (self-signed chain).

## Device side (pending, hardware)

- Physical firmware endpoint: `mqtts://<broker-host>:8883`, username
  `MQTT_DEVICE_USER`, password `MQTT_DEVICE_PASS`, CA pinned (same
  `infra/mosquitto/certs/ca.crt` content).
- CLI tool default is already TLS (`apps/backend/scripts/photo-send.ts`:
  `MQTT_PROTOCOL=mqtts`, `MQTT_PORT=8883`, `MQTT_CA` default
  `../../infra/mosquitto/certs/ca.crt`).

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

## Production (Coolify) notes

- The compose defaults point at `/mosquitto/certs/*` inside the container;
  Coolify must provide those files (own volume/secret) and/or override
  `MOSQUITTO_TLS_CAFILE` / `MOSQUITTO_TLS_CERTFILE` / `MOSQUITTO_TLS_KEYFILE`
  with the container paths. 1883 stays internal-only (CD-13).
- Passwordfile is regenerated per boot (`password-generator.sh`), keep the
  Mosquitto password env vars set.

## Follow-up checklist

- [x] Provision broker CA + server certificates (local stack).
- [x] Set `MOSQUITTO_TLS_*` (compose defaults) to activate 8883.
- [ ] Provision certs in the Coolify production environment (same material,
      own mount) and verify 8883 there.
- [ ] Update physical firmware endpoint to `mqtts://<host>:8883` with CA pin.
- [x] Update `photo-send.ts` defaults to `mqtts` (CA pulled from repo certs).
