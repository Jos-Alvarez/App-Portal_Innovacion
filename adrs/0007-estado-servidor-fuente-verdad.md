# ADR 0007: Servidor como única fuente de verdad de permisos; UI con cache revalidable

## Estado

Aceptado

## Contexto

El PRD exige que al revocar un acceso el cambio aplique de inmediato en la sesión activa del
usuario, sin esperar un nuevo login, y que el acceso por URL directa a un recurso no asignado se
bloquee (no solo se oculte del menú). El DESIGN.md define la pantalla 403 con la indicación
"aplica de inmediato al revocar". Hay que decidir dónde vive la verdad sobre permisos y cómo la
UI se mantiene consistente con ella.

## Decisión

Los permisos **nunca se cachean en el token de sesión ni en el cliente**: cada llamada a la API
del portal resuelve el usuario desde la sesión y consulta sus asignaciones en la base de datos en
ese momento. Sin fila de asignación → 403 inmediato con la pantalla de sin-permiso del DESIGN.md.
La sesión (cookie de Auth.js) solo identifica al usuario; también el rol de administrador se
verifica contra BD en cada request.

**La autorización por usuario ocurre exclusivamente en el backend de Next.js.** El backend del
portal es el único que lee la cookie de sesión de Auth.js y el único que consulta la base de datos
para resolver permisos y rol. El servicio de procesadores (FastAPI, ADR 0006) **no** lee la sesión
del usuario final ni consulta la BD para autorizar: se comporta como un backend interno de
confianza al que Next.js solo llega **después** de haber verificado la asignación del usuario. La
llamada portal → FastAPI se autentica de backend a backend con un **token de servicio seguro**
emitido por Next.js (identifica al portal, no al colaborador); FastAPI valida ese token y confía en
que la autorización por usuario ya la resolvió el portal. Así la verdad de permisos vive en un solo
lugar y FastAPI queda aislado del mecanismo de sesión. El enrutamiento proxy que hace posible esto
se detalla en ADR 0006 y ADR 0003.

En la UI, los datos se manejan con un cache revalidable (SWR o React Query): revalidación al
recuperar el foco y en intervalos, de modo que un recurso revocado desaparece del dashboard en la
siguiente interacción y cualquier intento de uso recibe el 403.

**Protección CSRF.** Como la sesión se identifica con una cookie (Auth.js), la protección contra
CSRF se **delega a Auth.js**: la cookie de sesión se emite con `SameSite=Lax` (el navegador no la
adjunta en peticiones cross-site que muten estado) y Auth.js aporta sus **tokens CSRF integrados**
para los endpoints de mutación (`POST`/`PATCH`/`DELETE` de sugerencias, asignaciones, admins,
catálogo). No se implementa un mecanismo CSRF propio; se usa el del framework de autenticación.

## Alternativas consideradas

- **Permisos dentro del token de sesión con expiración corta** — ahorra la consulta de permisos
  por request, pero la revocación recién surte efecto al refrescar el token (ventana de minutos),
  contradiciendo el "inmediato" que el PRD pide explícitamente.
- **Push en tiempo real (WebSocket/SSE)** — además de validar en servidor, empujaría la
  revocación al navegador en el instante; UX máxima pero exige conexiones persistentes para un
  evento rarísimo. Complejidad desproporcionada; la validación por request ya cumple el criterio
  del PRD.

## Consecuencias

- La revocación (de accesos y del rol admin) es efectiva en la request siguiente al cambio, sin
  ventanas de cache; el bloqueo por URL directa queda cubierto por la misma verificación.
- Costo real: una consulta de permisos adicional en cada request autenticada; irrelevante al
  volumen esperado, pero es el precio de la garantía de inmediatez.
- El recurso revocado puede seguir visible en pantalla hasta la siguiente revalidación de la UI
  (segundos); el PRD se cumple porque cualquier intento de uso ya recibe 403 — la vista puede ir
  levemente detrás de la verdad, la autorización nunca.
