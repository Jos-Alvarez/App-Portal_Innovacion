# Revisión Adversarial — TECH-DESIGN.md y ADRs

**Proyecto:** Portal de Innovación — Lima Expresa
**Fecha:** 2026-08-02
**Documentos revisados:** `TECH-DESIGN.md`, `adrs/0001`–`adrs/0010`, `PRD.md`, `DESIGN.md` (todos leídos en su totalidad).
**Condición de la revisión:** ejecutada en conversación nueva (post `/clear`) y sin haber producido este diseño — la condición más fuerte para una revisión adversarial. PRD y DESIGN estaban disponibles y se usaron para el cruce entre documentos.

Se desafió cada ADR. Varios resistieron el escrutinio y se indican explícitamente al final. Los hallazgos van ordenados del más severo al menos severo.

---

## 🔴 Crítico

### C1 — Quién ejecuta y quién autoriza `POST /api/procesadores/{id}/ejecutar` es contradictorio entre ADR 0003, 0006 y 0007

> **✅ RESUELTO (2026-08-02).** Se adoptó el **Modelo Proxy (Navegador → Portal Next.js → FastAPI)**.
> La autorización por usuario ocurre exclusivamente en el backend de Next.js, que verifica sesión y
> asignación en SQL Server (403 si falla) y solo entonces reenvía el archivo a FastAPI por red
> interna con un token de servicio; FastAPI no lee la cookie de sesión ni consulta permisos.
> Cambios aplicados en `adrs/0007`, `adrs/0006`, `adrs/0003` y `TECH-DESIGN.md` (nueva subsección
> "Flujo de ejecución de un procesador (modelo proxy)" + nota técnica que acepta el "doble salto"
> de red). El hallazgo abajo se conserva como registro del problema original.

Tres documentos dicen cosas incompatibles sobre el endpoint más sensible del sistema (ejecutar código sobre archivos subidos, restringido por asignación individual):

- **ADR 0003** lo lista entre las "Rutas principales" de la *"API REST JSON interna bajo `/api/*`, consumida exclusivamente por la UI del portal"* → el endpoint es del **portal**.
- **ADR 0006** dice literalmente que esa ruta *"pertenece al servicio independiente de FastAPI, no al frontend"* → el endpoint es del **servicio**.
- **ADR 0007** afirma que *"cada llamada a la API (portal y servicio de procesadores) resuelve el usuario desde la sesión y consulta sus asignaciones"* → el **servicio FastAPI verifica el permiso del usuario final**.

Pero el servicio FastAPI **no tiene la sesión**: la sesión es una cookie de Auth.js que vive en el portal (ADR 0004/0009), y ADR 0004 dice que el portal se autentica ante FastAPI con un **token de servicio**, que identifica al *portal*, no al *colaborador*. Entonces FastAPI no puede "resolver el usuario desde la sesión" ni comprobar su `asignacion_procesador` como exige 0007.

Quedan dos arquitecturas posibles y ninguna está decidida:

- **Navegador → portal → (proxy) → FastAPI:** el portal hace la verificación de asignación y reenvía; entonces 0007 es falso para el servicio (el servicio *no* verifica al usuario, confía en el portal). Además el archivo de 25 MB se sube dos veces (navegador→portal→servicio), duplicando memoria y latencia — relevante para el timeout de 2 min.
- **Navegador → FastAPI directo:** entonces "API interna solo consumida por la UI del portal" (0003) no aplica, hace falta CORS, y el token de servicio no sirve para autenticar al usuario final; habría que validar el token de Entra en FastAPI, cosa que ningún ADR contempla.

**Por qué importa:** es el límite de seguridad de toda la función de procesamiento. El criterio de aceptación "acceso por URL directa a un procesador no asignado → 403 verificado en servidor" (TDD línea 121) no se puede cumplir de forma definida mientras no se resuelva *dónde* y *con qué identidad* se verifica la asignación. El TDD ya marca "el token de servicio no está diseñado" como riesgo abierto, pero el problema real no es un detalle pendiente: es una **contradicción entre ADRs sobre dónde ocurre la autorización por usuario**, y hay que resolverla antes de la primera spec, no dentro de ella.

---

## 🟠 Advertencia

### A1 — Sin aislamiento de memoria ni modelo de concurrencia para la ejecución de procesadores (ADR 0001 / 0006)

> **✅ RESUELTO (2026-08-02).** Dos medidas complementarias: (1) **validación temprana del tamaño
> descomprimido** (ADR 0006) — antes de pasar el archivo a pandas/openpyxl se inspeccionan los
> metadatos del ZIP (`.xlsx`/`.docx` tratados como ZIP) y se aborta con error controlado si el
> tamaño real excede el límite seguro en RAM; (2) **política de concurrencia y memoria** (ADR 0001 +
> `TECH-DESIGN.md`) — workers fijos y limitados y límite estricto de RAM por contenedor/instancia,
> de modo que un archivo anómalo mate a un worker aislado sin tumbar el servicio. El hallazgo abajo
> se conserva como registro del problema original.

ADR 0001 descartó la opción "monolito + workers con cola" por sobredimensionada y la reemplazó por un **FastAPI síncrono**, pero no puso nada en su lugar para dos modos de fallo reales:

- **Memoria:** un `.xlsx` de 25 MB puede descomprimirse a varios GB (zip bomb, o simplemente un Excel enorme y legítimo — el corazón del PRD es procesar Excel). `pandas`/`openpyxl` lo cargan entero en memoria; el timeout de 2 minutos **no acota la memoria**. Un solo archivo puede tumbar por OOM el proceso FastAPI compartido → caen *todos* los procesadores para *todos* los usuarios.
- **Concurrencia:** el procesamiento es CPU-bound. Con FastAPI síncrono, dos ejecuciones pesadas simultáneas bloquean workers; la tercera espera o entra en timeout en cascada. El ADR no fija número de workers ni política de concurrencia.

**Por qué importa:** es la principal justificación de separar el servicio ("aislar la carga", ADR 0001 línea 51), pero el aislamiento prometido no existe si un archivo o dos usuarios simultáneos derriban el servicio. El criterio "sin caída del servicio" (TDD 119) queda expuesto. Necesita al menos: límite de memoria por ejecución, límite de concurrencia y validación temprana del tamaño *descomprimido*, no solo del tamaño del archivo.

### A2 — El modelo de datos no modela el estado del chequeo de enlaces (ADR 0002 vs ADR 0008)

> **✅ RESUELTO (2026-08-02).** Resuelto **por eliminación de la funcionalidad**, no por
> modelado. En una simplificación posterior de la arquitectura se **rechazó el ADR 0008** y se quitó
> el chequeo periódico de enlaces: el portal ya no verifica en background el estado de los enlaces
> (el PRD lo permite explícitamente). Por eso los campos `estado_chequeo` y `contador_fallos`
> **se eliminaron** de la tabla `enlace` en ADR 0002 y `TECH-DESIGN.md`. Al no existir la
> funcionalidad, desaparece el hueco de modelo que señalaba este hallazgo.
>
> _(Nota: una primera resolución sí agregó esos campos con la regla de "3 fallos consecutivos";
> quedó superada al rechazar el ADR 0008.)_ El hallazgo abajo se conserva como registro del problema
> original.

ADR 0008 depende de dos datos persistidos: un **estado por enlace** (vivo/caído) y un **contador de fallos consecutivos** (la regla "caído tras 3 chequeos consecutivos", rehabilitación al volver a responder). Pero el modelo autoritativo (ADR 0002, línea 29) define `enlace` como `(id, nombre, descripcion, url, tipo, activo)` — **sin ningún campo de chequeo**. El TDD (línea 70) menciona `estado_chequeo` pero contradice a su propio ADR y **tampoco modela el contador** de fallos consecutivos.

**Por qué importa:** sin un contador persistido no se puede implementar "3 consecutivos" (un job sin estado no distingue 1 fallo de 3), ni el criterio "no marcar caída por 401/403" ni la rehabilitación automática (TDD 132-134). Es una funcionalidad comprometida en criterios de aceptación cuyo soporte de datos no está en el modelo.

### A3 — Dos lenguajes escriben la misma BD, pero solo se decidió el ORM de Node (ADR 0005)

> **✅ RESUELTO (2026-08-02).** ADR 0005 fija a **Next.js/Prisma como dueño único y absoluto del
> esquema** y único autorizado a migrar. El servicio FastAPI accede en modo **"solo lectura
> estructural"**: sus modelos Python son un espejo del esquema dictado por el portal y tienen
> prohibido crear/alterar tablas o migrar (reforzado, cuando sea posible, con un usuario de BD sin
> permisos DDL). Así la coordinación de la BD compartida pasa a una sola dirección y un desajuste
> solo causa errores de lectura en el servicio, nunca corrupción de estructura. Reflejado también en
> el riesgo de "BD compartida" del `TECH-DESIGN.md`. El hallazgo abajo se conserva como registro.

ADR 0005 decide "un ORM con soporte oficial (Prisma o Drizzle)… **desde Next.js**". Pero el servicio FastAPI también accede a la misma BD (ADR 0001: BD compartida; ADR 0006: "resuelve la fila en BD… registra el `evento_uso`"). Es decir, el esquema tiene **dos capas de acceso en dos lenguajes** (Prisma/Drizzle en TS + SQLAlchemy/lo-que-sea en Python), que una sola persona debe mantener sincronizadas mano a mano.

**Por qué importa:** el riesgo de la BD compartida que el TDD reconoce ("coordinar migraciones") es en realidad mayor de lo escrito: no es solo coordinar migraciones, es **dos mapeos independientes del mismo esquema** que pueden derivar (tipos, nombres, nullability) y solo fallan en runtime. ADR 0005 debería decidir explícitamente cómo accede Python a la BD y quién es el dueño del esquema/migraciones (el TDD dice "propiedad del portal", pero entonces el modelo de datos de Python es un espejo de solo-lectura que igual hay que versionar).

### A4 — La trazabilidad de sugerencias es solo de estado actual; el PRD pide historial (ADR 0002)

> **✅ RESUELTO (2026-08-02).** Se agregó la tabla obligatoria **`historial_sugerencia`**
> (`sugerencia_id`, `estado_anterior`, `estado_nuevo`, `cambiado_por` = admin que hizo el cambio,
> `fecha_cambio`) en ADR 0002 y `TECH-DESIGN.md`. Cada transición escribe un asiento **inmutable**
> (un registro por cambio) en lugar de sobrescribir el estado, garantizando rendición de cuentas
> real (quién cambió qué y cuándo) y el recorrido completo del embudo. `sugerencia.estado` queda
> como valor actual y un nuevo criterio de aceptación exige el asiento en cada cambio. El hallazgo
> abajo se conserva como registro.

El PRD exige "cambiar su estado… **con trazabilidad visible para todos**" (líneas 71-72) y el flujo `pendiente → en revisión → aprobada/rechazada/implementada`. Pero `sugerencia` (ADR 0002) guarda solo `estado` actual + "fechas de creación y cambio de estado" (última). No hay tabla de transiciones ni campo `cambiado_por`.

**Por qué importa:** con un solo `estado` + una sola fecha no se puede reconstruir el recorrido (cuándo pasó por "en revisión", quién la aprobó). Si "trazabilidad" significa el embudo y la rendición de cuentas del admin que actuó, el modelo no puede responderlo. Además la analítica "sugerencias por estado" solo ve una foto, no el flujo. Falta decidir si se registra historial de transiciones (una tabla `sugerencia_transicion` o similar) y el admin que ejecutó cada cambio.

### A5 — El host del scheduler y el supuesto de servidor de larga vida no están fijados, y chocan responsabilidades (ADR 0008)

> **✅ RESUELTO (2026-08-02).** Resuelto **por diseño**: se rechazó el ADR 0008 y se eliminó **toda
> infraestructura de jobs en segundo plano**. Los correos se envían best-effort (si fallan, se
> ignora silenciosamente; la sugerencia ya está en BD y visible en el panel del admin) y los enlaces
> no se verifican periódicamente. Al no existir ningún job programado, desaparecen el conflicto de
> responsabilidad (dónde corre el sweeper, quién tiene la credencial de correo) y la dependencia
> oculta de un proceso de larga vida / no-serverless. Cambios en `PRD.md`, `adrs/0008` (Rechazado),
> `adrs/0002` y `TECH-DESIGN.md`. El hallazgo abajo se conserva como registro del problema original.

ADR 0008 y el TDD dejan el host de los jobs "por definir", pero hay dos problemas más concretos que "elegir cron":

- **Conflicto de responsabilidad:** el correo se consume "desde el portal" (ADR 0001), pero el job de reintento podría vivir en FastAPI (TDD 205-207). Si el sweeper de outbox corre en FastAPI, entonces FastAPI necesita las credenciales de la API de correo y lee `correo_pendiente` — cruzando la frontera que ADR 0001 trazó. Nadie decidió dónde corre el outbox ni quién tiene la credencial de correo.
- **Supuesto oculto de despliegue:** varios diseños asumen un proceso de larga vida (sweeper cada ~1 min, chequeo cada 15-30 min). Si el portal Next.js se despliega serverless (lo más común), **no hay jobs de fondo en absoluto** y ese supuesto se rompe en silencio. El modelo de despliegue nunca se fija, y de él dependen calladamente ADR 0008 entero y el "envío inmediato tras la transacción".

**Por qué importa:** el criterio "correo en <1 min" y "enlace caído detectado sin intervención" dependen por completo de una pieza (scheduler + su host + sus credenciales) que hoy no tiene dueño ni lugar.

---

## 🟡 Sugerencia

### S1 — API basada en cookie de sesión sin postura de CSRF declarada (ADR 0003/0007)

> **✅ RESUELTO (2026-08-02).** ADR 0007 declara la postura CSRF: **delegada a Auth.js** mediante
> cookie de sesión `SameSite=Lax` y los **tokens CSRF integrados** del framework para los endpoints
> de mutación (`POST`/`PATCH`/`DELETE`). No se implementa un mecanismo propio. El hallazgo abajo se
> conserva como registro.

El portal autentica con cookie de Auth.js (ADR 0007) y expone endpoints que mutan estado (`POST/PATCH` de sugerencias, asignaciones, admins). Cookie + mutación sin mención de CSRF es la exposición clásica. Auth.js y `SameSite` mitigan, pero conviene declararlo explícitamente como decisión, no dejarlo implícito.

### S2 — Sin decisión sobre el manejo de los archivos de entrada/salida

> **✅ RESUELTO (2026-08-02).** ADR 0006 y `TECH-DESIGN.md` fijan un modelo **síncrono y sin estado**:
> los archivos de entrada/salida se escriben en un **volumen temporal de disco** solo para aliviar la
> RAM, y un bloque `try/finally` los **elimina de inmediato** tras enviar la respuesta (éxito o
> error). El servidor no almacena archivos para descargas posteriores; la persistencia del resultado
> es responsabilidad exclusiva del navegador del usuario. El hallazgo abajo se conserva como registro.

No hay ADR sobre si el archivo se procesa en memoria o en disco temporal, ni sobre limpieza de temporales. Es la otra cara de A1 (presión de memoria) y merece una línea explícita: streaming vs. disco, y borrado garantizado tras responder.

### S3 — La métrica de adopción mezcla asignaciones actuales con eventos históricos (ADR 0010)

> **✅ RESUELTO (2026-08-02).** ADR 0010 añade una nota técnica que **acepta formalmente** el
> comportamiento: cruzar uso histórico con asignaciones actuales es el resultado deseado por el
> negocio ("de quienes hoy tienen acceso, cuántos lo usan"); no habrá historial de asignaciones y la
> métrica refleja la **foto actual** de permisos. Es una decisión consciente, no un descuido. El
> hallazgo abajo se conserva como registro.

"Adopción (activos vs asignados)" cruza `evento_uso` histórico con las tablas de asignación, que son una foto *actual* (sin historial). "Adopción últimos 30 días" contra las asignaciones de hoy puede ser engañoso si hubo altas/bajas de asignación en el periodo. Aceptable al volumen previsto, pero vale documentar la aproximación.

---

## Lo que resistió el escrutinio

No se inventaron hallazgos donde el diseño se sostiene:

- **ADR 0009 (Entra ID + rol en BD)** es el ADR más fuerte del conjunto: la regla "mínimo 1 admin" resuelta transaccionalmente con `COUNT`, evitar permisos Graph de escritura, y la coherencia con la inmediatez del ADR 0007 están bien razonadas, con alternativas viables y costos reales (rol no auditable desde Entra) honestamente declarados. Solo un detalle menor: un admin dado de baja en Entra conserva `es_admin=1` en la BD, aunque en la práctica ya no podría iniciar sesión.
- **ADR 0007 (fuente de verdad en servidor)** es correcto en su núcleo (revalidación de cache + 403 por request); su único problema es la extensión indebida al servicio de procesadores (ver C1), no la decisión en sí.
- **ADR 0010 (agregación SQL en vivo)** está bien dimensionado para el volumen, con ruta de evolución (resúmenes precalculados) señalada y sin sobre-ingeniería.
- **Cruce con "No alcance" del PRD:** ningún ADR contradice el alcance excluido — no hay tablas de comentarios/votos, el rol es un booleano (sin roles intermedios), no hay asignación masiva. Consistente.
- **Cobertura de DESIGN.md:** todo elemento con implicación de datos (chip violeta "agente IA" → `tipo`; 5 estados de sugerencia → `estado`; switch asignado/sin-acceso → tablas de asignación; tema en `localStorage`, no en BD) tiene cobertura en el modelo.

---

## Orden de atención recomendado

1. **C1** — antes de escribir cualquier spec (define el límite de seguridad y el enrutamiento del archivo).
2. **A1** y **A2** — comprometen criterios de aceptación ya escritos.
3. **A3 / A4 / A5** — antes de la primera migración/entrega.
4. **S1 / S2 / S3** — mejoras no bloqueantes.
