#!/bin/bash
# DoorCloud production entrypoint
# Provisions the ONNX models volume on first boot (or after wipe) and then
# starts the backend from the compiled dist root. tsx is installed globally in
# the image, so the same TypeScript downloader used by dev/CI runs here too.
set -euo pipefail

MODELS_DIR=/app/apps/backend/models
INSIGHTFACE_DIR="$MODELS_DIR/insightface"
DET="$INSIGHTFACE_DIR/det_500m.onnx"
REC="$INSIGHTFACE_DIR/w600k_mbf.onnx"

if [ ! -f "$DET" ] || [ ! -f "$REC" ]; then
  echo "[doorcloud] production ONNX models missing, downloading on first boot..."
  cd /app/apps/backend
  tsx scripts/download-models.prod.ts
else
  echo "[doorcloud] production ONNX models present"
fi

# CD-3: dist-root lock. WORKDIR is the compiled dist root; `node index.js`
# resolves to dist/index.js. `exec` keeps PID 1 = the app so SIGTERM (CD-2)
# reaches the process directly.
cd /app/apps/backend/dist
exec node index.js
