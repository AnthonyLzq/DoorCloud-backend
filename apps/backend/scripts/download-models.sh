#!/bin/bash
# scripts/download-models.sh
# Download ONNX models for face recognition benchmarking

set -e

MODELS_DIR="./models"
mkdir -p "$MODELS_DIR/insightface" "$MODELS_DIR/mediapipe" "$MODELS_DIR/dlib"

# CD-12 supply-chain pin: sha256 of buffalo_s.zip as served from the
# configured CDN (GitHub release v0.7). Computed Aug 2026 from the live
# artifact; keep in sync with download-models.checksum.ts (the TS source of
# truth for the production downloader).
BUFFALO_S_SHA256="d85a87f503f691807cd8bb97128bdf7a0660326cd9cd02657127fa978bab8b5e"

# Function to extract zip files using Python (fallback if unzip is not available)
extract_zip() {
  local zip_file="$1"
  local dest_dir="$2"
  
  if command -v unzip &> /dev/null; then
    unzip -q "$zip_file" -d "$dest_dir"
  else
    echo "  Using Python to extract..."
    python3 -c "import zipfile; zipfile.ZipFile('$zip_file').extractall('$dest_dir')"
  fi
}

# CD-12: verify a downloaded artifact against a pinned sha256. A mismatch
# aborts (removing the artifact) so no extraction ever runs on bad bytes.
verify_sha256() {
  local zip_file="$1"
  local expected="$2"
  if ! echo "$expected  $zip_file" | sha256sum --check --status -; then
    echo "ERROR: sha256 mismatch for $zip_file (supply chain check failed)" >&2
    rm -f "$zip_file"
    exit 1
  fi
  echo "  sha256 OK"
}

echo "Downloading ONNX models..."

# InsightFace buffalo_l (512D embeddings, 106 landmarks) - 288MB
if [ ! -f "$MODELS_DIR/insightface/det_10g.onnx" ] || [ ! -f "$MODELS_DIR/insightface/w600k_r50.onnx" ]; then
  echo "Downloading InsightFace buffalo_l (288MB)..."
  curl -L -o "$MODELS_DIR/insightface/buffalo_l.zip" \
    "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
  echo "Extracting buffalo_l..."
  extract_zip "$MODELS_DIR/insightface/buffalo_l.zip" "$MODELS_DIR/insightface/"
  rm "$MODELS_DIR/insightface/buffalo_l.zip"
  echo "✓ InsightFace buffalo_l downloaded"
fi

# InsightFace buffalo_m (512D embeddings, lighter) - 276MB
if [ ! -f "$MODELS_DIR/insightface/det_2.5g.onnx" ] || [ ! -f "$MODELS_DIR/insightface/buffalo_m_r50.onnx" ]; then
  echo "Downloading InsightFace buffalo_m (276MB)..."
  curl -L -o "$MODELS_DIR/insightface/buffalo_m.zip" \
    "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_m.zip"
  echo "Extracting buffalo_m..."
  extract_zip "$MODELS_DIR/insightface/buffalo_m.zip" "$MODELS_DIR/insightface/"
  rm "$MODELS_DIR/insightface/buffalo_m.zip"
  echo "✓ InsightFace buffalo_m downloaded"
fi

# InsightFace buffalo_s (512D embeddings, faster) - 128MB
if [ ! -f "$MODELS_DIR/insightface/det_500m.onnx" ] || [ ! -f "$MODELS_DIR/insightface/buffalo_s_mbtf.onnx" ]; then
  echo "Downloading InsightFace buffalo_s (128MB)..."
  curl -L -o "$MODELS_DIR/insightface/buffalo_s.zip" \
    "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip"
  # CD-12: verify the pinned checksum BEFORE extraction; a mismatch aborts.
  echo "Verifying buffalo_s sha256 (pinned)..."
  verify_sha256 "$MODELS_DIR/insightface/buffalo_s.zip" "$BUFFALO_S_SHA256"
  echo "Extracting buffalo_s..."
  extract_zip "$MODELS_DIR/insightface/buffalo_s.zip" "$MODELS_DIR/insightface/"
  rm "$MODELS_DIR/insightface/buffalo_s.zip"
  echo "✓ InsightFace buffalo_s downloaded"
fi

# MediaPipe FaceMesh (468 landmarks) - ~10MB
# MediaPipe models are available from Google's repository
if [ ! -f "$MODELS_DIR/mediapipe/face_mesh.task" ]; then
  echo "Downloading MediaPipe FaceMesh..."
  # Using a publicly available ONNX conversion
  curl -L -o "$MODELS_DIR/mediapipe/face_mesh.task" \
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
  echo "✓ MediaPipe FaceMesh downloaded"
fi

# dlib face recognition (128D embeddings) - ~20MB
if [ ! -f "$MODELS_DIR/dlib/dlib_face_recognition_resnet_model_v1.dat" ]; then
  echo "Downloading dlib face recognition..."
  curl -L --retry 3 -o "$MODELS_DIR/dlib/dlib_face_recognition_resnet_model_v1.dat.bz2" \
    "http://dlib.net/files/dlib_face_recognition_resnet_model_v1.dat.bz2"
  echo "Extracting dlib model..."
  bunzip2 "$MODELS_DIR/dlib/dlib_face_recognition_resnet_model_v1.dat.bz2"
  echo "✓ dlib face recognition downloaded"
fi

# dlib shape predictor (68 face landmarks) - ~60MB
if [ ! -f "$MODELS_DIR/dlib/shape_predictor_68_face_landmarks.dat" ]; then
  echo "Downloading dlib shape predictor..."
  curl -L --retry 3 -o "$MODELS_DIR/dlib/shape_predictor_68_face_landmarks.dat.bz2" \
    "http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2"
  echo "Extracting dlib shape predictor..."
  bunzip2 "$MODELS_DIR/dlib/shape_predictor_68_face_landmarks.dat.bz2"
  echo "✓ dlib shape predictor downloaded"
fi

echo ""
echo "✓ All models downloaded successfully"
echo "Models saved to: $MODELS_DIR"
echo ""
echo "InsightFace models include:"
echo "  - Detection models (det_*.onnx)"
echo "  - Recognition models (*.onnx)"
echo "  - Alignment models (2d106det.onnx, 3d68det.onnx)"
echo ""
echo "Total download size: ~700MB"
