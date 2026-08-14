# ADR 0003: API REST JSON interna como contrato UI ↔ servidor

## Estado

Aceptado

## Contexto

Aunque el sistema es un monolito (ADR 0001), el navegador y el servidor necesitan un contrato:
operaciones CRUD (catálogo de enlaces y procesadores, asignaciones, sugerencias, administradores),
subida y descarga de archivos vía multipart (tope 25 MB por archivo, PRD), y consultas de
analítica con filtros de periodo (hoy, 7 días, 30 días, rango personalizado, comparación con
periodo anterior). El único cliente es la propia UI del portal.

## Decisión

El contrato es una **API REST JSON interna** bajo `/api/*`, consumida exclusivamente por la UI del
portal. Rutas principales:

- `GET /api/mis-recursos` — enlaces y procesadores asignados al usuario autenticado
- `POST /api/procesadores/{id}/ejecutar` — multipart (≤25 MB), devuelve el archivo procesado o un
  error tipificado (formato / tamaño / contenido). **Esta ruta pertenece al backend de Next.js**,
  que actúa como **proxy**: verifica la sesión y la asignación del usuario en SQL Server (403 si no
  corresponde, ADR 0007) y solo entonces reenvía el archivo al servicio FastAPI por red interna con
  el token de servicio (ADR 0006). El navegador nunca llama a FastAPI directamente.
- `POST /api/sugerencias`, `GET /api/sugerencias`, `PATCH /api/sugerencias/{id}/estado`,
  `POST /api/sugerencias/grupos`
- CRUD admin: `/api/enlaces`, `/api/procesadores`, `/api/usuarios/{id}/asignaciones`,
  `/api/admins` (alta/revocación de rol, con regla de mínimo 1 administrador)
- `GET /api/analitica?desde=&hasta=&comparar=` — agregados de uso, adopción, sugerencias y errores
- `GET /api/mis-recursos` — ya listado arriba; lo consume el dashboard del colaborador (ítem #8)
- `GET /api/enlaces/{id}/abrir` — **única ruta que no devuelve JSON**: autoriza la asignación, registra el
  `evento_uso` de tipo `apertura` y responde **302** hacia la URL del enlace

> **Nota sobre la ruta de apertura (ítem #8).** Es la excepción al contrato JSON de este ADR, y se documenta
> aquí para que no quede como precedente tácito. El motivo es que las dos alternativas fallan: registrar el
> evento con `await` y después abrir la pestaña pierde la activación transitoria del gesto y el bloqueador de
> ventanas emergentes la cancela, y un ancla directa a la URL externa no pasa por el backend, de modo que un
> acceso revocado seguiría abriendo. El 302 es el único camino donde el portal autoriza **antes** de que la
> navegación ocurra. La excepción se limita a este caso: una ruta `/api/*` que no devuelva JSON necesita una
> razón igual de concreta.
>
> **Límite conocido que esta ruta no resuelve.** Solo cubre el clic que sale del dashboard. Una vez que el
> colaborador conoce la URL externa —favorito, historial, memoria— esa navegación no pasa por el portal y no
> hay nada que bloquear. La promesa del ADR 0007 de que "cualquier intento de uso recibe 403" es exacta para
> `procesador`, cuya ejecución sí atraviesa el backend (ítem #10), y es inaplicable a un `enlace` externo.
> No es un defecto de implementación: el portal no es dueño del sistema al que apunta.

El contrato lo posee el propio portal (no hay clientes externos); los errores se devuelven como
JSON con código y mensaje en español apto para mostrarse en la UI (DESIGN.md: lenguaje claro sin
códigos técnicos).

## Alternativas consideradas

- **Server Actions / RPC del framework** — menos código y tipado de punta a punta, pero el
  contrato queda implícito y atado al framework, más difícil de probar con herramientas estándar
  (curl/Postman) y de documentar como entregable del proyecto final.
- **GraphQL** — esquema tipado y consultas flexibles, valioso con múltiples clientes; aquí hay un
  único cliente propio y la subida de archivos en GraphQL requiere extensiones multipart
  incómodas. Sobrecarga sin beneficio.

## Consecuencias

- Contrato explícito, probable con curl/Postman y documentable — útil como evidencia del proyecto
  y para depurar cada flujo por separado.
- Costo real: la capa de fetch del lado del cliente (llamadas, estados de carga, manejo de errores
  por ruta) se escribe y mantiene a mano, y el tipado entre cliente y servidor no es automático:
  un cambio de forma en una respuesta JSON solo se detecta en runtime si no se cuida.
- Toda ruta debe validar sesión y permisos en el servidor (no basta ocultar botones), en línea con
  los casos borde del PRD de acceso por URL directa.
