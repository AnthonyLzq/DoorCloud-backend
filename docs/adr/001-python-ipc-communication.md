# ADR-001: Python IPC Communication via stdin/stdout Pipes

**Fecha:** 2026-07-20  
**Estado:** Aceptado  
**Decisores:** Anthony Luzquiños

## Contexto

DoorCloud necesita ejecutar modelos de face recognition que no están disponibles en ONNX Runtime para Node.js (dlib, AdaFace, MagFace). Necesitamos una forma eficiente de comunicar Node.js con un proceso Python que ejecute estos modelos.

### Opciones Consideradas

1. **HTTP REST API**: Servidor Python con Flask/FastAPI
   - Pros: Estándar, fácil de debuggear con herramientas HTTP
   - Contras: Overhead de serialización HTTP, necesidad de puertos, latencia adicional

2. **gRPC**: Comunicación binaria de alto rendimiento
   - Pros: Muy rápido, tipado fuerte, streaming bidireccional
   - Contras: Complejidad de setup, dependencias pesadas, overkill para este caso

3. **Unix Domain Sockets**: Sockets locales
   - Pros: Más rápido que TCP, sin overhead de red
   - Contras: Platform-specific (no funciona en Windows), complejidad adicional

4. **stdin/stdout Pipes**: Comunicación vía pipes estándar
   - Pros: Simple, zero-dependency, cross-platform, bajo overhead
   - Contras: Requiere protocolo de mensajería manual

## Decisión

Elegimos **stdin/stdout Pipes** para la comunicación entre Node.js y Python.

## Justificación

### Ventajas Técnicas

1. **Simplicidad**: No requiere dependencias adicionales ni configuración de red
2. **Cross-platform**: Funciona en Linux, macOS y Windows
3. **Bajo overhead**: Comunicación directa sin capas de red
4. **Aislamiento**: El proceso Python está completamente aislado, si crashea no afecta a Node.js
5. **Control de ciclo de vida**: Node.js puede spawnear, monitorear y reiniciar el proceso Python fácilmente

### Protocolo de Comunicación

Implementamos un protocolo JSON-line basado en request/response con correlación por ID:

```
Node.js → Python (stdin):
{"id":1,"method":"load_model","args":["test-model",{"type":"dlib","path":"..."}]}

Python → Node.js (stdout):
{"id":1,"success":true,"model":"test-model"}
```

### Características del Protocolo

- **Correlación por ID**: Cada request tiene un ID único, la respuesta incluye el mismo ID
- **Timeout**: 30 segundos por defecto, configurable
- **Buffering**: Acumulación de datos hasta encontrar newline
- **Concurrencia**: Múltiples requests pueden estar pendientes simultáneamente
- **Tipado**: Validación de schemas con Zod

## Consecuencias

### Positivas

- ✅ Zero dependencias externas para comunicación
- ✅ Fácil de debuggear (puedes ver el JSON en logs)
- ✅ Proceso Python aislado, fácil de reiniciar
- ✅ Cross-platform sin configuración adicional
- ✅ Bajo overhead de latencia (~1-5ms para IPC)

### Negativas

- ⚠️ Requiere implementación manual del protocolo
- ⚠️ No es tan fácil de debuggear como HTTP (no hay herramientas como Postman)
- ⚠️ Limitado a comunicación local (no se puede exponer remotamente)

### Neutral

- El proceso Python corre como child process, no como servicio independiente
- Requiere que Python esté instalado en el sistema

## Implementación

### Componentes

1. **PythonManager** (`src/services/face-recognition/python-manager.ts`)
   - Gestiona el ciclo de vida del proceso Python
   - Implementa el protocolo de comunicación
   - Maneja timeouts y errores

2. **Python Server** (`scripts/face_recognition_server.py`)
   - Lee requests desde stdin
   - Procesa requests y ejecuta modelos
   - Escribe responses en stdout

3. **Schemas** (`src/services/face-recognition/python-schemas.ts`)
   - Validación de requests y responses con Zod

### Flujo de Comunicación

```
1. Node.js spawnea proceso Python con stdio: ['pipe', 'pipe', 'pipe']
2. Python imprime "READY" en stdout
3. Node.js detecta "READY" y marca el proceso como listo
4. Node.js envía request JSON en stdin
5. Python lee stdin, procesa, escribe response JSON en stdout
6. Node.js lee stdout, parsea JSON, correlaciona por ID, resuelve Promise
```

## Alternativas Futuras

Si en el futuro necesitamos:
- **Comunicación remota**: Migrar a HTTP REST o gRPC
- **Mayor rendimiento**: Considerar Unix Domain Sockets o shared memory
- **Múltiples workers**: Implementar load balancer con múltiples procesos Python

## Referencias

- [Node.js Child Process](https://nodejs.org/api/child_process.html)
- [Python sys.stdin/stdout](https://docs.python.org/3/library/sys.html#sys.stdin)
- [JSON Lines format](https://jsonlines.org/)
