# ADR 0008: Outbox de correos con job de reintento y chequeo periódico de enlaces externos

## Estado

**Rechazado** (2026-08-02). Se descartó para **eliminar toda infraestructura de jobs en segundo
plano** (cron/scheduler), simplificando la arquitectura a un solo proceso sin piezas programadas.
En su lugar:

- **Correos:** se envían en modo *best-effort* tras registrar el dato. Si el envío falla, el error
  se **ignora silenciosamente**; la sugerencia no se pierde porque ya está garantizada en la BD y el
  administrador la ve en el panel del portal (PRD, casos borde). No hay tabla `correo_pendiente` ni
  reintento.
- **Enlaces externos:** **no se validan en background**. El portal no chequea periódicamente el
  estado de los enlaces (el PRD permite explícitamente omitir esta verificación); se eliminan los
  campos `estado_chequeo` y `contador_fallos` de la tabla `enlace` (ADR 0002).

Consecuencia directa: la advertencia A5 (host del scheduler / supuesto de despliegue de larga vida)
queda **resuelta por diseño**, porque no existe ningún job programado en el sistema.

El contenido original se conserva abajo como registro de la decisión descartada.

---

## Estado (original)

Aceptado

## Contexto

El PRD define dos casos borde de resiliencia: (1) si el servidor de correo está caído, la
sugerencia no debe perderse — debe quedar registrada y el correo reintentarse automáticamente al
restablecerse el servicio; el criterio de éxito exige que el correo llegue en menos de 1 minuto en
operación normal. (2) Si un enlace externo está caído o cambió de URL, el portal debe — cuando sea
técnicamente posible — mostrar el motivo, no permitir abrirlo y avisar por correo al Área de
Innovación. El envío de correos es vía API (no SMTP directo).

## Decisión

**Correos — patrón outbox transaccional:** toda notificación se inserta en `correo_pendiente`
dentro de la misma transacción que el dato que la origina (p. ej. la sugerencia). Tras la
transacción se intenta el envío inmediato vía la API de correo (cumple el "<1 minuto" en operación
normal); un job programado (cada ~1 minuto) recorre los pendientes/fallidos, envía, marca como
enviado y reintenta con backoff los que fallen.

**Enlaces externos — chequeo periódico en background:** un job (cada 15-30 minutos) hace HTTP
HEAD/GET a cada URL activa del catálogo. El estado consecutivo se lleva en el campo persistido
`enlace.contador_fallos` (entero, por defecto 0; ADR 0002), de modo que el job es sin estado propio
y sobrevive a reinicios:

- **Respuesta viva (2xx/3xx/401/403):** el job **reinicia `contador_fallos` a 0** (401/403 solo
  indican que la app exige login, no que esté caída). Si el enlace estaba `caido`, se **rehabilita**
  (`estado_chequeo = vivo`).
- **Fallo (timeout, error DNS o 5xx):** el job **suma +1 a `contador_fallos`** en la base de datos.
- **Umbral:** el enlace se marca como **caído** (`estado_chequeo = caido`) **solo cuando
  `contador_fallos` llega a 3**. En ese momento la UI lo deshabilita mostrando el motivo y se encola
  (vía el mismo outbox) un correo al Área de Innovación indicando qué enlace falló y por qué.

Así se exige que los 3 fallos sean **consecutivos**: un único chequeo vivo intercalado pone el
contador de nuevo en 0.

## Alternativas consideradas

**Correos:**
- **Envío directo + marca de fallo con reenvío manual** — más simple (sin job), pero el reintento
  quedaría manual, contradiciendo el PRD que pide que el registro "viaje" solo al restablecerse el
  servidor.
- **Cola externa gestionada (Azure Queue/Service Bus)** — reintentos y dead-letter resueltos por
  la plataforma, pero es una pieza de infraestructura adicional para un volumen de correos mínimo.

**Enlaces:**
- **Verificación al hacer clic** — sin job, pero agrega latencia a cada apertura y el aviso a
  Innovación se dispara recién cuando algún usuario lo intenta.
- **No validar** — el PRD lo permite explícitamente, pero siendo viable un chequeo HTTP básico, se
  prefirió cumplir la rama "si es posible validar" del caso borde.

## Consecuencias

- Ninguna notificación se pierde aunque la API de correo esté caída horas: la garantía es
  transaccional (el correo pendiente se crea o no se crea junto con su dato origen).
- Los enlaces caídos se detectan sin intervención del usuario y el Área de Innovación se entera
  proactivamente.
- Costo real: aparece un componente de jobs programados (scheduler) que hay que alojar y
  monitorear — en Next.js no hay cron nativo, así que se usará un scheduler del host (cron del
  contenedor, Azure WebJobs/Functions timer, o el scheduler del servicio FastAPI) — y el chequeo
  de enlaces puede dar falsos positivos con apps que bloquean HEAD o filtran por red; el umbral de
  3 fallos consecutivos y el tratamiento de 401/403 como "vivo" mitigan, pero no eliminan, ese
  riesgo.
