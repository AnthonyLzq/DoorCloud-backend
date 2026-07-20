#!/usr/bin/env python3
"""
Python Face Recognition Server
Handles models not compatible with ONNX Runtime (dlib, AdaFace, MagFace)
Communicates with Node.js via stdin/stdout JSON protocol
"""

import sys
import json
import base64
import traceback
from typing import Dict, Any, Optional

# Model registry
models: Dict[str, Any] = {}


def load_model(name: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Load a face recognition model"""
    model_type = config.get('type')
    model_path = config.get('path')

    if not model_type or not model_path:
        return {'error': 'Missing model type or path'}

    try:
        if model_type == 'dlib':
            import dlib
            model = dlib.face_recognition_model_v1(model_path)
            models[name] = {
                'type': 'dlib',
                'model': model,
                'embedding_size': 128,
                'landmarks': 68
            }
            return {'success': True, 'model': name}

        elif model_type == 'adaface':
            # AdaFace implementation would go here
            # For now, placeholder
            return {'error': 'AdaFace not yet implemented'}

        elif model_type == 'magface':
            # MagFace implementation would go here
            # For now, placeholder
            return {'error': 'MagFace not yet implemented'}

        else:
            return {'error': f'Unknown model type: {model_type}'}

    except Exception as e:
        return {'error': f'Failed to load model: {str(e)}'}


def get_embedding(image_bytes: bytes, model_name: str) -> Dict[str, Any]:
    """Get face embedding from image using specified model"""
    if model_name not in models:
        return {'error': f'Model not loaded: {model_name}'}

    model_info = models[model_name]
    model_type = model_info['type']

    try:
        if model_type == 'dlib':
            import dlib
            import numpy as np
            from PIL import Image
            import io

            # Load image
            image = Image.open(io.BytesIO(image_bytes))
            image_np = np.array(image)

            # Convert RGB to BGR for dlib
            if len(image_np.shape) == 3 and image_np.shape[2] == 3:
                image_np = image_np[:, :, ::-1]

            # Detect face (simplified - in production, use proper face detection)
            detector = dlib.get_frontal_face_detector()
            dets = detector(image_np, 1)

            if len(dets) == 0:
                return {'error': 'No face detected in image'}

            # Get face landmarks
            sp = dlib.shape_predictor('models/dlib/shape_predictor_68_face_landmarks.dat')
            shape = sp(image_np, dets[0])

            # Get embedding
            model = model_info['model']
            embedding = model.compute_face_descriptor(image_np, shape)

            # Convert to list
            embedding_list = list(embedding)

            return {
                'success': True,
                'embedding': embedding_list,
                'embedding_size': len(embedding_list)
            }

        else:
            return {'error': f'Unknown model type: {model_type}'}

    except Exception as e:
        return {'error': f'Failed to get embedding: {str(e)}'}


def handle_request(request: Dict[str, Any]) -> Dict[str, Any]:
    """Handle incoming JSON request"""
    request_id = request.get('id')
    method = request.get('method')
    args = request.get('args', [])

    try:
        if method == 'load_model':
            # args[0] = name, args[1] = config
            name = args[0] if len(args) > 0 else None
            config = args[1] if len(args) > 1 else {}
            result = load_model(name, config)

        elif method == 'get_embedding':
            # args[0] = image_b64, args[1] = model_name
            image_b64 = args[0] if len(args) > 0 else None
            model_name = args[1] if len(args) > 1 else None

            if not image_b64:
                result = {'error': 'Missing image data'}
            else:
                # Decode base64 image
                try:
                    image_bytes = base64.b64decode(image_b64)
                    result = get_embedding(image_bytes, model_name)
                except Exception as e:
                    result = {'error': f'Failed to decode image: {str(e)}'}

        elif method == 'list_models':
            result = {
                'success': True,
                'models': list(models.keys())
            }

        else:
            result = {'error': f'Unknown method: {method}'}

        # Add id to response (always, for both success and error)
        if request_id is not None:
            result['id'] = request_id

        return result

    except Exception as e:
        error_response = {'error': f'Unexpected error: {str(e)}'}
        if request_id is not None:
            error_response['id'] = request_id
        return error_response


def main():
    """Main loop - read from stdin, write to stdout"""
    # Signal ready
    print('READY', flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            response = handle_request(request)
            print(json.dumps(response), flush=True)
        except json.JSONDecodeError as e:
            error_response = {'error': f'Invalid JSON: {str(e)}'}
            print(json.dumps(error_response), flush=True)
        except Exception as e:
            error_response = {'error': f'Unexpected error: {str(e)}'}
            print(json.dumps(error_response), flush=True)


if __name__ == '__main__':
    main()
