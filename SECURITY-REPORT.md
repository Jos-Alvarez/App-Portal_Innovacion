# Security Pass — Portal de Innovación Lima Expresa

Fecha: 2026-08-30
Commit revisado: `1e8a742`

**Alcance revisado**

| Capa | Material encontrado | Estado |
| --- | --- | --- |
| Producto / requisitos | `PRD.md` | Revisada |
| Arquitectura / diseño | `TECH-DESIGN.md`, `DESIGN.md`, `adrs/0001`–`0010` | Revisada |
| Specs / tareas | `BACKLOG.md`, `openspec/` | Revisada |
| Código | `app/`, `lib/`, `components/`, `auth.ts`, `proxy.ts`, `prisma/schema.prisma` | Revisada |
| Tests | 128 archivos `*.test.ts(x)` | Revisada |
| Configuración | `.env.example`, `.gitignore`, `next.config.ts`, `package.json` | Revisada |
| Dependencias | `package.json`, `pnpm-lock.yaml` | Revisada (inventario, sin auditoría de CVEs) |
| CI/CD | — | **Omitida: no existe pipeline en el repositorio** (el `README.md` lo declara pendiente) |
| Infraestructura / despliegue | — | **Omitida: no hay manifiestos, IaC ni configuración de servidor versionada** |

**Nota de transparencia**: este pase creó el directorio local `.codegraph/` para indexar el
repositorio. No está en `.gitignore` (ver SP-007). Ningún otro archivo del proyecto fue modificado.

---

## Resumen ejecutivo

El portal está en muy buen estado de seguridad a nivel de aplicación. El modelo de autorización es
la parte más sólida del proyecto: cada ruta y cada página se guardan a sí mismas, el rol y las
asignaciones se releen de SQL Server en cada request, y la sesión no transporta ningún permiso. No
se encontró ninguna ruta sin guard, ninguna consulta SQL construida por concatenación, ningún sink
de XSS alimentado por datos de usuario, ni ningún secreto versionado. Las clases clásicas de fallo
—IDOR, escalada de privilegios, open redirect, inyección en el `$filter` de Graph, inyección de
cabeceras en el correo— aparecen explícitamente contempladas y mitigadas en el código.

Los hallazgos reales están **fuera del código de aplicación**, en la frontera de despliegue y de
capacidad:

1. La plantilla versionada de conexión a base de datos desactiva la validación del certificado TLS
   (`trustServerCertificate=true`). Es el hallazgo más serio del pase.
2. El portal no emite ninguna cabecera de seguridad HTTP: sin CSP, sin protección de encuadre, sin
   HSTS. Las pantallas de administración incluyen acciones destructivas de un clic.
3. No hay ningún límite de tamaño de petición ni ningún límite de tasa en toda la aplicación. El
   proxy de procesadores retransmite bytes sin tope, y varias rutas disparan trabajo caro o
   llamadas a terceros por petición.

Ninguno de los tres es explotable por un anónimo: los tres requieren o bien una posición en la red
corporativa, o bien una sesión válida del dominio corporativo. Eso los mantiene por debajo de
CRITICAL, pero los tres son reales y los tres tienen remediación concreta.

---

## Fortalezas de seguridad

Esto es lo que **no** hay que tocar al remediar:

- **Autorización servidor-céntrica, sin caché entre peticiones** (`lib/authz/*`, ADR 0007). El JWT
  de sesión sólo identifica; `es_admin` y las asignaciones se releen de SQL Server en cada request y
  se deduplican únicamente dentro de un render (`React.cache`). Una revocación aplica en la
  siguiente petición, no en el siguiente login.
- **Cobertura completa de guards.** Las 20 rutas bajo `/api` (salvo el catch-all de Auth.js) y las
  10 páginas protegidas llaman a un guard antes de leer cuerpo o tocar Prisma, y todas exportan
  `dynamic = "force-dynamic"`. Las cuatro rutas de asignaciones delegan en
  `lib/asignaciones/handlers.ts`, que también guarda. `lib/authz/index.ts` documenta por qué un
  guard en `layout.tsx` no cuenta.
- **Union discriminada en la decisión de autorización** (`lib/authz/decisions.ts`). No se puede
  alcanzar `usuario` sin haber manejado la denegación: olvidar el chequeo es un error de tipos, no
  una fuga.
- **Sin SQL cruda en ninguna parte.** Cero usos de `$queryRaw`, `$executeRaw` o `Prisma.raw`. Todo
  pasa por el query builder de Prisma con `select` explícito y columnas mínimas.
- **Validación de entrada con Zod en el 100 % de los cuerpos y parámetros de ruta**, con claves
  desconocidas descartadas — por lo que `activo`, `id`, `autorId`, `estado` y `grupoId` no pueden
  preseleccionarse desde un cuerpo hecho a mano.
- **Allowlist de esquemas de URL, aplicada dos veces** (`lib/enlaces/schema.ts` +
  `app/api/enlaces/[id]/abrir/route.ts`). La dirección almacenada se revalida antes de redirigir,
  tratando la base de datos como entrada no confiable. Se redirige al valor normalizado, no a la
  columna cruda.
- **`callbackUrl` reducido a rutas del mismo sitio** (`toSafeCallbackUrl`), con `//host` y `/\host`
  rechazados explícitamente.
- **Fallo cerrado en las reglas de identidad.** `ALLOWED_EMAIL_DOMAIN` vacío no admite a nadie;
  `ADMIN_EMAIL` vacío no promueve a nadie; los subdominios se rechazan. La misma función que aplica
  el login aplica la promoción.
- **Invariante de "al menos 1 administrador" implementada correctamente**: cuenta *después* del
  update, dentro de la misma transacción, con `isolationLevel: "Serializable"` para cerrar la
  carrera de dos revocaciones simultáneas.
- **El directorio se consulta como aplicación, no con un token del administrador**, y el token no
  se cachea ni se almacena en ninguna cookie. Los literales OData se escapan (`'` → `''`).
- **El correo de notificación es texto plano por decisión explícita**, con CR/LF colapsados en el
  asunto: no hay superficie de inyección de HTML ni de cabeceras.
- **La URL de destino de un enlace nunca llega al navegador del colaborador**
  (`lib/mis-recursos/repository.ts` no la selecciona); el dashboard enlaza a la ruta del portal.
  `rel="noopener noreferrer"` en ambos anclajes externos.
- **Cabeceras de salida del proxy en allowlist**, con `Content-Disposition: attachment` forzado,
  `X-Content-Type-Options: nosniff` y `Cache-Control: no-store` — la salida de un procesador nunca
  se renderiza en el origen del portal.
- **Los errores hacia el navegador son un envelope fijo** (`{codigo, mensaje}`) sin números de error
  de SQL Server, mensajes de Prisma ni texto de Zod. Todas las razones de denegación colapsan en
  tres códigos, de modo que un 403 no describe la estructura interna.
- **Secretos correctamente gestionados**: `.env.*` ignorado salvo la plantilla, ningún secreto en
  git (`git ls-files` sólo devuelve `.env.example`), y los mensajes de error de token omiten
  deliberadamente el cuerpo de la respuesta de Entra ID.
- **Las decisiones de autorización están cubiertas por tests**: `lib/authz/*.test.ts`,
  `lib/asignaciones/handlers.test.ts` y las suites de ruta ejercitan 401/403, cuenta desactivada,
  recurso dado de baja y no-asignado.

---

## Findings

### HIGH

---

**ID**: SP-001
**Title**: La plantilla de conexión versionada desactiva la validación del certificado TLS de SQL Server
**Severity**: HIGH
**Confidence**: HIGH
**Category**: Criptografía / configuración insegura por defecto
**Affected artifact**: Configuración
**Location**: `.env.example:51` y `.env.example:57`

**Description**
Las dos cadenas de conexión de la plantilla versionada llevan `trustServerCertificate=true`. Ese
parámetro le indica al driver que cifre la conexión pero **acepte cualquier certificado**, sin
verificar cadena de confianza ni nombre de host. `encrypt=true` sin validación de certificado
protege contra un observador pasivo, pero no contra un atacante en ruta.

Es la plantilla que todo despliegue copia a su `.env.local`, así que el valor inseguro es el valor
por defecto de facto del proyecto.

**Evidence**
```
.env.example:51  DATABASE_URL="sqlserver://HOST:1433;database=<db>;user=<user>;password=<password>;encrypt=true;trustServerCertificate=true"
.env.example:57  SHADOW_DATABASE_URL="sqlserver://HOST:1433;database=<shadow_db>;user=<user>;password=<password>;encrypt=true;trustServerCertificate=true"
```
El `README.md:57` confirma que la instancia es **un servidor SQL corporativo compartido con otros
proyectos**, es decir, alcanzable desde la red corporativa y no dedicado a este portal.

**Attack scenario**
Un atacante con posición en ruta entre el host del portal y el servidor SQL (VLAN corporativa
comprometida, ARP/DNS spoofing, un salto de red mal segmentado) presenta un certificado propio. El
driver lo acepta sin objeción. A partir de ahí el atacante ve y modifica todo el tráfico: las
credenciales SQL del propio string de conexión, la tabla `usuario` completa (correos corporativos,
área, `es_admin`), el contenido de todas las sugerencias, y el historial de `evento_uso`. La
modificación es lo peor: puede devolver `es_admin = 1` para una cuenta cualquiera y el portal lo
creerá, porque ADR 0007 hace de esa columna la única fuente de verdad de autorización.

**Potential impact**
Compromiso total de la confidencialidad e integridad de los datos del portal, incluida la escalada
a administrador. Exposición de las credenciales de una base compartida con otros proyectos, lo que
extiende el daño más allá de este sistema.

**Existing mitigation**
`encrypt=true` mantiene el tráfico cifrado frente a un observador puramente pasivo. La base está en
red corporativa, no expuesta a internet. Ninguna de las dos cosas detiene a un atacante en ruta.

**Recommended remediation**
1. Cambiar el valor por defecto de la plantilla a `trustServerCertificate=false`.
2. Documentar en el mismo bloque de `.env.example` que el host requiere la CA corporativa instalada
   en el almacén de confianza del servidor, y que el `HOST` de la cadena debe coincidir con el CN/SAN
   del certificado del servidor SQL.
3. Si TI no puede emitir un certificado válido a corto plazo, mantener `true` **como excepción
   documentada con fecha de revisión**, no como valor por defecto silencioso — y registrarlo como
   riesgo aceptado (ver Gobernanza).

**Suggested verification**
Con `trustServerCertificate=false`, ejecutar `pnpm db:migrate:status`. Debe conectar sin error. Si
falla con un error de confianza de certificado, el problema es la CA del servidor, no la aplicación
— y ese es exactamente el hallazgo que este cambio saca a la luz.

**Required change type**: `CODE FIX`

---

### MEDIUM

---

**ID**: SP-002
**Title**: El portal no emite ninguna cabecera de seguridad HTTP
**Severity**: MEDIUM
**Confidence**: HIGH
**Category**: Configuración insegura / defensa en profundidad ausente
**Affected artifact**: Código (configuración de la aplicación)
**Location**: `next.config.ts:3-9`, `proxy.ts:30-50`

**Description**
`next.config.ts` no define `headers()`, el proxy de autenticación no añade ninguna cabecera a las
respuestas que deja pasar, y `app/layout.tsx` no aporta ninguna equivalente por `<meta>`. En
consecuencia el portal se sirve sin `Content-Security-Policy`, sin `X-Frame-Options` ni
`frame-ancestors`, sin `Strict-Transport-Security` y sin `Referrer-Policy`.

**Evidence**
```ts
// next.config.ts — la configuración completa
const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  agentRules: false,
};
```
`grep -rn "headers|Content-Security|X-Frame|Strict-Transport" next.config.ts proxy.ts app/layout.tsx`
no devuelve ninguna coincidencia.

**Attack scenario**
*Clickjacking sobre las pantallas de administración.* Un administrador autenticado visita una
página controlada por un atacante (enlace por correo, un sitio interno comprometido). Esa página
embebe `https://<portal>/admin/administradores` en un iframe transparente sobre un señuelo. Sin
`frame-ancestors`/`X-Frame-Options`, el navegador lo permite. Un clic del administrador cae sobre
el botón real de promoción o de revocación de rol. Las acciones de esas pantallas son de un solo
clic y no piden confirmación con contexto, y la misma técnica aplica a
`/admin/asignaciones/[usuarioId]`, donde los interruptores conceden acceso a recursos.

*Ausencia de CSP.* Si alguna vez aparece un XSS —hoy no se encontró ninguno— no habría ninguna
segunda barrera: sin CSP, un script inyectado puede exfiltrar a cualquier destino. La CSP es
precisamente el control que convierte un XSS en un incidente contenido.

**Potential impact**
Cambios de privilegio y de asignación inducidos sin consentimiento del administrador. Pérdida de la
capa de contención frente a inyección de scripts. Sin HSTS, una primera visita por `http://` es
degradable a texto plano.

**Existing mitigation**
El proxy exige sesión válida para toda ruta no pública, así que el atacante necesita que la víctima
esté autenticada — cosa que en un portal corporativo de uso diario es lo normal, no la excepción.
La cookie de sesión de Auth.js es `SameSite=Lax` por defecto (no hay override en `auth.ts`), lo que
sí bloquea el CSRF clásico sobre las rutas `/api` que mutan por POST/PATCH/DELETE. `Lax` no
protege contra clickjacking: el clic ocurre dentro del propio origen del portal.

**Recommended remediation**
Añadir `headers()` en `next.config.ts` aplicando a todas las rutas:
- `Content-Security-Policy` — requiere manejar el script inline de `app/layout.tsx:29`
  (`THEME_INIT_SCRIPT`), sea con un nonce por petición generado en `proxy.ts` o con el hash SHA-256
  del script, que es estático y por tanto hasheable sin cambiar el código.
- `X-Frame-Options: DENY` más `frame-ancestors 'none'` dentro de la CSP.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `X-Content-Type-Options: nosniff` global (hoy sólo lo pone la ruta de ejecución).

**Suggested verification**
Test de integración sobre la respuesta de `/` y de `/admin/administradores` afirmando la presencia
y el valor de cada cabecera. Comprobar manualmente que el toggle de tema sigue funcionando sin
error de CSP en consola — es la única pieza inline del proyecto y la que romperá si el nonce/hash
está mal.

**Required change type**: `CODE FIX`

---

**ID**: SP-003
**Title**: El proxy de ejecución retransmite el cuerpo de la petición sin ningún límite de tamaño
**Severity**: MEDIUM
**Confidence**: HIGH
**Category**: Agotamiento de recursos / denegación de servicio autenticada
**Affected artifact**: Código + Arquitectura (ADR 0006)
**Location**: `app/api/procesadores/[id]/ejecutar/route.ts:238-248`, `lib/procesadores/servicio.ts:151-176`

**Description**
La ruta de ejecución entrega `request.body` a `fetch` como stream y no inspecciona ni el
`Content-Length` ni el número de bytes que atraviesan. El comentario del handler lo declara
explícitamente —"IT DOES NOT VALIDATE THE FILES. Not the count, not the formats, not the sizes"— y
delega toda la aplicación de límites al servicio FastAPI, siguiendo ADR 0006.

El razonamiento de la decisión es correcto en lo suyo (evitar una segunda copia de la regla que
derive de la primera, y no materializar archivos en el heap de Node). Lo que la decisión no cubre
es que **el portal es el punto de ingreso**: los bytes atraviesan su proceso, su socket y su ancho
de banda antes de que el servicio pueda opinar sobre ellos, y la fila `procesador` con
`tamano_max` y `tamano_max_total` ya está leída en memoria en ese mismo handler.

**Evidence**
```ts
// app/api/procesadores/[id]/ejecutar/route.ts:238
const resultado = await ejecutarEnServicio({
  clave,
  cuerpo: request.body,      // ← sin ninguna comprobación de tamaño
  contentType,
  signal: AbortSignal.timeout(TIMEOUT_MS),   // 120_000 ms
})
```
`grep -rniE "rate.?limit|bodySizeLimit|maxDuration"` sobre `lib/`, `app/` y `next.config.ts` no
devuelve ninguna coincidencia: no hay límite de cuerpo en ninguna capa del repositorio.

**Attack scenario**
Un colaborador válido con una sola asignación de procesador abre N conexiones concurrentes a
`POST /api/procesadores/{id}/ejecutar` y envía en cada una un cuerpo multipart continuo y muy
grande. Cada petición mantiene abierta una conexión saliente hacia el servicio interno durante
hasta 120 segundos (`TIMEOUT_MS`), consume ancho de banda de subida y de salida, y ocupa una
invocación del proceso Node que también sirve todas las demás pantallas. El mismo efecto se produce
sin malicia: un usuario con una conexión lenta subiendo 250 MB legítimos (10 entradas × 25 MB, un
contrato perfectamente válido según `entradas_max`/`tamano_max`).

**Potential impact**
Degradación o caída del portal completo —incluidas las pantallas que nada tienen que ver con
procesadores— por parte de cualquier colaborador autenticado. Es un ataque desde dentro del dominio
corporativo, lo que acota el conjunto de atacantes pero no lo elimina.

**Existing mitigation**
El timeout de 120 s acota la duración de cada petición. El servicio FastAPI rechaza el contenido
que excede los límites de la fila, lo que corta la petición **una vez que el multipart ha llegado**
al servicio. La audiencia es corporativa y autenticada. No hay ninguna mitigación sobre el volumen
en el portal.

**Recommended remediation**
Decisión requerida (ver Gobernanza). Las opciones, con su coste:
1. **En el reverse proxy / ingress delante del portal** (`client_max_body_size` en nginx, límite
   equivalente en IIS/ARR). No toca código, no duplica ninguna regla de negocio y es el lugar
   natural para un tope de transporte. Es la opción recomendada.
2. **Un tope duro en el handler**, comparando `Content-Length` contra
   `entradas_max × tamano_max` (o `tamano_max_total`) de la fila que ya está leída, rechazando por
   encima. No es "una segunda copia de la regla" que ADR 0006 teme, porque no valida formatos ni
   cardinalidad: es un tope de transporte derivado del contrato, y falla en la dirección segura
   (rechaza sólo lo que el servicio también rechazaría).
3. Aceptar el riesgo explícitamente, documentándolo en ADR 0006.

**Suggested verification**
Si se elige (2): test de ruta que envíe un `Content-Length` por encima del contrato de la fila y
afirme un 413/400 sin que se haya invocado `ejecutarEnServicio`. Si se elige (1): prueba manual
contra el entorno desplegado con un cuerpo por encima del tope, esperando el rechazo del proxy.

**Required change type**: `DESIGN / ADR CHANGE`

---

**ID**: SP-004
**Title**: No existe limitación de tasa en ninguna ruta, incluidas las que disparan trabajo caro o llamadas a terceros
**Severity**: MEDIUM
**Confidence**: HIGH
**Category**: Agotamiento de recursos / abuso de lógica de negocio
**Affected artifact**: Código + Arquitectura
**Location**: Toda la superficie `app/api/**`; especialmente `app/api/admins/directorio/route.ts:45`, `app/api/sugerencias/route.ts:98`, `app/api/procesadores/[id]/ejecutar/route.ts:187`

**Description**
Ninguna ruta aplica limitación de tasa, y no hay ningún middleware, dependencia ni configuración
que la provea. Tres rutas hacen que eso importe más que en el resto:

- `GET /api/admins/directorio` — cada búsqueda ejecuta **dos** llamadas salientes: una petición de
  token de client-credentials a Entra ID y una consulta a Microsoft Graph. El token no se cachea
  por decisión explícita (`lib/admins/directorio.ts:26-30`).
- `POST /api/sugerencias` — cada alta dispara un correo saliente vía la API de correo.
- `POST /api/procesadores/{id}/ejecutar` — cada ejecución ocupa un worker del servicio durante hasta
  2 minutos.

**Evidence**
`grep -rniE "rate.?limit|throttl"` sobre `lib/` y `app/` sólo encuentra el
`focusThrottleInterval` de SWR en `app/(portal)/mis-recursos-client.ts:64`, que es una preferencia
de revalidación de cliente y no un control de servidor.

```ts
// lib/admins/directorio.ts:196 — un token nuevo por cada búsqueda
const token = await pedirToken(env, fetchImpl);
```

**Attack scenario**
Un administrador (o un script con su sesión) itera términos de búsqueda de dos letras contra
`/api/admins/directorio`. Cada uno consume una petición de token más una consulta de Graph contra
la cuota del inquilino. Entra ID y Graph responden con `429` bajo throttling, y por diseño
`busqueda.ts` traduce *cualquier* fallo del directorio en la degradación de ADR 0009 — de modo que
el síntoma no es un error, sino que **todas** las búsquedas del portal pasan silenciosamente a
mostrar sólo a quienes ya iniciaron sesión. Un administrador que no lea el `origen` de la respuesta
concluirá que la persona que busca no existe en la empresa.

En paralelo, un colaborador puede publicar sugerencias en bucle, generando un correo saliente por
cada una hacia el buzón del Área de Innovación y consumiendo cuota de la API de correo.

**Potential impact**
Degradación funcional silenciosa de la búsqueda de directorio (con riesgo de decisión equivocada
del administrador), consumo de cuota de un servicio corporativo compartido, e inundación del buzón
del Área de Innovación.

**Existing mitigation**
Todas las rutas exigen sesión válida del dominio corporativo, y `/api/admins/directorio` exige
además rol de administrador — el conjunto de atacantes es pequeño y nominalmente identificable. La
búsqueda exige un término de 2 caracteres mínimo (`BUSQUEDA_MIN`), lo que evita la llamada
accidental de una sola tecla pero no un bucle deliberado. `RESULTADOS_MAX = 20` acota el tamaño de
cada respuesta, no su frecuencia.

**Recommended remediation**
Decisión requerida sobre *dónde* vive el control (ver Gobernanza). Recomendación: aplicar la
limitación en el reverse proxy delante del portal para el grueso del tráfico, y considerar por
separado una caché del token de aplicación de Graph con TTL corto en `lib/admins/directorio.ts` —
que reduce en un 50 % las llamadas salientes de cada búsqueda y contradice sólo parcialmente el
razonamiento actual (el argumento contra cachear es la rotación del secreto, que un TTL de minutos
resuelve).

Independientemente de dónde se aplique el límite: hacer que la pantalla de administradores muestre
de forma visible el `origen: "portal"` cuando la búsqueda esté degradada. El dato ya viaja hasta el
cliente; lo que falta es que sea imposible de pasar por alto.

**Suggested verification**
Prueba manual: N búsquedas consecutivas por encima del umbral elegido deben responder 429 en lugar
de alcanzar Graph. Test de componente afirmando que la pantalla renderiza el aviso de degradación
cuando `origen === "portal"`.

**Required change type**: `DESIGN / ADR CHANGE`

---

### LOW

---

**ID**: SP-005
**Title**: La invariante "al menos 1 administrador" se satisface con una cuenta desactivada, que no puede iniciar sesión
**Severity**: LOW
**Confidence**: MEDIUM
**Category**: Control de acceso / disponibilidad administrativa
**Affected artifact**: Código
**Location**: `lib/admins/repository.ts:362`

**Description**
La revocación de rol cuenta los administradores restantes con `where: { esAdmin: true }`, sin
filtrar por `activo`. Pero `authorizeAccount` (`lib/authz/decisions.ts:104`) deniega toda petición
de una cuenta con `activo === false`. Por tanto un administrador desactivado satisface la
invariante mientras es incapaz de ejercer el rol: el sistema puede quedar con "1 administrador"
según su propia cuenta y con **cero** administradores capaces de entrar.

El código contempla que esas filas existen: `listarAdministradores` documenta que muestra
administradores desactivados a propósito, y `promoverAAdministrador` rechaza promover a una cuenta
dada de baja (`RolRechazado("dado_de_baja")`).

**Evidence**
```ts
// lib/admins/repository.ts:362 — dentro de la transacción de revocación
const restantes = await tx.usuario.count({ where: { esAdmin: true } });
if (restantes < 1) {
  throw new RolRechazado("ultimo_admin");
}
```
frente a:
```ts
// lib/authz/decisions.ts:104
if (!row.activo) {
  return deny("inactive-account");
}
```

**Attack scenario**
No es un escenario de atacante sino de bloqueo operativo. Quedan dos administradores, A (activo) y
B (desactivado por TI directamente en base de datos). A se revoca a sí mismo el rol —o revoca a
otro— y la transacción cuenta 1 restante (B), acepta y confirma. A partir de ese momento nadie
puede acceder a `/admin/administradores`, porque el único titular del rol no supera el guard de
cuenta activa. La recuperación exige intervención directa en SQL Server, o configurar `ADMIN_EMAIL`
y reiniciar.

**Potential impact**
Bloqueo administrativo total del portal, recuperable sólo fuera de la aplicación. Sin impacto sobre
confidencialidad ni integridad.

**Existing mitigation**
El portal **no expone ninguna vía para desactivar un usuario**: `grep -rn "activo: false"` sobre
`lib/` y `app/` sólo encuentra la baja lógica de `enlace` y de `procesador`, nunca de `usuario`. La
situación requiere por tanto una desactivación hecha directamente en base de datos, lo que reduce
mucho su probabilidad — y es la razón de que la confianza sea MEDIUM y no HIGH. El pin de
`ADMIN_EMAIL` ofrece además una vía de recuperación si esa variable está configurada, aunque
`.env.example:107` la deja comentada.

**Recommended remediation**
Cambiar la cuenta a `where: { esAdmin: true, activo: true }`. El mensaje de `ultimo_admin` sigue
siendo correcto tal cual. El cambio es de una línea y no altera ninguna otra semántica de la
transacción.

**Suggested verification**
Test unitario sobre `revocarAdministrador` con un doble de Prisma que devuelva un administrador
activo y uno desactivado: la revocación del activo debe lanzar `RolRechazado("ultimo_admin")` y
revertir. `lib/admins/repository.test.ts` ya tiene la estructura para hospedarlo.

**Required change type**: `CODE FIX`

---

**ID**: SP-006
**Title**: `GET /api/enlaces/{id}/abrir` escribe estado y es alcanzable por navegación cross-site
**Severity**: LOW
**Confidence**: HIGH
**Category**: CSRF sobre método seguro / integridad de datos analíticos
**Affected artifact**: Código
**Location**: `app/api/enlaces/[id]/abrir/route.ts:85-187`

**Description**
La ruta responde a `GET` y, como precondición del redirect, escribe una fila en `evento_uso`. La
cookie de sesión de Auth.js es `SameSite=Lax`, que **sí** se envía en navegaciones de nivel
superior de tipo GET originadas en otro sitio. En consecuencia, un tercero puede provocar la
escritura del evento en nombre de un colaborador autenticado.

Es el único endpoint del portal en esa situación: todas las demás mutaciones usan POST/PATCH/DELETE,
donde `SameSite=Lax` sí bloquea la cookie.

**Evidence**
```ts
// app/api/enlaces/[id]/abrir/route.ts:178
await registrarEvento(prisma, {
  usuarioId: acceso.usuario.id,
  tipoRecurso: "enlace",
  idRecurso: id.data,
  tipoEvento: "apertura",
});
```
No hay override de cookies en `auth.ts` (`grep -n "cookies:|useSecureCookies"` sin resultados), por
lo que rige el `sameSite: "lax"` por defecto de Auth.js v5.

**Attack scenario**
Una página de terceros incluye `<img src="https://<portal>/api/enlaces/7/abrir">` o un
`window.open` hacia esa ruta. El navegador del colaborador adjunta la cookie de sesión, el guard
pasa legítimamente (el colaborador *sí* tiene la asignación) y se registra una apertura que nunca
ocurrió. Repetido, infla el ranking de uso de ese enlace.

**Potential impact**
Contaminación de la analítica de adopción. El comentario del propio handler (líneas 154-176)
explica que un administrador **actúa** sobre esos números —revocando o retirando recursos poco
usados—, así que el dato falseado tiene consecuencia operativa. No hay impacto sobre
confidencialidad, ni escritura posible sobre recursos no asignados: el guard sigue aplicando.

**Existing mitigation**
El guard limita la escritura a enlaces que ese colaborador ya tiene asignados y activos, así que el
atacante no puede fabricar eventos arbitrarios: sólo inflar los de recursos que la víctima ya
podría abrir. `Cache-Control: no-store` evita que un 302 cacheado salte el guard.

**Recommended remediation**
Rechazar la petición cuando `Sec-Fetch-Site` sea `cross-site` (o cuando `Sec-Fetch-Dest` no sea
`document`), antes de registrar el evento. Es una comprobación de dos líneas que no cambia la forma
de la ruta, y los navegadores que no envían esas cabeceras se pueden tratar como same-site para no
romper clientes antiguos — la degradación deja el comportamiento actual, no uno peor.

Alternativa igualmente válida: aceptar el riesgo, dado que el impacto se limita a ruido analítico
acotado a recursos ya asignados.

**Suggested verification**
Test de ruta con `Sec-Fetch-Site: cross-site` afirmando que no se llama a `registrarEvento` y que
no se emite redirect; y el caso `same-origin` afirmando el comportamiento actual intacto.
`app/api/enlaces/[id]/abrir/route.test.ts` ya cubre el resto de la ruta.

**Required change type**: `CODE FIX`

---

### INFO

---

**ID**: SP-007
**Title**: `.codegraph/` no está en `.gitignore`
**Severity**: INFO
**Confidence**: HIGH
**Category**: Higiene del repositorio
**Affected artifact**: Configuración
**Location**: `.gitignore`

**Description**
Este pase de seguridad creó `T:\App_Portal\.codegraph\`, un índice local del código. El
`.gitignore` no lo contempla, por lo que aparecerá como no rastreado y puede acabar versionado por
accidente. Contiene datos derivados del código fuente —no secretos— y describe la máquina que lo
generó, exactamente el mismo perfil que `.atl/`, que sí está ignorado y documentado como tal en el
propio `.gitignore`.

**Evidence**
`.gitignore` ignora `.atl/` con la nota "Cache de herramientas locales. Se regenera sola y describe
la maquina de quien la genero". No existe entrada equivalente para `.codegraph/`.

**Attack scenario**
Ninguno directo. Un índice versionado produce conflictos sin significado y expone la estructura de
rutas locales de quien lo generó.

**Potential impact**
Ruido en el repositorio. Sin impacto de seguridad material.

**Existing mitigation**
Ninguna.

**Recommended remediation**
Añadir `.codegraph/` junto a `.atl/`, bajo la misma nota. Alternativamente, borrar el directorio si
no se va a usar la herramienta.

**Suggested verification**
`git status --porcelain` no debe listar `.codegraph/`.

**Required change type**: `CODE FIX`

---

## Prioridad

El orden recomendado no coincide con la severidad pura, porque SP-002 y SP-003 comparten el mismo
punto de aplicación (la capa de despliegue) y conviene tratarlos en una sola conversación con TI:

1. **SP-001 — TLS de base de datos.** Es el único hallazgo cuya explotación compromete la
   integridad de la fuente de verdad de autorización. Además, el arreglo puede revelar que falta
   una CA en el servidor, y eso hay que descubrirlo antes de una fecha de entrega, no después.
2. **SP-002 — cabeceras de seguridad.** Cambio autocontenido en `next.config.ts`, sin dependencias
   de TI salvo HSTS. Cierra el vector de clickjacking sobre las pantallas de privilegios.
3. **SP-003 y SP-004 — límites de tamaño y de tasa.** Deben decidirse juntos: si la respuesta es
   "en el reverse proxy", los dos se resuelven en la misma configuración y ninguno toca el código.
   Requieren decisión previa (ver Gobernanza).
4. **SP-005 — invariante de administradores.** Una línea, con test. Bajo riesgo hoy porque no hay
   vía en la aplicación para desactivar usuarios; conviene arreglarlo **antes** de que alguien
   añada esa pantalla, momento en que el hallazgo sube de severidad sin previo aviso.
5. **SP-006 — GET que escribe estado.** Sólo si se decide no aceptar el riesgo.
6. **SP-007 — `.gitignore`.** Higiene, en cualquier momento.

---

## Gobernanza / Decisión requerida

Tres hallazgos no pueden resolverse sin una decisión humana. Este pase no tiene autoridad para
tomarlas y no lo ha hecho.

- **SP-003 — límite de tamaño de petición en el proxy de ejecución** (`DESIGN / ADR CHANGE`).
  ADR 0006 decidió deliberadamente que el portal no valide nada sobre los archivos, y el
  razonamiento —no duplicar una regla de negocio que derivaría de la del servicio— es sólido. Lo
  que este hallazgo señala es que un **tope de transporte** no es la misma cosa que esa regla de
  negocio, y que el portal es el punto de ingreso de los bytes. Decidir si el tope va en el reverse
  proxy, en el handler, o si el riesgo se acepta, es una decisión de arquitectura que corresponde
  al equipo. Si se opta por el handler, ADR 0006 debe actualizarse para distinguir explícitamente
  entre validación de contenido (servicio) y tope de transporte (portal).

- **SP-004 — limitación de tasa** (`DESIGN / ADR CHANGE`). Ningún ADR aborda hoy la limitación de
  tasa, y la decisión tiene dos partes que no son técnicamente equivalentes: dónde vive el control
  (aplicación frente a infraestructura) y si se introduce una caché del token de aplicación de
  Graph, lo que matiza —sin invalidar— el razonamiento explícito de `lib/admins/directorio.ts`
  contra cachearlo. Ambas son decisiones del equipo, no del pase.

- **SP-001 — excepción de certificado, sólo si TI no puede emitir uno válido** (`ACCEPT RISK`, y
  únicamente en ese caso). La remediación por defecto es un `CODE FIX` y así está triada. Pero si
  resulta que el servidor SQL corporativo compartido no dispone de un certificado con CA de
  confianza y TI no puede proveerlo a corto plazo, mantener `trustServerCertificate=true` pasa a
  ser una aceptación consciente de riesgo que debe registrarse con responsable y fecha de revisión
  — no dejarse como el valor por defecto silencioso de la plantilla, que es la situación actual.

Los demás hallazgos (SP-002, SP-005, SP-006, SP-007) son `CODE FIX` y no requieren decisión de
producto ni de arquitectura.
