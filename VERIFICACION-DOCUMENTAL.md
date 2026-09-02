# Verificacion documental

Corrida: 2026-08-30 | Perimetro: 14 documentos (PRD, DESIGN, TECH-DESIGN, BACKLOG, adrs/*)

## Resumen

| Detector        | Hallazgos |
|-----------------|-----------|
| Huecos          | 1         |
| Contradicciones | 4         |
| Huerfanos       | 4         |

Cobertura del Detector A: **35 promesas** recorridas - 19 de `PRD.md ## Alcance` y 16 de
`PRD.md ## Casos borde`. Las 19 del alcance tienen bajada completa en `TECH-DESIGN.md` y trabajo
asignado en `BACKLOG.md`. De los 16 casos borde, 15 tienen criterio de aceptacion propio en
`TECH-DESIGN.md`; el restante es H-01.

## Huecos de trazabilidad

### H-01 - Limite de numero de filas por procesador

- **Origen:** `PRD.md:188` - "el limite de numero de filas no es fijo, se define por procesador
  durante el levantamiento del requerimiento segun lo que necesite el usuario"
- **Presente en:** `adrs/0006-procesadores-registro-modulos.md:103` (parcial: el pipeline delega la
  validacion de "contenido" al modulo, unico lugar donde ese limite podria vivir hoy)
- **Ausente en:** `TECH-DESIGN.md`, `BACKLOG.md`, `adrs/0002-modelo-datos-tablas-separadas.md`
- **Detalle:** el PRD lo enuncia como un limite **declarado por procesador**, con la misma gramatica
  que usa dos lineas antes para `tamano_max` ("cada procesador define el tamano maximo permitido",
  `PRD.md:186`). `tamano_max` termino siendo columna; el limite de filas no. La fila `procesador`
  declara `formatos_aceptados`, `tamano_max`, `entradas_min`, `entradas_max`, `tamano_max_total` y
  `salida_esperada` (`adrs/0002:36`), y ningun campo de filas.
- **Decision pendiente, con consecuencias opuestas:**
  - **Columna en la fila `procesador`** - el admin cambia el limite desde el panel sin desplegar,
    coherente con `adrs/0002:55` ("la fila es la unica fuente de verdad de la cardinalidad").
  - **Codigo en el modulo Python** (item #12) - cambiar el limite exige desplegar el servicio
    FastAPI, lo que tensiona la promesa del PRD de definirlo "segun lo que necesite el usuario".

  `adrs/0002:74-79` ya discute una tabla hija `entrada_procesador` para archivos con roles
  distintos, y no contempla este caso.

## Contradicciones

### C-01 - Contrato de la ruta de ejecucion de procesadores

- **A:** `adrs/0003-api-rest-json-interna.md:21` - "`POST /api/procesadores/{id}/ejecutar` -
  multipart (<=25 MB), devuelve el archivo procesado o un error tipificado (formato / tamano /
  contenido)."
- **B:** `adrs/0006-procesadores-registro-modulos.md:104` - "empaqueta la salida si hay mas de un
  archivo y devuelve el resultado - o un **error tipificado** (formato / tamano / contenido /
  cantidad / clave inexistente)"
- **Por que chocan:** el ADR 0003 describe la ruta con el contrato **original** (un archivo de
  entrada, un archivo de salida, tres tipos de error). La revision del ADR 0006
  (`adrs/0006:9-25`) lo amplio a multiples archivos, salida ZIP y cinco tipos de error, y el ADR
  0003 no se actualizo. Tampoco menciona `tamano_max_total`, el tope del conjunto.
- **Riesgo:** es la contradiccion mas cara de las cuatro. `TECH-DESIGN.md:171-190` y
  `BACKLOG.md:60` (item #10) ya reflejan el contrato nuevo; quien implemente el #10 leyendo el
  ADR 0003 como fuente del contrato REST construira la ruta equivocada.

### C-02 - Actualizacion del ADR 0002 declarada pendiente, pero ya hecha

- **A:** `adrs/0006-procesadores-registro-modulos.md:203` - "La fila `procesador` del ADR 0002
  necesita campos nuevos para declarar el contrato (cantidad de archivos de entrada y si la salida
  es simple o empaquetada), de modo que el portal arme la interfaz de carga correcta sin conocer el
  codigo del modulo. **Pendiente: actualizar ADR 0002.**"
- **B:** `adrs/0002-modelo-datos-tablas-separadas.md:36` - "`procesador` (id, nombre, descripcion,
  clave_procesador, formatos_aceptados, tamano_max, entradas_min, entradas_max, tamano_max_total,
  salida_esperada, activo)"
- **Por que chocan:** el ADR 0006 anuncia como pendiente una actualizacion que el ADR 0002 ya
  incorporo, con los cuatro campos en el modelo (`adrs/0002:36`) y una seccion propia que los
  documenta (`adrs/0002:53-79`). Quien lea el 0006 concluye que el modelo de datos todavia no
  soporta multi-archivo ni ZIP.

### C-03 - Alcance de la promesa "cualquier intento de uso recibe 403"

- **A:** `adrs/0007-estado-servidor-fuente-verdad.md:71` - "el PRD se cumple porque cualquier
  intento de uso ya recibe 403 - la vista puede ir levemente detras de la verdad, la autorizacion
  nunca."
- **B:** `adrs/0003-api-rest-json-interna.md:45` - "La promesa del ADR 0007 de que 'cualquier
  intento de uso recibe 403' es exacta para `procesador`, cuya ejecucion si atraviesa el backend
  (item #10), y es **inaplicable a un `enlace` externo**."
- **Por que chocan:** el ADR 0003 declara explicitamente que una afirmacion del ADR 0007 no vale
  para uno de los dos tipos de recurso, y el ADR 0007 sigue enunciandola sin matiz, dos veces
  (`adrs/0007:36` y `adrs/0007:71`).
- **Contraste util:** el mismo ADR 0007 si recibio nota de correccion cuando se detecto el error
  de CSRF (`adrs/0007:45-52`, registrado en `BACKLOG.md:44`). Este caso no tuvo el mismo
  tratamiento: la correccion vive en el documento que corrige, no en el corregido.

### C-04 - Eleccion de ORM abierta y cerrada en el mismo documento

- **A:** `adrs/0005-base-datos-sql-server.md:16` - "accedida desde Next.js mediante un ORM con
  soporte oficial (**Prisma o Drizzle** con el driver `mssql`)"
- **B:** `adrs/0005-base-datos-sql-server.md:22` - "El `schema.prisma` del portal es la fuente de
  verdad del modelo de datos (ADR 0002); toda creacion o alteracion de tablas, indices o columnas
  ocurre exclusivamente a traves de las **migraciones de Prisma** del portal."
- **Por que chocan:** el ADR presenta la eleccion de ORM como abierta y, cinco lineas despues, la
  da por cerrada en Prisma, al punto de nombrar el archivo `schema.prisma` como fuente de verdad.
  Es la unica contradiccion **interna a un mismo documento** de esta corrida.
- **Contraste util:** el ADR 0007 dejo una disyuntiva equivalente ("SWR o React Query",
  `adrs/0007:34`) y su cierre quedo registrado en `BACKLOG.md:41` como decision posterior al
  Technical Design. La disyuntiva Prisma/Drizzle no tiene entrada equivalente, aunque
  `BACKLOG.md:52` (item #2) ya implementa "Prisma sobre SQL Server".

## Huerfanos hacia arriba

> **Criterio aplicado.** Se reportan solo los items o decisiones que agregan **alcance visible o
> carga operativa** que el PRD nunca contemplo. Los medios tecnicos para fines que el PRD si pide
> (SQL Server, `SameSite=Lax`, politica de workers y RAM) no se cuentan como huerfanos: son la
> forma de cumplir un requisito, no alcance nuevo.

### O-01 - Baja de procesadores

- **Ubicacion:** `BACKLOG.md:56` (item #6) - "Alta, edicion **y baja** de la fila `procesador`"
- **Sin origen en:** `PRD.md`, `TECH-DESIGN.md`
- **Detalle:** el propio backlog documenta que la capacidad se agrego al despiezar
  (`BACKLOG.md:43`: "PRD, TECH-DESIGN y este backlog la omitian los tres para procesadores"), y
  registra como impacto documental unicamente "**Backlog actualizado**". El `## Alcance` del PRD no
  menciona dar de baja procesadores y los criterios de aceptacion del catalogo
  (`TECH-DESIGN.md:231-234`) solo cubren alta y edicion. Es el huerfano de mayor valor: fue
  detectado y decidido conscientemente, pero solo uno de los tres documentos se puso al dia.

### O-02 - Item #0: entornos, despliegue y red

- **Ubicacion:** `BACKLOG.md:50` - "Pipeline de despliegue de cada repositorio, entornos y gestion
  de secretos, base de datos provisionada con sus dos usuarios de distinto privilegio, y la red
  interna que hace inalcanzable el endpoint del servicio desde fuera"
- **Sin origen en:** `PRD.md`
- **Detalle:** huerfano legitimo. El PRD no habla de infraestructura, pero este item encabeza el
  camino critico (`BACKLOG.md:73`) y arrastra tres de los cinco prerrequisitos externos de TI
  (`BACKLOG.md:21-25`). Es carga operativa real que ningun documento de producto reconoce.

### O-03 - Item #11: procesador de fixture (passthrough)

- **Ubicacion:** `BACKLOG.md:61` - "existe para probar la tuberia completa de punta a punta sin
  depender de reglas de negocio"
- **Sin origen en:** `PRD.md`
- **Detalle:** huerfano legitimo y deliberado: es un artefacto de prueba, no una capacidad de
  producto. Se registra para que no se confunda con uno de los 3 procesadores reales previstos
  (`BACKLOG.md:40`).

### O-04 - Validacion temprana del tamano descomprimido (zip bomb)

- **Ubicacion:** `adrs/0006-procesadores-registro-modulos.md:140` - "**Validacion temprana del
  tamano descomprimido (obligatoria).** El limite de 25 MB es del archivo *comprimido*; un
  `.xlsx`/`.docx` es un ZIP que puede descomprimirse a varios GB"
- **Sin origen en:** `PRD.md`
- **Detalle:** a diferencia de los otros medios tecnicos, este **produce un rechazo visible para el
  usuario**: un archivo que cumple los 25 MB del PRD puede ser rechazado igual por su tamano
  descomprimido. `TECH-DESIGN.md:87-90` lo mapea a los eventos `error_tamano`/`error_contenido`,
  pero la lista de casos borde del PRD (`PRD.md:186-192`) no contempla ese motivo de rechazo ni el
  mensaje que lo acompana. Con el Detector A ya recorriendo `## Casos borde`, este huerfano es el
  reflejo exacto de esa seccion: la unica promesa de rechazo que existe en el diseno y no en el PRD.
