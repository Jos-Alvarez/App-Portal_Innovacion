# ADR 0010: Analítica servida con agregación SQL en vivo sobre `evento_uso`

## Estado

Aceptado

## Contexto

La pantalla de analítica del PRD exige: uso por app/procesador con ranking, uso por usuario y por
área, adopción (usuarios activos vs con acceso asignado), sugerencias por estado y área de origen,
errores de procesamiento por procesador, y periodos de hoy / 7 días / 30 días / rango
personalizado con comparación contra el periodo anterior. Los eventos se registran en la tabla
`evento_uso` (ADR 0002): aperturas de enlaces, ejecuciones de procesadores y errores tipificados,
con usuario y fecha. El volumen esperado es bajo (empresa mediana, catálogo mínimo).

## Decisión

La analítica se sirve con **agregación SQL en el momento de la consulta**: el endpoint
`GET /api/analitica?desde=&hasta=&comparar=` ejecuta consultas `GROUP BY` sobre `evento_uso`
(unida a `usuario` para el corte por área, y a `sugerencia` para su distribución), con índices por
fecha, recurso y usuario. La comparación contra el periodo anterior se resuelve ejecutando las
mismas consultas sobre el rango desplazado. No hay tablas de resumen ni piezas externas.

## Alternativas consideradas

- **Resúmenes precalculados diarios (job nocturno)** — consultas instantáneas a cualquier escala,
  pero la vista de "hoy" obligaría a mezclar resumen con eventos crudos y el job es una pieza más
  que mantener; complejidad prematura para el volumen esperado.
- **Telemetría externa (Application Insights + Power BI embebido)** — potencia analítica
  corporativa, pero la pantalla exigida por el PRD quedaría acoplada a licencias y permisos
  externos y los datos saldrían de la BD propia.

## Consecuencias

- Cero piezas adicionales: los datos siempre están al día (incluida la vista "hoy") y la
  comparación de periodos es solo una segunda consulta.
- La misma tabla `evento_uso` alimenta la métrica de adopción cruzándola con las tablas de
  asignación (asignados sin eventos = no adoptaron).

  > **Nota técnica — adopción sobre la "foto actual" de permisos.** La adopción cruza el uso
  > *histórico* (`evento_uso` del periodo) con las asignaciones *actuales*. Esto es el
  > **comportamiento funcional deseado por el negocio**: la métrica responde "de quienes hoy tienen
  > acceso asignado, cuántos lo usan". Se **acepta formalmente** que **no habrá historial de
  > asignaciones** (no se versiona quién tenía acceso en cada fecha); la métrica refleja la foto
  > actual de permisos y no reconstruye asignaciones pasadas. Un alta/baja de asignación durante el
  > periodo mueve el denominador, y eso es aceptado a propósito dado el volumen mínimo de
  > asignaciones (PRD).
- Costo real: el rendimiento depende del tamaño de `evento_uso`; si el volumen creciera órdenes
  de magnitud (años de eventos, uso intensivo), las consultas de rangos largos se degradarían y
  habría que introducir entonces resúmenes precalculados. Se acepta ese costo diferido y se deja
  señalado como evolución conocida.
