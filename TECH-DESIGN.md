# Technical Design Document: Portal de Innovación — Lima Expresa

**Tipo de proyecto:** Greenfield
**Design.md disponible:** Sí — el modelo de datos y los estados de UI se derivaron del PRD y del
sistema de diseño (DESIGN.md).

## Resumen

Se construye el Portal de Innovación de Lima Expresa (ver `PRD.md`): un punto único donde cada
colaborador, autenticado con su correo corporativo vía Entra ID, ve solo las apps, agentes de IA y
procesadores de archivos que le fueron asignados; procesa archivos dentro del portal y abre las
apps externas en una nueva pestaña. El Área de Innovación administra el catálogo, las
asignaciones, los administradores y las sugerencias de innovación (con flujo de aprobación,
agrupación de duplicados y notificación por correo), y mide el uso desde una pantalla de
analítica. La interfaz sigue el sistema de diseño de DESIGN.md (identidad derivada del logo, modo
claro/oscuro).

## Arquitectura de componentes

Dos desplegables + servicios externos (ADR 0001):

```
┌──────────────────────────────┐      ┌───────────────────────────────┐
│ Portal — Next.js + TS        │      │ Servicio de procesadores      │
│ (ADR 0004)                   │──────│ FastAPI + Python (ADR 0006)   │
│ · UI React (DESIGN.md)       │      │ · Registro de módulos con     │
│ · API REST /api/* (ADR 0003) │      │   interfaz común (ABC)        │
│ · Auth Entra ID (ADR 0009)   │      │ · Endpoint interno            │
│ · Correos best-effort        │      │   /interno/.../ejecutar       │
│   (sin jobs; 0008 rechaz.)   │      └───────────────┬───────────────┘
└──────────────┬───────────────┘                      │
               │              ┌───────────────────────┤
        ┌──────┴──────┐  ┌────┴─────────┐  ┌──────────┴──────────┐
        │ Entra ID +  │  │ SQL Server   │  │ API de correo       │
        │ Graph (RO)  │  │ (ADR 0005)   │  │ (best-effort)       │
        └─────────────┘  └──────────────┘  └─────────────────────┘
```

- **Portal (Next.js + TypeScript):** UI, autenticación, catálogo, asignaciones, sugerencias,
  gestión de administradores, analítica y envío de correos **best-effort** (notificación directa al
  registrar una sugerencia; sin jobs en segundo plano — ADR 0008 rechazado).
- **Servicio de procesadores (FastAPI + Python):** ejecuta los procesadores de archivos; expone un
  **endpoint interno** (p. ej. `POST /interno/procesadores/{id}/ejecutar`, multipart ≤25 MB,
  timeout 2 min) alcanzable **solo desde el portal por red interna** y con token de servicio —
  nunca desde el navegador. El portal le delega la ejecución tras autorizar; FastAPI no lee la
  sesión del usuario ni consulta permisos (ADR 0006, 0007). Corre con **workers fijos y limitados**
  y un **límite estricto de RAM por contenedor/instancia**, más validación temprana del tamaño
  descomprimido, para que un archivo anómalo mate a un worker aislado sin tumbar el servicio
  (ADR 0001, 0006).
- **SQL Server** compartido por ambos; el esquema es propiedad del portal (Next.js/Prisma es el
  dueño único que migra) y FastAPI accede en modo "solo lectura estructural", sin permisos DDL
  (ADR 0005).
- **Entra ID / Microsoft Graph:** autenticación OIDC y búsqueda de directorio en solo lectura.
- **API de correo:** notificación **best-effort** al registrar una sugerencia; si el envío falla, el
  error se ignora (la sugerencia ya está en BD y es visible en el panel del admin). Sin cola ni
  reintento.

### Flujo de ejecución de un procesador (modelo proxy)

La ejecución de un procesador sigue el patrón **navegador → portal Next.js → FastAPI**, decidido
para que la autorización por usuario viva en un solo lugar (ADR 0003, 0006, 0007):

1. El navegador sube el archivo a `POST /api/procesadores/{id}/ejecutar`, **ruta del backend de
   Next.js** (no de FastAPI).
2. Next.js resuelve al usuario desde la cookie de sesión (Auth.js) y **verifica en SQL Server que
   tenga la asignación** al procesador. Sin fila de asignación → **403 en servidor** con la pantalla
   de sin-permiso (DESIGN.md), sin procesar.
3. Solo si la autorización es exitosa, Next.js **reenvía el archivo por red interna** al endpoint
   interno de FastAPI (`POST /interno/procesadores/{id}/ejecutar`), autenticando la llamada de
   backend a backend con el **token de servicio**.
4. FastAPI ejecuta (registry, validaciones, `evento_uso`) y devuelve el archivo resultante; Next.js
   lo retransmite al navegador. FastAPI **nunca** ve la cookie de sesión ni consulta permisos:
   confía en que el portal ya autorizó.

El procesamiento es **síncrono y sin estado (stateless)**: los archivos de entrada/salida se
escriben en un **volumen temporal de disco** solo para aliviar la RAM durante la ejecución, y un
bloque `try/finally` los **elimina de inmediato** tras enviar la respuesta (éxito o error). El
servidor **no almacena archivos para descargas posteriores**; la persistencia del resultado es
responsabilidad exclusiva del navegador del usuario (ADR 0006).

> **Nota técnica — se acepta el "doble salto" de red.** El archivo (hasta 25 MB) viaja
> navegador → portal → servicio en lugar de ir directo al servicio. Aceptamos ese doble salto (más
> latencia y memoria transitoria en el portal) de forma deliberada: es el mecanismo que permite
> **bloquear en servidor** el acceso a un procesador no asignado (requisito de seguridad del PRD)
> **manteniendo a FastAPI aislado de las cookies de autenticación** — el navegador nunca alcanza
> FastAPI y el servicio no necesita conocer sesiones ni el dominio de identidad. La alternativa
> (navegador → FastAPI directo) obligaría a exponer FastAPI al navegador, resolver CORS y validar
> tokens de Entra en el servicio, ampliando su superficie de seguridad sin beneficio.

## Decisiones de arquitectura

| # | Decisión | Estado |
|---|---|---|
| [ADR-0001](adrs/0001-monolito-full-stack.md) | Portal monolítico Next.js + servicio independiente de procesadores | Aceptado |
| [ADR-0002](adrs/0002-modelo-datos-tablas-separadas.md) | Modelo de datos con tablas separadas para enlaces y procesadores | Aceptado |
| [ADR-0003](adrs/0003-api-rest-json-interna.md) | API REST JSON interna como contrato UI ↔ servidor | Aceptado |
| [ADR-0004](adrs/0004-stack-nextjs-typescript.md) | Stack por componente: Next.js + TS (portal), FastAPI + Python (procesadores) | Aceptado |
| [ADR-0005](adrs/0005-base-datos-sql-server.md) | SQL Server como base de datos | Aceptado |
| [ADR-0006](adrs/0006-procesadores-registro-modulos.md) | Procesadores como módulos Python con interfaz común y registro por clave | Aceptado |
| [ADR-0007](adrs/0007-estado-servidor-fuente-verdad.md) | Servidor como única fuente de verdad de permisos; UI con cache revalidable | Aceptado |
| [ADR-0008](adrs/0008-resiliencia-outbox-y-chequeo-enlaces.md) | ~~Outbox de correos con job de reintento y chequeo periódico de enlaces~~ → correos best-effort, sin jobs ni chequeo de enlaces | Rechazado |
| [ADR-0009](adrs/0009-auth-entra-id-rol-en-bd.md) | Autenticación con Entra ID; rol de administrador en la BD del portal | Aceptado |
| [ADR-0010](adrs/0010-analitica-agregacion-sql-en-vivo.md) | Analítica servida con agregación SQL en vivo sobre `evento_uso` | Aceptado |

## Modelo de datos

Detalle completo en ADR 0002. Entidades y relaciones (todas con claves foráneas):

- `usuario` (correo, nombre, area, es_admin, activo) — el área alimenta los cortes de analítica.
- `enlace` (nombre, descripcion, url, tipo app|agente, activo) — apps/agentes externos; el chip
  violeta "agente IA" del DESIGN.md sale del campo `tipo`. Los enlaces no se verifican en background
  (ADR 0008 rechazado).
- `procesador` (nombre, descripcion, clave_procesador, formatos_aceptados, tamano_max ≤ 25 MB,
  activo) — `clave_procesador` referencia el módulo Python del registry (ADR 0006).
- `asignacion_enlace` (usuario_id, enlace_id) y `asignacion_procesador` (usuario_id,
  procesador_id) — permisos por usuario individual (PRD).
- `sugerencia` (autor_id, titulo, descripcion, area_destino, estado actual
  pendiente|en_revision|aprobada|rechazada|implementada, grupo_id, fecha de creación) — los 5
  estados corresponden a los chips del DESIGN.md; el recorrido completo vive en
  `historial_sugerencia`.
- `historial_sugerencia` (sugerencia_id, estado_anterior, estado_nuevo, cambiado_por, fecha_cambio)
  — registro **inmutable** de cada transición de estado (un asiento por cambio): garantiza la
  rendición de cuentas del PRD (quién cambió qué y cuándo) sin perder el estado anterior. Alimenta
  la trazabilidad visible para el colaborador autor.
- `grupo_sugerencia` (titulo, creado_por) — agrupación de sugerencias similares.
- `evento_uso` (usuario_id, tipo_recurso, id_recurso, tipo_evento
  apertura|ejecucion|error_formato|error_tamano|error_contenido, fecha) — referencia polimórfica
  validada en aplicación; alimenta toda la analítica.

La preferencia de tema claro/oscuro no se persiste en BD: vive en `localStorage` (DESIGN.md).

## Criterios de aceptación por flujo

### Login e identidad visual

- [ ] Un usuario con correo del dominio de Lima Expresa completa el login vía Entra ID y aterriza
      en su dashboard.
- [ ] Un correo fuera del dominio corporativo es rechazado en el login con mensaje claro.
- [ ] El logo aparece en el login (centrado) y en la topbar del portal, en ambos roles, según las
      medidas de DESIGN.md.
- [ ] Al alternar el toggle de tema, todo el portal cambia de modo, el logo cambia a su variante
      adaptada (sin bordes blancos ni pérdida de contraste) y la preferencia persiste tras cerrar
      y reabrir el navegador (`localStorage`).

### Dashboard del colaborador

- [ ] El colaborador ve única y exactamente los enlaces y procesadores con fila de asignación a su
      nombre (verificable con 2 usuarios de prueba con asignaciones distintas).
- [ ] Sin ninguna asignación, ve el estado vacío de DESIGN.md (icono + quién asigna + salida
      útil), nunca una pantalla en blanco.
- [ ] Toda vista de datos muestra skeleton durante la carga y el estado de error con botón
      Reintentar si la API falla.

### Ejecución de procesador

- [ ] Subida de archivo válido → el servicio FastAPI lo procesa y el navegador descarga el archivo
      resultante, sin intervención manual; se registra `evento_uso` tipo `ejecucion`.
- [ ] Archivo con formato no declarado por el procesador → banner rojo "formato no permitido", no
      se procesa, no hay archivo de salida; se registra `error_formato`.
- [ ] Archivo que excede el `tamano_max` del procesador (tope general 25 MB) → banner con ese
      motivo, sin procesar; se registra `error_tamano`.
- [ ] Archivo de formato correcto pero contenido inválido (columnas faltantes, corrupto) → banner
      con el motivo específico y botón Reintentar, sin caída del servicio ni archivo de salida; se
      registra `error_contenido`.
- [ ] Un procesamiento que supera 2 minutos se corta con error de timeout informado al usuario.
- [ ] Acceso por URL directa a un procesador no asignado → pantalla 403 de DESIGN.md (candado +
      "Volver al portal"), verificado en servidor, no solo ocultamiento.
- [ ] Una fila de `procesador` cuya `clave_procesador` no existe en el registry devuelve un error
      claro (no un 500 genérico).

### Apertura de enlaces externos

- [ ] Clic en un enlace asignado → se abre en nueva pestaña y se registra `evento_uso` tipo
      `apertura`.
- [ ] El portal no verifica en background el estado de los enlaces (ADR 0008 rechazado): un enlace
      caído o con URL cambiada se abre igual y su corrección la hace el Área de Innovación editando
      el catálogo cuando alguien lo reporta.

### Buzón de sugerencias

- [ ] Cualquier colaborador autenticado (con o sin asignaciones) puede enviar una sugerencia para
      sí, su área u otra área; queda en estado `pendiente` y visible con su trazabilidad.
- [ ] En operación normal, el Área de Innovación recibe el correo de aviso al registrarse la
      sugerencia; el envío es best-effort y el registro se confirma con toast.
- [ ] Con la API de correo caída, la sugerencia **queda registrada igualmente** y es visible en el
      panel del admin; el fallo de correo se ignora silenciosamente (sin reintento ni cola).

### Gestión de sugerencias (admin)

- [ ] El admin ve el listado completo de sugerencias con sus chips de estado (colores por estado
      según DESIGN.md).
- [ ] El admin cambia el estado (pendiente → en revisión → aprobada/rechazada/implementada); el
      cambio se confirma con toast y el nuevo estado es visible para el colaborador autor.
- [ ] Cada cambio de estado escribe un asiento inmutable en `historial_sugerencia`
      (estado_anterior, estado_nuevo, admin que lo hizo, fecha); el recorrido completo es
      consultable y ningún estado anterior se pierde al avanzar el embudo.
- [ ] El admin agrupa 2+ sugerencias similares en un grupo; las sugerencias agrupadas se muestran
      juntas y conservan su estado y autor individuales.

### Catálogo y asignaciones (admin)

- [ ] El admin registra un enlace nuevo (nombre, URL, descripción, tipo) desde el portal, sin
      despliegue; queda disponible para asignar. Una URL vacía o mal formada bloquea el guardado
      con error en el campo (borde rojo + mensaje, DESIGN.md).
- [ ] El admin da de alta la fila de un procesador (nombre, clave, formatos, tamaño máx.) desde el
      panel; la parte de código sigue el registro del ADR 0006.
- [ ] Un colaborador no ve las pantallas de alta y recibe 403 si llega por URL directa.
- [ ] El admin asigna/revoca recursos por usuario con el switch de DESIGN.md; cada cambio se
      confirma con toast y aplica sin "guardar" global.
- [ ] Tras revocar, la primera request del usuario afectado al recurso responde 403 (inmediato en
      servidor) y el recurso desaparece de su dashboard en ≤60 segundos o al recuperar el foco.

### Gestión de administradores

- [ ] El botón de gestión de administradores aparece junto al de cerrar sesión, solo para admins;
      un colaborador por URL directa recibe 403.
- [ ] La búsqueda consulta el directorio Entra vía Graph; sin resultados o si la persona ya es
      admin, se muestra el mensaje correspondiente y no se crean roles duplicados.
- [ ] Una persona promovida tiene capacidades de administrador desde su siguiente request (rol
      verificado en BD por request, ADR 0007) — a más tardar en su siguiente ingreso, como pide el
      PRD.
- [ ] Revocar el rol al único admin restante (incluida la auto-revocación) es rechazado con
      mensaje claro; la verificación es transaccional (nunca 0 admins, ni con dos revocaciones
      simultáneas).

### Analítica (admin)

- [ ] Para cada periodo (hoy, 7 días, 30 días, rango personalizado) la pantalla muestra: ranking
      de recursos por uso, uso por usuario y por área, adopción (activos vs asignados),
      sugerencias por estado y por área, y errores de procesamiento por procesador y tipo.
- [ ] Al activar la comparación, cada métrica muestra su valor del periodo anterior equivalente.
- [ ] Los eventos se registran en el momento del uso: una ejecución de procesador realizada hoy
      aparece en la vista "hoy" al recargar.

## Riesgos técnicos abiertos

- **Permiso Graph `User.Read.All`:** la búsqueda en directorio depende de que TI lo consienta.
  Mitigación acordada (ADR 0009): degradar a buscar solo entre usuarios que ya ingresaron al
  portal.
- **BD compartida entre portal y servicio de procesadores:** resuelto por dueño único (ADR 0005):
  Next.js/Prisma es el único dueño del esquema y el único que migra; FastAPI accede en modo "solo
  lectura estructural" (espejo del esquema, sin permisos DDL). Costo residual: mantener el espejo
  Python al día tras cada migración del portal.
- **Autenticación portal ↔ FastAPI:** el modelo quedó decidido (proxy backend-a-backend: solo el
  portal llama a FastAPI, con token de servicio; ADR 0006, 0007). Queda pendiente el **detalle del
  token** (formato, rotación) y **garantizar que el endpoint interno de FastAPI no sea alcanzable
  desde fuera de la red interna**; resolver en la primera spec del servicio de procesadores.
- **Crecimiento de `evento_uso`:** la agregación en vivo (ADR 0010) se degradaría con años de
  eventos a alto volumen; la evolución conocida es introducir resúmenes precalculados cuando se
  observe lentitud.

_(El riesgo de scheduler de jobs quedó eliminado: la arquitectura ya no usa jobs en segundo plano —
ADR 0008 rechazado; correos best-effort y sin chequeo de enlaces.)_
