#!/bin/bash
# scripts/download-models.sh
# Download ONNX models for face recognition benchmarking

set -e

MODELS_DIR="./models"
mkdir -p "$MODELS_DIR/insightface" "$MODELS_DIR/mediapipe" "$MODELS_DIR/dlib"

echo "Downloading ONNX models..."

# InsightFace buffalo_l (512D embeddings, 106 landmarks)
if [ ! -f "$MODELS_DIR/insightface/buffalo_l.onnx" ]; then
  echo "Downloading InsightFace buffalo_l..."
  curl -L -o "$MODELS_DIR/insightface/buffalo_l.onnx" \
    "https://huggingface.co/deepinsight/insightface/resolve/main/buffalo_l.onnx"
fi

# InsightFace buffalo_m (512D embeddings, más ligero)
if [ ! -f "$MODELS_DIR/insightface/buffalo_m.onnx" ]; then
  echo "Downloading InsightFace buffalo_m..."
  curl -L -o "$MODELS_DIR/insightface/buffalo_m.onnx" \
    "https://huggingface.co/deepinsight/insightface/resolve/main/buffalo_m.onnx"
fi

# InsightFace buffalo_s (512D embeddings, más rápido)
if [ ! -f "$MODELS_DIR/insightface/buffalo_s.onnx" ]; then
  echo "Downloading InsightFace buffalo_s..."
  curl -L -o "$MODELS_DIR/insightface/buffalo_s.onnx" \
    "https://huggingface.co/deepinsight/insightface/resolve/main/buffalo_s.onnx"
fi

# MediaPipe FaceMesh (468 landmarks)
if [ ! -f "$MODELS_DIR/mediapipe/face_mesh.onnx" ]; then
  echo "Downloading MediaPipe FaceMesh..."
  curl -L -o "$MODELS_DIR/mediapipe/face_mesh.onnx" \
    "https://huggingface.co/mediapipe/face_mesh/resolve/main/face_mesh.onnx"
fi

# dlib face recognition (128D embeddings)
if [ ! -f "$MODELS_DIR/dlib/face_recognition.onnx" ]; then
  echo "Downloading dlib face recognition..."
  curl -L -o "$MODELS_DIR/dlib/face_recognition.onnx" \
    "https://huggingface.co/dlib/face_recognition/resolve/main/dlib_face_recognition.onnx"
fi

echo "✓ All models downloaded successfully"
echo "Models saved to: $MODELS_DIR"
