# Device Firmware MQTT Cutover (Deferred Follow-up)

Status: DEFERRED. This document makes the deferral explicit instead of
silently breaking devices when the MQTT network surface is reduced.

## What changed (Slice 5, SEC-03 / CD-13)

The production compose stack no longer publishes MQTT (1883) or OpenWA
(2785) ports to the host; broker traffic stays on the internal compose
network. `MQTT_PASS` is now required in compose (`${MQTT_PASS:?}`, no
default fallback), and the generated `infra/mosquitto/passwordfile` is
gitignored.

## Device impact

Anything that reached the broker through a published plaintext
`tcp://<host>:1883` loses host access once the port mapping is gone:

- `apps/backend/scripts/photo-send.ts` (device CLI) defaults to plaintext
  `localhost:1883` with `MQTT_DEVICE_USER` / `MQTT_DEVICE_PASS`.
- Physical firmware that connects to `<host>:1883` over the LAN.

The broker itself is unchanged inside the compose network
(`mosquitto:1883`), and the compose stack still carries the
`MQTT_DEVICE_USER` / `MQTT_DEVICE_PASS` device account.

## Options for devices

1. Internal network: run the device on the same compose network and target
   `mosquitto:1883` (no host mapping needed).
2. TLS cutover: connect to the config-ready 8883 listener once certificates
   are provisioned (below).

## TLS cutover timing (8883)

The 8883 listener is config-ready but dormant: `password-generator.sh`
appends it to the rendered broker config when `MOSQUITTO_TLS_CAFILE`,
`MOSQUITTO_TLS_CERTFILE` and `MOSQUITTO_TLS_KEYFILE` are all set in compose
(mosquitto 2.x cannot expand env vars in config files, so the entrypoint
renders them). Until then, 8883 is not listening.

1. Provision a CA and a server certificate for the broker host.
2. Mount the certs into the mosquitto container (bake into the image or add
   a volume) and set the three `MOSQUITTO_TLS_*` env vars in compose.
3. Point devices at `mqtts://<host>:8883` with the CA pinned, switch
   `MQTT_PROTOCOL` to `mqtts`, and use `MQTT_DEVICE_USER` /
   `MQTT_DEVICE_PASS`.
4. Update `apps/backend/scripts/photo-send.ts` defaults to TLS once
   firmware has cut over.

## Follow-up checklist

- [ ] Provision broker CA + server certificates.
- [ ] Set `MOSQUITTO_TLS_*` in the deploy environment to activate 8883.
- [ ] Update device firmware endpoint to `mqtts://<host>:8883` with CA pin.
- [ ] Update `photo-send.ts` defaults to `mqtts` after firmware cutover.
