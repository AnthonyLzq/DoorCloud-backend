# Message Flows

## System Overview

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  HTTP API   │────────▶│  MQTT Client │────────▶│   WhatsApp  │
│  (Fastify)  │         │  (mosquitto) │         │  (OpenWA)   │
└─────────────┘         └──────────────┘         └─────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ Face Recong  │
                        │   Service    │
                        └──────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                              ▼
        ┌──────────────┐              ┌──────────────┐
        │ ONNX Provider│              │Python Manager│
        │  (Node.js)   │              │   (Python)   │
        └──────────────┘              └──────────────┘
```

## MQTT Photo Flow

### Flow Diagram

```
1. External client publishes to MQTT topic
   └─▶ Topic: doorcloud/v1/photo/send
   
2. MQTT client receives message
   └─▶ src/network/mqtt/routes/photo.ts (line 88)
   
3. Parse payload
   └─▶ parsePhotoSendPayload(message)
   └─▶ Extracts: { base64Photo, format, userID }
   
4. Send via WhatsApp
   └─▶ UserServices.sendPhotoThroughWhatsapp()
   └─▶ src/services/user.ts
   
5. Record metrics (optional)
   └─▶ Topic: doorcloud/v1/photo/metrics
   └─▶ Append to metrics/receivePhoto.csv
```

### MQTT Topics

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `doorcloud/v1/photo/send` | Subscribe | Receive photos to send |
| `doorcloud/v1/photo/metrics` | Subscribe | Performance metrics |
| `doorcloud/v1/photo` | Publish | Status updates |

### Payload Contracts

**Photo Send:**
```json
{
  "base64Photo": "string (base64 encoded)",
  "format": "string (jpg|png)",
  "userID": "string"
}
```

**Photo Metrics:**
```json
{
  "timestampSent": "number (unix timestamp)"
}
```

## Python IPC Flow

### Flow Diagram

```
1. Node.js spawns Python process
   └─▶ PythonManager.start()
   └─▶ spawn('python3', ['scripts/face_recognition_server.py'])
   └─▶ stdio: ['pipe', 'pipe', 'pipe']
   
2. Python signals ready
   └─▶ Python prints: "READY\n" (with flush=True)
   └─▶ Node.js detects "READY" on stdout
   └─▶ Sets ready = true
   
3. Node.js sends request
   └─▶ PythonManager.call(method, ...args)
   └─▶ Writes JSON to stdin: {"id":1,"method":"load_model","args":[...]}
   └─▶ Stores pending request with timeout
   
4. Python processes request
   └─▶ Reads JSON from stdin
   └─▶ Executes method (load_model, get_embedding, etc.)
   └─▶ Writes JSON to stdout: {"id":1,"success":true,...}
   └─▶ Uses flush=True (CRITICAL for IPC)
   
5. Node.js receives response
   └─▶ Reads stdout, buffers until newline
   └─▶ Parses JSON, correlates by ID
   └─▶ Resolves Promise with result
```

### IPC Protocol

**Request (Node.js → Python via stdin):**
```json
{
  "id": 1,
  "method": "load_model",
  "args": [
    "model-name",
    {
      "type": "dlib",
      "path": "models/dlib/dlib_face_recognition_resnet_model_v1.dat"
    }
  ]
}
```

**Response (Python → Node.js via stdout):**
```json
// Success
{
  "id": 1,
  "success": true,
  "model": "model-name",
  "embedding": [0.1, 0.2, ...],
  "embedding_size": 128
}

// Error
{
  "id": 1,
  "error": "No face detected in image"
}
```

### Available Methods

| Method | Args | Returns | Notes |
|--------|------|---------|-------|
| `load_model` | name, config | success, model | Loads model into memory |
| `get_embedding` | imageBase64, modelName | embedding, size | Returns face vector |
| `compare` | image1, image2, modelName | similarity | Returns 0.0-1.0 |

### Critical Implementation Details

**Python side:**
- All `print()` must use `flush=True`
- JSON-line protocol (one JSON per line)
- No extra output to stdout (breaks parsing)

**Node.js side:**
- Timeout: 30s default, configurable
- Auto-restart: up to 3 attempts on crash
- Buffering: accumulates until newline
- Concurrency: multiple pending requests allowed

## HTTP Setup Flow

### Flow Diagram

```
1. User accesses setup page
   └─▶ GET /setup
   └─▶ Returns HTML UI
   
2. User configures OpenWA
   └─▶ POST /setup/config
   └─▶ Saves: OPENWA_API_KEY, OPENWA_BASE_URL, etc.
   
3. User starts session
   └─▶ POST /setup/start
   └─▶ Calls OpenWA API to start session
   
4. User loads QR code
   └─▶ GET /setup/qr
   └─▶ Returns QR image for WhatsApp scan
   
5. User sends test message
   └─▶ POST /setup/test
   └─▶ Sends test message via WhatsApp
```

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/setup` | Setup UI |
| POST | `/setup/config` | Save configuration |
| POST | `/setup/start` | Start OpenWA session |
| GET | `/setup/qr` | Get QR code |
| POST | `/setup/test` | Send test message |
| GET | `/setup/status` | Get session status |

## Key Files by Flow

### MQTT Photo Flow
- `src/network/mqtt/routes/photo.ts` - Main handler
- `src/network/mqtt/topics.ts` - Topic definitions
- `src/network/mqtt/photoPayloads.ts` - Payload schemas
- `src/services/user.ts` - User service
- `test/mqtt.integration.test.ts` - Integration tests

### Python IPC Flow
- `src/services/face-recognition/python-manager.ts` - IPC manager
- `src/services/face-recognition/python-schemas.ts` - Zod schemas
- `scripts/face_recognition_server.py` - Python server
- `test/python-manager.test.ts` - Unit tests
- `test/python-manager-ipc.test.ts` - IPC tests

### HTTP Setup Flow
- `src/network/http/routes/setup.ts` - Setup routes
- `src/integrations/whatsapp/setup.ts` - WhatsApp setup
- `src/integrations/whatsapp/openwa.ts` - OpenWA client

### Configuration
- `src/config/env.ts` - Environment validation
- `.env.example` - Required variables
