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

El contrato revisado del ADR 0006 agrega un requisito al catálogo: un procesador puede recibir
**uno o varios archivos** y devolver **uno o varios**, que se entregan empaquetados en ZIP cuando
son más de uno. El portal arma la interfaz de carga sin conocer el código del módulo, así que esa
forma tiene que estar **declarada en la fila del procesador**, no escondida en el módulo Python.

## Decisión

El catálogo se modela con **dos tablas separadas por naturaleza**: `enlace` (apps y agentes
externos, con campo `tipo` app|agente) y `procesador` (con `clave_procesador`,
`formatos_aceptados`, `tamano_max` y la declaración de su contrato de entrada/salida). Las
asignaciones se modelan con dos tablas de unión
(`asignacion_enlace`, `asignacion_procesador`) y los eventos de uso usan una referencia
polimórfica (`tipo_recurso` + `id_recurso`).

Entidades del modelo completo:

- `usuario` (id, correo, nombre, area, es_admin, activo)
- `enlace` (id, nombre, descripcion, url, tipo app|agente, activo)
- `procesador` (id, nombre, descripcion, clave_procesador, formatos_aceptados, tamano_max,
  entradas_min, entradas_max, tamano_max_total, salida_esperada, activo)
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

### Contrato de entrada/salida en la fila `procesador`

Los cuatro campos nuevos declaran la forma de una ejecución. **La fila es la única fuente de verdad
de la cardinalidad**: el portal la lee para armar la interfaz de carga y el pipeline del servicio la
lee para validar, exactamente como ya ocurre con `formatos_aceptados` y `tamano_max`. El módulo
Python no la duplica.

- `entradas_min` (int, ≥ 1, por defecto 1) y `entradas_max` (int, nulo = sin tope): cuántos archivos
  admite una ejecución. Un procesador de un solo archivo es `min = max = 1`; uno que consolida N
  archivos iguales es `min = 1, max = NULL`. El portal habilita o no la carga múltiple según esto y
  el pipeline rechaza con error tipificado un conjunto fuera de rango, antes de instanciar el
  módulo.
- `tamano_max_total` (int, nulo = sin tope propio): tope de la **suma comprimida** de la request.
  `tamano_max` acota cada archivo por separado; este campo acota el conjunto. Sin él, N archivos
  individualmente válidos pueden superar el presupuesto de memoria del worker (ADR 0006).
- `salida_esperada` (`archivo` | `zip`): qué recibe el usuario. Es **declarativo para la UI** — le
  permite anticipar "vas a descargar un ZIP con varios archivos" antes de subir nada. **No es un
  interruptor de runtime:** el pipeline empaqueta según la cantidad real de archivos que devuelve el
  módulo, así que una discrepancia entre lo declarado y lo real no rompe la ejecución ni agrega un
  modo de fallo nuevo; solo desajusta el texto de la pantalla.

**Pendiente hasta conocer las reglas de negocio de los 3 procesadores previstos:** si alguno recibe
archivos con **roles distintos** (p. ej. un maestro y un detalle, cada uno con su formato y su
etiqueta en la UI), la cardinalidad numérica no alcanza y hará falta una tabla hija
`entrada_procesador` (procesador_id, orden, etiqueta, formatos_aceptados, obligatorio). No se agrega
ahora porque hoy no hay evidencia de que ningún procesador la necesite, y una tabla especulativa es
deuda igual que una columna de más.

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
- La forma de una ejecución (cuántos archivos entran, qué sale) es **dato configurable**, no código:
  cambiar un procesador de uno a varios archivos es editar su fila desde el panel admin, sin
  desplegar. El portal arma la interfaz de carga leyendo esa fila y nunca conoce el módulo Python.
- Costo real: la fila y el módulo tienen que ser coherentes. Es el mismo tipo de desincronización
  que ya introdujo `clave_procesador` (ADR 0006) y se contiene igual — el pipeline valida el
  conjunto contra la fila antes de instanciar el módulo, y si un módulo espera dos archivos pero su
  fila declara `entradas_max = 1`, el error es tipificado y explícito, nunca un fallo dentro del
  procesamiento.
- Costo real: toda consulta transversal — el dashboard del colaborador ("todo lo que tengo
  asignado"), el catálogo del admin y el ranking de analítica — debe unir dos orígenes (UNION o
  dos consultas), y `evento_uso` usa una referencia polimórfica que la base de datos no puede
  validar con FK; la integridad de esa referencia se garantiza en la capa de aplicación.
- Agregar una tercera naturaleza de recurso a futuro implica una tabla y una tabla de unión
  nuevas, más tocar cada consulta transversal.
