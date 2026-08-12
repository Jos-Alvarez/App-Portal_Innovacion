# ADR 0002: Modelo de datos con tablas separadas para enlaces y procesadores

## Estado

Aceptado

## Contexto

El PRD define dos naturalezas de recurso: enlaces a apps/agentes externos (solo nombre, URL,
descripción, tipo) y procesadores de archivos internos (con configuración propia: clave del módulo
que los ejecuta, formatos aceptados, tamaño máximo — tope general 25 MB). El DESIGN.md revela
además chips de tipo (app / agente IA / procesador), estados de sugerencia (pendiente, en
revisión, aprobada, rechazada, implementada), agrupación de sugerencias y una pantalla de
analítica que exige registrar aperturas, ejecuciones y errores por usuario y por área. Todas las
entidades se relacionan mediante claves foráneas en una base de datos relacional.

## Decisión

El catálogo se modela con **dos tablas separadas por naturaleza**: `enlace` (apps y agentes
externos, con campo `tipo` app|agente) y `procesador` (con `clave_procesador`,
`formatos_aceptados`, `tamano_max`). Las asignaciones se modelan con dos tablas de unión
(`asignacion_enlace`, `asignacion_procesador`) y los eventos de uso usan una referencia
polimórfica (`tipo_recurso` + `id_recurso`).

Entidades del modelo completo:

- `usuario` (id, correo, nombre, area, es_admin, activo)
- `enlace` (id, nombre, descripcion, url, tipo app|agente, activo)
- `procesador` (id, nombre, descripcion, clave_procesador, formatos_aceptados, tamano_max, activo)
- `asignacion_enlace` (usuario_id → usuario, enlace_id → enlace)
- `asignacion_procesador` (usuario_id → usuario, procesador_id → procesador)
- `sugerencia` (id, autor_id → usuario, titulo, descripcion, area_destino, estado actual, grupo_id →
  grupo_sugerencia, fecha de creación) — el recorrido de estados se conserva en
  `historial_sugerencia`, no sobreescrito en esta fila
- `grupo_sugerencia` (id, titulo, creado_por → usuario)
- `historial_sugerencia` (id, sugerencia_id → sugerencia, estado_anterior, estado_nuevo,
  cambiado_por → usuario, fecha_cambio) — registro **inmutable** de cada cambio de estado de una
  sugerencia (un asiento por cada transición): quién lo hizo y cuándo. Cumple el requisito de
  trazabilidad del PRD sin sobrescribir el estado anterior; el campo `estado` de `sugerencia`
  refleja el valor actual y esta tabla conserva el historial completo del embudo
- `evento_uso` (id, usuario_id → usuario, tipo_recurso, id_recurso, tipo_evento
  apertura|ejecucion|error_formato|error_tamano|error_contenido, fecha)

La preferencia de tema claro/oscuro no se persiste en BD: vive en `localStorage` según DESIGN.md.

## Alternativas consideradas

- **Tabla única `recurso` con campo `tipo` y columnas nullables** — simplifica asignaciones y
  eventos a una sola FK, pero mezcla en una tabla campos que no aplican a todos los tipos; el
  usuario prefirió la separación limpia por naturaleza, coherente con el riesgo señalado en el PRD
  de mantener las dos naturalezas bien diferenciadas.
- **Tabla base + columna JSON `config`** — flexible ante procesadores futuros sin migraciones,
  pero sin validación a nivel de esquema: errores de configuración se detectarían recién en
  runtime.

## Consecuencias

- Cada tabla tiene exactamente los campos que su naturaleza necesita, con integridad referencial
  estricta en las asignaciones (FK directas por tipo).
- Costo real: toda consulta transversal — el dashboard del colaborador ("todo lo que tengo
  asignado"), el catálogo del admin y el ranking de analítica — debe unir dos orígenes (UNION o
  dos consultas), y `evento_uso` usa una referencia polimórfica que la base de datos no puede
  validar con FK; la integridad de esa referencia se garantiza en la capa de aplicación.
- Agregar una tercera naturaleza de recurso a futuro implica una tabla y una tabla de unión
  nuevas, más tocar cada consulta transversal.
