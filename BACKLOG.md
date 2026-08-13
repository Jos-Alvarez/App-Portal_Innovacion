---
title: "Backlog: Portal de Innovación - Lima Expresa"
---

# Backlog: Portal de Innovación — Lima Expresa

Derivado de `PRD.md` y `TECH-DESIGN.md` (+ `adrs/`). Cada ítem está dimensionado para ser **un
ciclo de Spec-Driven Development**, no un área funcional completa ni un cambio trivial. El orden
es por **dependencia**, no por prioridad percibida.

El proyecto son **dos repositorios** (ADR 0001): `portal` (Next.js + TypeScript) y `procesadores`
(FastAPI + Python). La columna **Repo** indica dónde corre el ciclo SDD de cada ítem.

## Prerrequisitos externos (no son código)

Estos trámites no los resuelve el equipo de desarrollo y **bloquean** los ítems indicados. Conviene
iniciarlos el día uno: si TI demora, el camino crítico se detiene sin que haya nada que programar.

| Prerrequisito | Responsable | Bloquea | Nota |
|---|---|---|---|
| Registro de la aplicación en Entra ID (client ID, secret, redirect URIs de cada entorno) | TI | **#3** — y con él todo lo que viene después | Sin esto no hay login, y sin login no hay portal |
| Consentimiento del permiso Graph `User.Read.All` | TI | **#17** (parcialmente) | Riesgo abierto ya registrado en TECH-DESIGN. Si no se concede, #17 se implementa con la degradación acordada en ADR 0009: buscar solo entre usuarios que ya ingresaron |
| Credenciales de la API de correo | TI / Innovación | **#14** | El PRD ya define que el fallo de correo se ignora; sin credenciales, #13 igual funciona y #14 se posterga sin daño |
| Provisión de SQL Server (instancia, base, usuarios) | TI | **#0**, **#2** | Se necesitan dos usuarios distintos: el del portal (DDL + datos) y el de FastAPI (solo `SELECT`, ADR 0005) |
| Red interna entre portal y servicio, con el endpoint interno inalcanzable desde fuera | TI / Infra | **#0**, **#9** | Riesgo abierto de TECH-DESIGN: es un requisito de seguridad, no una preferencia |

## Decisiones tomadas después del Technical Design

Estas decisiones se acordaron al despiezar el backlog, **después** de haber cerrado el Technical
Design. La columna de la derecha registra qué documento quedó actualizado por cada una.

| Decisión | Impacto documental |
|---|---|
| Portal (Next.js) y servicio de procesadores (FastAPI) viven en **repositorios separados**. | Coherente con ADR 0001 (dos desplegables). Sin cambio de ADR. |
| Se mantiene **un solo servicio** FastAPI con registry por clave; no se abre un microservicio por procesador. | Confirma ADR 0006. Sin cambio. |
| Dentro de FastAPI habrá **una ruta por procesador**, implementada como cáscara fina sobre el pipeline común y el registry. La ruta del portal sigue siendo genérica. | **ADR 0006 actualizado.** |
| Un procesador puede recibir **múltiples archivos** y devolver **múltiples archivos empaquetados en ZIP**. Los límites se validan por archivo y sobre el conjunto. | **ADR 0006, ADR 0002, PRD y TECH-DESIGN actualizados.** La fila `procesador` gana `entradas_min`, `entradas_max`, `tamano_max_total` y `salida_esperada`, única fuente de verdad del contrato. |
| **El `evento_uso` lo registra el portal, no FastAPI.** El servicio devuelve el resultado o un error tipificado; el portal lo mapea al tipo de evento y escribe la fila, porque es quien conoce al usuario. | **ADR 0006, ADR 0005 y TECH-DESIGN actualizados.** Consecuencia: el acceso de FastAPI a la BD queda de **solo lectura también en datos** (usuario de BD con `SELECT` y nada más). |
| `usuario.area` se obtiene del atributo **`department` de Entra ID**. | Cierra el hueco: ni PRD ni TECH-DESIGN definían el origen de ese campo, del que depende toda la analítica por área. |
| Existen **3 procesadores reales** previstos; sus reglas de negocio aún no están documentadas. | Ítem #12, bloqueado hasta contar con esa documentación. |

## Backlog

| # | Ítem | Repo | Alcance | Depende de | Contexto extra requerido |
|---|---|---|---|---|---|
| 0 | Entornos, despliegue y red | ambos | Pipeline de despliegue de cada repositorio, entornos y gestión de secretos, base de datos provisionada con sus dos usuarios de distinto privilegio, y la red interna que hace inalcanzable el endpoint del servicio desde fuera | Prerrequisitos externos | — |
| 1 | Fundación UI y sistema de diseño | portal | Scaffold Next.js + TS, tokens CSS claro/oscuro, tipografía Archivo, logo con variante dark, toggle con `localStorage`, componentes base y los 4 estados obligatorios de DESIGN.md | — | — |
| 2 | Esquema de datos y migraciones | portal | Prisma sobre SQL Server con las 9 entidades del ADR 0002 e índices de `evento_uso`; el portal es dueño único del esquema y el único que migra | #1 | — |
| 3 | Login Entra ID, sesión y perfil | portal | OIDC con Auth.js, rechazo de correos fuera del dominio corporativo, upsert de `usuario` incluyendo `area` desde el atributo `department` de Entra ID, pantalla de login con logo | #1, #2 | — |
| 4 | Autorización en servidor | portal | Guard por request contra BD (`es_admin` y filas de asignación), pantalla 403 de DESIGN.md, revalidación de la cache del cliente (ADR 0007) | #3 | — |
| 5 | Catálogo de enlaces (admin) | portal | Alta, edición y baja de `enlace` con validación de formato de URL y tipo app \| agente | #4 | — |
| 6 | Catálogo de procesadores (admin) | portal | Alta y edición de la fila `procesador`: nombre, `clave_procesador`, formatos aceptados, `tamano_max`, y el contrato de E/S (`entradas_min`, `entradas_max`, `tamano_max_total`, `salida_esperada`) | #4 | — |
| 7 | Asignaciones por usuario | portal | Switch de asignar/revocar enlaces y procesadores por usuario, sin guardado global, con efecto inmediato verificado en servidor | #5, #6 | — |
| 8 | Dashboard del colaborador | portal | Vista unificada de lo asignado con chips de tipo, apertura de enlace externo en pestaña nueva con registro de `evento_uso` tipo `apertura`, y estado vacío | #7 | — |
| 9 | Servicio de procesadores: pipeline y registry | procesadores | Token de servicio, registry por clave, pipeline común (validación de cantidad, formato y tamaño, validación temprana de tamaño descomprimido, errores tipificados, temporales con `try/finally`), rutas por procesador como cáscara fina, empaquetado ZIP de salidas múltiples, acceso a BD de solo lectura | #0, #2 | — |
| 10 | Proxy de ejecución y UI de procesador | portal | Ruta del portal que autoriza contra la asignación, reenvía uno o varios archivos por red interna, retransmite la respuesta y **escribe el `evento_uso`** mapeando el error tipificado que reciba; carga múltiple en la UI, banners por motivo, timeout de 2 minutos y descarga del resultado (archivo o ZIP) | #4, #8, #9 | — |
| 11 | Procesador de fixture (passthrough) | procesadores | Módulo mínimo que recibe un archivo y devuelve una salida marcada, más una variante multi-archivo que devuelve ZIP; existe para probar la tubería completa de punta a punta sin depender de reglas de negocio | #9, #10 | — |
| 12 | Procesadores reales | procesadores | **Se expande en 3 specs independientes, una por procesador.** Cada una aporta únicamente su módulo Python y su ruta; el pipeline ya está resuelto en #9 | #11 | **Sí — reglas de negocio del dominio de cada procesador** |
| 13 | Buzón de sugerencias (colaborador) | portal | Formulario de envío, alta en estado `pendiente`, listado propio con trazabilidad visible. Acceso general: no requiere asignación | #3 | — |
| 14 | Notificación por correo best-effort | portal | Envío vía API de correo al registrarse una sugerencia; el fallo se ignora silenciosamente, sin cola ni reintento (ADR 0008 rechazado) | #13 | — |
| 15 | Gestión de sugerencias (admin) | portal | Listado completo con chips de estado, cambio de estado y asiento inmutable en `historial_sugerencia` por cada transición | #13 | — |
| 16 | Agrupación de sugerencias | portal | `grupo_sugerencia`: agrupar dos o más sugerencias similares conservando el estado y el autor individuales de cada una | #15 | — |
| 17 | Gestión de administradores | portal | Botón junto a cerrar sesión visible solo para admins, búsqueda en directorio vía Graph con degradación a usuarios ya registrados, promoción y revocación, y regla transaccional de mínimo 1 administrador | #4 | — |
| 18 | Motor de consultas de analítica | portal | Endpoint de analítica con rangos hoy / 7 días / 30 días / personalizado, comparación contra el periodo anterior equivalente y agregaciones SQL en vivo sobre `evento_uso` (ADR 0010) | #8, #10, #15 | — |
| 19 | Pantalla de analítica (admin) | portal | Ranking de recursos por uso, uso por usuario y por área, adopción (activos vs. asignados), sugerencias por estado y área, y errores de procesamiento por procesador y tipo | #18 | — |

## Notas de secuencia

- **El camino crítico es #0 → #1 → #2 → #3 → #4.** De ahí se abren tres ramas que avanzan en
  paralelo: catálogo y procesadores (#5-#12), sugerencias (#13-#16) y administradores (#17). La
  analítica cierra al final porque consume los eventos que generan las otras dos.
- **#0 puede arrancar en paralelo con #1 y #2**, pero tiene que estar terminado antes de #9: el
  aislamiento de red del endpoint interno es un requisito de seguridad del servicio, no un detalle
  de despliegue posterior.
- **#11 y #12 son hojas del grafo**: ningún otro ítem depende de ellos. Los demás ítems pueden
  completarse íntegros mientras las reglas de negocio de los procesadores reales no estén
  disponibles.
- **#11 es el que prueba la tubería**, no #12. El circuito navegador → portal → FastAPI → descarga
  se valida con el procesador de fixture; los procesadores reales solo agregan lógica de negocio
  sobre un camino ya verificado.
- **#3 desbloquea la analítica por área.** Si `department` no llega en los claims del token, se
  resuelve ahí (optional claim en Entra o lectura del perfil propio vía Graph), no en #18.
- **#6 y #9 comparten el contrato de E/S.** La fila del procesador declara cuántos archivos espera
  y qué devuelve; el servicio lo hace cumplir. Conviene especificarlos en ese orden.
- **#9 y #10 comparten el contrato de errores.** El servicio los tipifica y el portal los mapea al
  `evento_uso` y al banner de la UI. Definir ese vocabulario de errores en #9 y consumirlo en #10,
  no al revés.

## Cómo usar este backlog

Cada ítem es una spec independiente. Al implementarlo, arrancá un ciclo de Spec-Driven
Development (`sdd-new` o el flujo equivalente de tu harness) usando **ese ítem** como el "change" —
no el proyecto completo, y en el repositorio que indica la columna Repo. Si la columna "Contexto
extra requerido" tiene algo, compartilo como contexto al generar la spec de ese ítem.

Para el ítem #12: antes de generar la spec de cada procesador, compartí la documentación de reglas
de negocio de ese dominio (transformación esperada, estructura del archivo de entrada, columnas
obligatorias, validaciones de contenido, formato de la salida). El PRD y el Technical Design
definen el *contrato* del procesador, no su lógica: esa lógica no puede derivarse de los documentos
existentes.
