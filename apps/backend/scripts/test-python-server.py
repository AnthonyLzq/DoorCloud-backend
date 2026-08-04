#!/usr/bin/env python3
"""
Test script for Python Face Recognition Server
Validates the IPC protocol (stdin/stdout JSON)
"""

import subprocess
import json
import sys
import time

def test_server():
    """Test the face recognition server"""
    print("🧪 Testing Python Face Recognition Server\n")
    
    # Start the server process
    print("📦 Starting server...")
    process = subprocess.Popen(
        [sys.executable, "scripts/face_recognition_server.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    # Wait for READY signal
    ready_line = process.stdout.readline().strip()
    if ready_line != "READY":
        print(f"❌ Server did not send READY signal. Got: {ready_line}")
        process.kill()
        return False
    
    print("✅ Server started and ready\n")
    
    # Test 1: List models (should be empty)
    print("📋 Test 1: List models (empty)")
    request = {"method": "list_models"}
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    response = json.loads(process.stdout.readline().strip())
    print(f"   Response: {response}")
    if response.get("success") and response.get("models") == []:
        print("   ✅ Passed\n")
    else:
        print("   ❌ Failed\n")
        process.kill()
        return False
    
    # Test 2: Load dlib model
    print("📦 Test 2: Load dlib model")
    request = {
        "method": "load_model",
        "name": "dlib-test",
        "config": {
            "type": "dlib",
            "path": "models/dlib/dlib_face_recognition_resnet_model_v1.dat"
        }
    }
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    response = json.loads(process.stdout.readline().strip())
    print(f"   Response: {response}")
    if response.get("success"):
        print("   ✅ Passed\n")
    else:
        print(f"   ❌ Failed: {response.get('error')}\n")
        process.kill()
        return False
    
    # Test 3: List models (should have dlib-test)
    print("📋 Test 3: List models (should have dlib-test)")
    request = {"method": "list_models"}
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    response = json.loads(process.stdout.readline().strip())
    print(f"   Response: {response}")
    if response.get("success") and "dlib-test" in response.get("models", []):
        print("   ✅ Passed\n")
    else:
        print("   ❌ Failed\n")
        process.kill()
        return False
    
    # Test 4: Try to get embedding (will fail without face detection model)
    print("🔬 Test 4: Get embedding (expected to fail - no face)")
    import base64
    # Create a simple test image (100x100 red square)
    from PIL import Image
    import io
    
    img = Image.new('RGB', (100, 100), color='red')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    image_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    request = {
        "method": "get_embedding",
        "image": image_b64,
        "model": "dlib-test"
    }
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    response = json.loads(process.stdout.readline().strip())
    print(f"   Response: {response}")
    # This is expected to fail because there's no face in the image
    # or because we don't have the shape_predictor model
    if "error" in response:
        print(f"   ✅ Passed (expected error: {response['error']})\n")
    else:
        print("   ⚠️  Unexpected success\n")
    
    # Test 5: Unknown method
    print("❓ Test 5: Unknown method")
    request = {"method": "unknown_method"}
    process.stdin.write(json.dumps(request) + "\n")
    process.stdin.flush()
    response = json.loads(process.stdout.readline().strip())
    print(f"   Response: {response}")
    if "error" in response and "Unknown method" in response["error"]:
        print("   ✅ Passed\n")
    else:
        print("   ❌ Failed\n")
        process.kill()
        return False
    
    # Test 6: Invalid JSON
    print("🚫 Test 6: Invalid JSON")
    process.stdin.write("not valid json\n")
    process.stdin.flush()
    response = json.loads(process.stdout.readline().strip())
    print(f"   Response: {response}")
    if "error" in response and "Invalid JSON" in response["error"]:
        print("   ✅ Passed\n")
    else:
        print("   ❌ Failed\n")
        process.kill()
        return False
    
    # Cleanup
    process.terminate()
    process.wait(timeout=5)
    
    print("🎉 All tests passed!")
    return True

if __name__ == "__main__":
    success = test_server()
    sys.exit(0 if success else 1)
