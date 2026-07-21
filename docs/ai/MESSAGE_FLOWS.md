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
                        │ Face Recogn  │
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

## ONNX Provider Flow

### Flow Diagram

```
1. Load ONNX model
   └─▶ ONNXProvider.loadModel(name, modelPath, metadata)
   └─▶ Creates InferenceSession with CPU execution provider
   └─▶ Stores model + metadata + metrics in Maps

2. Get embedding from image
   └─▶ ONNXProvider.getEmbedding(image, modelName)
   └─▶ Preprocess: resize to 112x112, convert to Float32Array
   └─▶ Normalize to [-1, 1] range
   └─▶ Create tensor with shape [1, 3, 112, 112]
   └─▶ Run inference session
   └─▶ Return Float32Array embedding
   └─▶ Update metrics (latency, request count)

3. List models
   └─▶ ONNXProvider.listModels()
   └─▶ Returns array of ONNXModelMetadata

4. Get metrics
   └─▶ ONNXProvider.getMetrics(modelName)
   └─▶ Returns { avgLatency, requestCount }

5. Unload model
   └─▶ ONNXProvider.unloadModel(name)
   └─▶ Removes from all Maps
```

### Image Preprocessing

```
Input: Buffer (any image format)
  ↓
Sharp: resize to 112x112, remove alpha, convert to raw RGB
  ↓
Convert to Float32Array: RGB → CHW format (Channel, Height, Width)
  ↓
Normalize: pixel / 127.5 - 1.0 (range [-1, 1])
  ↓
Create tensor: shape [1, 3, 112, 112]
  ↓
Output: ort.Tensor ready for inference
```

### Supported Models

| Model | Embedding Size | Speed | Notes |
|-------|---------------|-------|-------|
| InsightFace buffalo_l | 512 | Fast | Recommended |
| InsightFace buffalo_m | 512 | Medium | Balanced |
| InsightFace buffalo_s | 512 | Slow | Smallest |
| MediaPipe FaceMesh | 128 | Fast | Lightweight |

### Critical Implementation Details

**Node.js side:**
- Uses `onnxruntime-node` for inference
- Image preprocessing with `sharp`
- Metrics tracking per model (latency, request count)
- CPU execution provider only (no GPU support yet)

## End-to-End Photo Comparison Flow

### Complete Flow

```
1. External client publishes photo to MQTT
   └─▶ Topic: doorcloud/v1/photo/send
   └─▶ Payload: { base64Photo, format, userID }

2. MQTT route receives and parses
   └─▶ src/network/mqtt/routes/photo.ts
   └─▶ Extracts: base64Photo, format, userID

3. Convert to Buffer
   └─▶ Buffer.from(base64Photo, 'base64')

4. Face Recognition Service
   └─▶ FaceRecognitionService.compare(image1, image2, modelName)
   └─▶ Selects provider: ONNX or Python based on model
   └─▶ Gets embeddings from both images
   └─▶ Computes cosine similarity
   └─▶ Returns similarity score (0.0 - 1.0)

5. Decision logic
   └─▶ If similarity > threshold (e.g., 0.8): MATCH
   └─▶ If similarity < threshold: NO_MATCH

6. Send result via WhatsApp
   └─▶ UserServices.sendPhotoThroughWhatsapp(userID, format, buffer)
   └─▶ src/integrations/whatsapp/openwa.ts
   └─▶ OpenWA API call

7. Record metrics
   └─▶ Topic: doorcloud/v1/photo/metrics
   └─▶ Append to metrics/receivePhoto.csv
```

### Provider Selection Logic

```typescript
if (model is ONNX-compatible) {
  use ONNXProvider (Node.js, faster, no IPC overhead)
} else {
  use PythonManager (Python process, supports dlib/AdaFace/MagFace)
}
```

### Similarity Calculation

```typescript
cosineSimilarity(embedding1, embedding2) = 
  dot(embedding1, embedding2) / 
  (norm(embedding1) * norm(embedding2))

Result: 0.0 (completely different) to 1.0 (identical)
```

## Database Schema (Supabase)

### Tables

#### users

| Column | Type | Description |
|--------|------|-------------|
| id | number | Primary key |
| name | string | User name |
| phone | string | WhatsApp phone number |
| lastMessage | Date | Last message timestamp |

### Storage Buckets

#### photos

Used for storing user photos.

**Operations:**
- `upload(path, buffer, { contentType })` - Upload photo
- `createSignedUrls(paths, time)` - Get temporary URLs
- `list(folder)` - List all files in folder

### Critical Queries

| Function | Table | Operation | Notes |
|----------|-------|-----------|-------|
| `createUser(name, phone)` | users | INSERT | Creates new user |
| `getUserByUserID(id)` | users | SELECT | Get user by ID |
| `updateUserLastMessage(id)` | users | UPDATE | Update last message timestamp |
| `uploadUserPhoto(path, buffer)` | photos | UPLOAD | Upload to storage |
| `getPhotosUrls(paths, time)` | photos | SIGNED URL | Get temporary URLs |
| `getAllFilesFromBucket(folder)` | photos | LIST | List all files |

### Connection Pattern

```typescript
// Singleton pattern
const supabaseConnection = (log?: FastifyBaseLogger) => {
  if (!global.__supabaseClient__) {
    const { SUPABASE_URL, SUPABASE_KEY } = getEnv()
    global.__supabaseClient__ = createClient(SUPABASE_URL, SUPABASE_KEY)
  }
  return global.__supabaseClient__
}
```

## Error Handling Patterns

### Python IPC Error Handling

**Timeout (30s default):**
```typescript
const timeout = setTimeout(() => {
  reject(new Error(`Request timed out after ${this.defaultTimeout}ms`))
}, this.defaultTimeout)
```

**Auto-restart (up to 3 attempts):**
```typescript
if (this.restartAttempts < this.maxRestartAttempts) {
  this.restartAttempts++
  setTimeout(() => this.start(), this.restartDelay)
}
```

**Process crash detection:**
```typescript
this.process.on('exit', (code) => {
  if (code !== 0) {
    // Reject all pending requests
    // Attempt restart
  }
})
```

### MQTT Error Handling

**Subscription errors:**
```typescript
client.subscribe(topics, { qos: MQTT_QOS }, error => {
  if (error) {
    log.error({ error, topics }, 'Error subscribing to MQTT photo topics')
    reject(error)
  }
})
```

**Message processing errors:**
```typescript
client.on('message', async (topic, message) => {
  try {
    // Process message
  } catch (error) {
    log.error({ error, topic }, 'Error processing MQTT photo message')
  }
})
```

### HTTP Error Handling

**Custom errors with status codes:**
```typescript
class CustomError extends Error {
  constructor(message: string, statusCode: number = 500) {
    super(message)
    this.statusCode = statusCode
  }
}
```

**Database errors:**
```typescript
if (error) {
  log.error(error, errorMessage)
  throw new CustomError(errorMessage)
}

if (!data) {
  throw new CustomError('User not found', 404)
}
```

### Error Recovery Patterns

| Flow | Error Type | Recovery |
|------|-----------|----------|
| Python IPC | Timeout | Reject request, log error |
| Python IPC | Process crash | Auto-restart up to 3 times |
| MQTT | Subscription fail | Log error, reject connection |
| MQTT | Message processing | Log error, continue processing |
| HTTP | Database error | Throw CustomError with status |
| HTTP | Validation error | Return 400 with details |

### Critical Error Scenarios

**Python process dies:**
1. Detect exit code != 0
2. Reject all pending requests with error
3. Attempt restart (up to 3 times)
4. If restart fails, emit error event

**MQTT connection lost:**
1. Detect connection error
2. Log error
3. Fastify server continues running
4. Manual intervention required

**Database connection fail:**
1. Supabase client throws error
2. CustomError thrown with 500 status
3. Request fails gracefully
4. No automatic retry (stateless)
