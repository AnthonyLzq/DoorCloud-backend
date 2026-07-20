# AGENTS.md - DoorCloud Backend

Este documento proporciona instrucciones para agentes de IA (y humanos) que trabajen en el proyecto DoorCloud Backend.

## Arquitectura del Proyecto

DoorCloud Backend es un servicio TypeScript/Fastify que combina:
- API HTTP para gestión de usuarios y fotos
- Cliente MQTT para procesamiento de fotos en tiempo real
- Integración con OpenWA para mensajería WhatsApp
- Sistema híbrido de face recognition (ONNX Runtime + Python)

### Estructura de Directorios

```
src/
├── config/          # Configuración y validación de entorno
├── database/        # Conexión y queries a Supabase
├── integrations/    # Integraciones externas (OpenWA)
├── lib/             # Librerías internas (Human para face recognition)
├── network/         # HTTP y MQTT routes
├── output/          # Generación de outputs (CSV, imágenes)
├── schemas/         # Schemas de validación (Zod)
└── services/        # Lógica de negocio
    └── face-recognition/  # Sistema híbrido de face recognition
        ├── onnx-provider.ts      # ONNX Runtime para Node.js
        ├── python-manager.ts     # Gestor de proceso Python
        └── python-schemas.ts     # Schemas para comunicación IPC

scripts/
├── face_recognition_server.py    # Servidor Python para modelos no-ONNX
├── download-models.sh            # Descarga de modelos ONNX
└── install-python-deps.sh        # Instalación de dependencias Python

docs/
└── adr/             # Architecture Decision Records
```

## Convenciones de Código

### TypeScript
- **Sin punto y coma** al final de las líneas
- **Comillas simples** para strings
- **80 caracteres** máximo por línea
- **Sin emojis** en código, comentarios, commits o documentación
- **Imports absolutos** desde `src/` (configurado en tsconfig.json)
- **Zod** para validación de schemas
- **Fastify type providers** para tipado de rutas

### Python
- **Type hints** en todas las funciones
- **Docstrings** en funciones públicas
- **JSON Lines** para protocolo de comunicación
- **flush=True** en todos los prints (crítico para IPC)

### Commits
- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, etc.
- **Sin emojis** en mensajes de commit
- **Descriptivos** pero concisos
- **Referenciar issues** si aplica

## Sistema de Face Recognition

### Arquitectura Híbrida

El sistema usa dos providers para face recognition:

1. **ONNXProvider** (Node.js): Para modelos compatibles con ONNX Runtime
   - InsightFace buffalo_l/m/s
   - MediaPipe FaceMesh
   - dlib (parcial)

2. **PythonManager** (Python): Para modelos sin soporte ONNX
   - dlib (completo)
   - AdaFace
   - MagFace

### Comunicación IPC

El sistema usa un protocolo JSON-line sobre pipes stdin/stdout para comunicación entre Node.js y Python.

**Flujo básico:**
```
Node.js → stdin → Python → stdout → Node.js
```

**Protocolo:**
```json
// Request (Node.js → Python)
{"id":1,"method":"load_model","args":["test-model",{"type":"dlib","path":"..."}]}

// Response (Python → Node.js)
{"id":1,"success":true,"model":"test-model"}
```

Para detalles completos sobre decisiones arquitectónicas, consultar los [Architecture Decision Records](docs/adr/).

### Uso del Sistema

```typescript
import { FaceRecognitionService } from './services/face-recognition'

const service = new FaceRecognitionService()
await service.init()

// Comparar dos imágenes
const result = await service.compare(image1, image2, 'insightface-buffalo-l')
console.log(result.similarity) // 0.0 - 1.0

// Obtener embedding
const embedding = await service.getEmbedding(image, 'dlib')
console.log(embedding.length) // 128 para dlib, 512 para InsightFace
```

## Testing

### Comandos

```bash
# Tests unitarios (excluye integration tests)
pnpm test:local

# Tests de integración MQTT (requiere Docker)
pnpm test:mqtt

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

### Convenciones de Testing

- **Vitest** como framework de testing
- **Archivos de test** en `test/` (no junto al código)
- **Mocks** con `vi.mock()` para dependencias externas
- **Integration tests** separados con sufijo `.integration.test.ts`

## Quality Gates

Antes de hacer commit, asegúrate de que:

1. ✅ `pnpm test:local` pasa
2. ✅ `pnpm typecheck` pasa
3. ✅ `pnpm lint` pasa
4. ✅ No hay emojis en el código
5. ✅ Commits siguen Conventional Commits
6. ✅ Documentación actualizada si aplica

## Dependencias Críticas

### Node.js
- `fastify` ^5.10.0 - Framework HTTP
- `zod` ^4.4.3 - Validación de schemas
- `onnxruntime-node` ^1.17.0 - ONNX Runtime
- `sharp` ^0.33.0 - Procesamiento de imágenes
- `mqtt` ^5.15.2 - Cliente MQTT

### Python
- `dlib` - Face recognition
- `numpy` - Operaciones numéricas
- `Pillow` - Procesamiento de imágenes

## Configuración de Entorno

Variables de entorno requeridas (ver `.env.example`):

```bash
# MQTT
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_USER=doorcloud-backend
MQTT_PASS=doorcloud-backend-local

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-key

# OpenWA
OPENWA_BASE_URL=http://localhost:2785
OPENWA_API_KEY=your-api-key
OPENWA_SESSION_ID=main
OPENWA_CHAT_ID=51999999999@c.us

# ML Models
MODELS_CDN_URL=https://models.example.com
```

## Troubleshooting

### Python Process no inicia

1. Verificar que `.venv` existe: `ls -la .venv/bin/python3`
2. Verificar que `scripts/face_recognition_server.py` es ejecutable
3. Revisar logs de stderr del proceso Python

### Timeout en requests a Python

1. Aumentar timeout en `PythonManager` (default: 30s)
2. Verificar que el modelo está cargado antes de hacer requests
3. Revisar si Python está bloqueado en alguna operación

### ONNX Runtime no carga modelos

1. Verificar que los modelos están en `models/`
2. Ejecutar `pnpm models:download` si faltan
3. Verificar compatibilidad de versiones ONNX

## Recursos

- [Architecture Decision Records](docs/adr/)
- [README.md](README.md)
- [CHANGELOG.md](CHANGELOG.md)

## Contacto

Para preguntas sobre arquitectura o decisiones técnicas, consultar los ADRs en `docs/adr/`.
