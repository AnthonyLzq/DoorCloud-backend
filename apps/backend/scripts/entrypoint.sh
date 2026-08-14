#!/bin/bash
# DoorCloud production entrypoint
# CD-7/CD-11: fail fast when required secrets are missing at runtime (compose
# enforces the same set at config time; this guards direct `docker run` and
# orchestrators that bypass compose interpolation). Provisions the ONNX models
# volume on first boot (or after wipe) and then starts the backend from the
# compiled dist root as the non-root doorcloud user. tsx is installed globally
# in the image, so the same TypeScript downloader used by dev/CI runs here too.
set -euo pipefail

: "${SETUP_TOKEN:?SETUP_TOKEN is required}"
: "${WEB_AUTH_USER:?WEB_AUTH_USER is required}"
: "${WEB_AUTH_PASS:?WEB_AUTH_PASS is required}"
: "${MQTT_PASS:?MQTT_PASS is required}"
: "${PHOTOS_URL_SECRET:?PHOTOS_URL_SECRET is required}"
: "${USER_NAME:?USER_NAME is required}"

MODELS_DIR=/app/apps/backend/models
INSIGHTFACE_DIR="$MODELS_DIR/insightface"
DET="$INSIGHTFACE_DIR/det_500m.onnx"
REC="$INSIGHTFACE_DIR/w600k_mbf.onnx"

# CD-11: chown guard. Fresh named volumes inherit the doorcloud ownership
# baked into the image, but a pre-existing root-owned volume (created before
# the non-root migration, or by a manual `docker run --user 0`) needs the
# ownership re-applied. When running as root, fix and continue; when already
# non-root, fail fast with an actionable message instead of failing obscurely
# later at the first write.
if ! [ -w /data/photos ] || ! [ -w /data/state ] || ! [ -w "$MODELS_DIR" ]; then
  if [ "$(id -u)" -eq 0 ]; then
    echo "[doorcloud] fixing ownership of runtime dirs (chown guard)..."
    chown -R doorcloud:doorcloud /data/photos /data/state "$MODELS_DIR"
  else
    echo "[doorcloud] ERROR: runtime dirs are not writable by uid $(id -u)." >&2
    echo "[doorcloud] One-time fix for pre-existing volumes (or re-create them):" >&2
    echo "[doorcloud]   docker run --rm --user 0 doorcloud \\" >&2
    echo "[doorcloud]     chown -R doorcloud:doorcloud \\" >&2
    echo "[doorcloud]       /data/photos /data/state $MODELS_DIR" >&2
    exit 1
  fi
fi

if [ ! -f "$DET" ] || [ ! -f "$REC" ]; then
  echo "[doorcloud] production ONNX models missing, downloading on first boot..."
  cd /app/apps/backend
  tsx scripts/download-models.prod.ts
else
  echo "[doorcloud] production ONNX models present"
fi

# CD-3: dist-root lock. WORKDIR is the compiled dist root; `node index.js`
# resolves to dist/index.js. `exec` keeps PID 1 = the app so SIGTERM (CD-2)
# reaches the process directly (healthcheck stays intact, CD-11).
cd /app/apps/backend/dist
exec node index.js
