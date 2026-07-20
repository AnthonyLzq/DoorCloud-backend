# Architecture Decision Records (ADR)

Este directorio contiene los Architecture Decision Records (ADR) del proyecto DoorCloud Backend.

## ¿Qué es un ADR?

Un ADR es un documento que captura una decisión de arquitectura importante, incluyendo:
- El contexto y problema que se estaba resolviendo
- Las opciones consideradas
- La decisión tomada y su justificación
- Las consecuencias (positivas, negativas y neutrales)

## Convenciones de Nomenclatura

Los archivos ADR siguen el formato:
```
{order_of_adr_with_3_numbers}-name-of-adr.md
```

Ejemplos:
- `001-python-ipc-communication.md`
- `002-onnx-runtime-selection.md`
- `003-mqtt-broker-choice.md`

## ADRs Actuales

- [ADR-001: Python IPC Communication via stdin/stdout Pipes](001-python-ipc-communication.md)
  - Decisión de usar pipes stdin/stdout para comunicación con proceso Python
  - Implementado en `src/services/face-recognition/python-manager.ts`

## Cuándo Crear un ADR

Crea un ADR cuando:
- Tomas una decisión arquitectónica significativa
- Hay múltiples opciones viables y necesitas documentar por qué elegiste una
- La decisión tiene consecuencias a largo plazo
- Quieres que futuros desarrolladores (humanos o IA) entiendan el razonamiento

## Estructura de un ADR

```markdown
# ADR-{NNN}: {Título Corto}

**Fecha:** YYYY-MM-DD  
**Estado:** Propuesto | Aceptado | Obsoleto  
**Decisores:** [Lista de personas]

## Contexto
[Descripción del problema y contexto]

## Opciones Consideradas
[Lista de alternativas con pros/cons]

## Decisión
[Qué decidiste]

## Justificación
[Por qué elegiste esta opción]

## Consecuencias
### Positivas
### Negativas
### Neutral

## Implementación
[Cómo se implementó la decisión]

## Alternativas Futuras
[Cuándo reconsiderar esta decisión]

## Referencias
[Links a documentación relevante]
```

## Referencias

- [Michael Nygard - Architecture Decision Records](http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions)
- [ADR GitHub](https://github.com/joelparkerhenderson/architecture-decision-record)
