# Deploy Plan — Portal de Innovación Lima Expresa

Fecha: 2026-08-31
Estado: DISEÑADO

> Este documento se escribió **antes** de ejecutar ninguna acción. Nada de lo que describe se
> ejecutó todavía. La sección "Autorizaciones pendientes" lista lo que requiere tu permiso
> explícito, acción por acción.

---

## Resumen del proyecto

**Dos desplegables** (ADR 0001), ambos ya con código:

| Desplegable | Repo | Stack | Estado |
|---|---|---|---|
| `portal` | `T:\App_Portal` | Next.js 16 + React 19 + TypeScript, pnpm 11.9, Node 22.17 | Ítems #1–#8, #10, #13–#19 entregados |
| `procesadores` | `T:\API-Portal` | FastAPI + Python ≥3.11, uv, un solo worker (ADR 0012) | Ítems #9–#12 entregados |

**Datos.** Prisma 6 sobre SQL Server, 3 migraciones aplicadas, `migrate deploy` ya scripteado en
`package.json`. El portal es dueño único del esquema (ADR 0005). El servicio de procesadores hoy
**no tiene driver de base de datos instalado** (`pyproject.toml` no declara `pyodbc` ni
`sqlalchemy`), así que el segundo login SQL de solo lectura del ADR 0005 sigue diferido y este
despliegue no lo necesita.

**Identidad.** Auth.js 5 con Entra ID (`AUTH_MICROSOFT_ENTRA_ID_*`), restricción por dominio
corporativo, `es_admin` releído de la base en cada request (ADR 0007).

**CI/CD existente.** Ninguno. No existe `.github/`. Sí existe remoto GitHub
(`joseraf9000-hub/ProyectoFinal_JoseAlvarezFernandez`), así que hay dónde poner un gate.

**Línea base de calidad, medida hoy (no supuesta):**

```
pnpm typecheck  → limpio
pnpm lint       → limpio
pnpm test       → 128 archivos, 2033 tests, todos en verde (38,5 s)
```

**Infraestructura descubierta en el host.** Esto es lo que condiciona todo el diseño:

| Hecho | Evidencia | Consecuencia |
|---|---|---|
| El host **es** `172.16.50.100` | `Get-NetIPAddress` → `172.16.50.100` | El portal correrá **dentro** del servidor SQL corporativo compartido, no contra él por red |
| `MSSQLSERVER` corriendo en este host | `Get-Service MSSQLSERVER` → `Running` | La app compite por CPU y RAM con la base de datos de otros proyectos |
| 96 GB de RAM, **12 GB libres** | `Win32_OperatingSystem` | El margen para Node + Python es el que SQL Server deje libre |
| 16 CPUs lógicas | `Win32_ComputerSystem` | Los hijos CPU-bound de los procesadores compiten con el motor SQL |
| IIS corriendo, con **ARR ya instalado** | `W3SVC`/`WAS` Running; `C:\Program Files\IIS\Application Request Routing` | Hay reverse proxy nativo; **no** hay `iisnode` ni `HttpPlatformHandler` |
| `T:` (etiqueta `TempDB`, 102 GB, **47,9 GB libres**) aloja los dos repos | `Get-Volume`; `T:\App_Portal`, `T:\API-Portal` | Espacio suficiente para releases. **La etiqueta no refleja el contenido**: no se encontró ningún archivo de SQL Server en `T:` |
| `L:` (etiqueta `Log`) tiene **10 MB libres de 200 GB**, y **no contiene ningún `.ldf`** | `Get-Volume`; búsqueda recursiva de `*.ldf` en `L:` → vacía | No es el log de la base del portal. Lo que ocupa el volumen está dentro de `L:\$RECYCLE.BIN` (~196 GB, ilegible sin elevación) |
| Los únicos archivos de base legibles están en `U:` | `U:\Datos\xmlgst2019.mdf` (565 GB), `U:\Log\xmlgst2019_1.ldf`; `U:` con 34 GB libres | La ubicación real de los archivos de **la base del portal** sigue sin confirmar |
| `sqlcmd -E` rechaza el login del usuario actual | `Login failed for user 'VIAPARQUERIMAC\jose.alvarez_adm'` | No se puede consultar `sys.master_files` sin las credenciales del portal o de un admin |
| `appcmd.exe` deniega lectura de configuración | `redirection.config`: permisos insuficientes | Toda la configuración de IIS la ejecutás vos en consola elevada; yo no puedo y no debo |

---

## Riesgos de plataforma que este plan hereda, no crea

Los enumero acá arriba porque son precondiciones, no detalles de implementación. Ninguno bloquea el
diseño; tres bloquean el release.

1. **BLOQUEANTE — no está confirmado dónde viven los archivos de la base del portal.**
   `prisma migrate deploy` es una transacción DDL y el plan exige un `BACKUP DATABASE` previo; las
   dos cosas necesitan saber a qué volumen escriben y cuánto espacio libre le queda. Hoy no se
   sabe: `sqlcmd -E` rechaza el login del usuario actual, así que no se pudo consultar
   `sys.master_files`. Se cierra con **una sola consulta** ejecutada con el login del portal o con
   uno administrativo:

   ```sql
   SELECT DB_NAME(database_id), type_desc, size*8/1024 AS MB, physical_name
   FROM sys.master_files ORDER BY size DESC;
   ```

   Dato de contexto para dimensionar el riesgo: el único volumen con archivos de base legibles es
   `U:`, con una base de 565 GB y **34 GB libres**. Si la base del portal comparte ese volumen, el
   margen para el backup es ajustado.

   > **Corrección respecto de la primera versión de este plan.** La versión inicial afirmaba que
   > `L:` era el volumen de log de SQL Server y lo declaraba bloqueante por tener 10 MB libres. Esa
   > afirmación salía de la *etiqueta* del volumen, no de sus archivos. Se verificó: `L:` no
   > contiene ningún `.ldf`, y `T:` no contiene ningún archivo de SQL Server. La etiqueta no
   > describe el contenido, y el bloqueante real es el de arriba.
2. **BLOQUEANTE — RAM sin techo declarado.** SQL Server toma toda la memoria que puede. Con 12 GB
   libres hoy, el portal (Node, ~0,3–1 GB) más los hijos de los procesadores (256 MB de presupuesto
   por ejecución, `PRESUPUESTO_DE_RAM_BYTES`, por `EJECUCIONES_MAX`) entran hoy, pero sin un
   `max server memory` fijado explícitamente en SQL Server no hay garantía de que sigan entrando
   mañana. El ADR 0001 pide "límite estricto de RAM por contenedor/instancia": en Windows nativo
   eso no existe gratis, y el sustituto realista es acotar a SQL Server, no a Node.
3. **BLOQUEANTE — certificado TLS.** Auth.js en producción emite la cookie de sesión con prefijo
   `__Secure-`, que el navegador solo acepta sobre HTTPS, y Entra ID rechaza cualquier redirect URI
   no registrado previamente. Sin nombre DNS + certificado + redirect URI registrado, el login no
   arranca. No es hardening: es arranque.
4. **NO BLOQUEANTE — housekeeping de `L:`.** El volumen `L:` está al 0,005 % libre y ~196 GB están
   retenidos en su papelera de reciclaje, que conserva la copia borrada de `L:\App_Portal`. Mover
   los proyectos a `T:` no liberó ese espacio: vaciar la papelera de `L:` sí. No afecta a este
   despliegue —el portal no usa `L:`— pero es espacio muerto en un servidor compartido.

   La recomendación anterior de mover los releases fuera de `T:` **queda retirada**: se apoyaba en
   la etiqueta `TempDB` del volumen, y la verificación no encontró ningún archivo de SQL Server
   ahí. `T:` tiene 47,9 GB libres y es un destino válido para los directorios de release.
5. **NO BLOQUEANTE — `trustServerCertificate=true`.** Es el hallazgo HIGH nº1 de
   `SECURITY-REPORT.md`. Como el portal y SQL Server van a correr en el **mismo host**, la conexión
   ya no cruza la red y el riesgo baja mucho — pero baja por accidente de topología, no por diseño.
   Queda como decisión consciente en "Config & Secrets".

---

## Sistema de deployment propuesto

### Build

**Portal.** Build determinista, en el host, desde un árbol limpio:

```
pnpm install --frozen-lockfile     # el lockfile manda; falla si divergió
pnpm typecheck && pnpm lint && pnpm test
pnpm build                         # next build
```

Determinismo real: `--frozen-lockfile` fija el árbol de dependencias, `packageManager` fija pnpm
11.9.0, y `pnpm-workspace.yaml` ya declara qué paquetes pueden correr scripts de instalación
(`allowBuilds`), así que ningún postinstall nuevo entra sin decisión explícita.

**Cambio requerido en `next.config.ts`:** agregar `output: "standalone"`. Sin eso, el artefacto de
release necesita arrastrar `node_modules/` entero (cientos de MB, con binarios nativos de Prisma).
Con standalone, Next emite `.next/standalone/` con solo lo que el servidor realmente importa. Es
una línea, y es la diferencia entre un release copiable y uno que hay que reinstalar.

**Procesadores.** `uv sync --frozen` + `uv run pytest` + `uv run ruff check .` +
`uv run mypy app tests tools`. El artefacto es el árbol del repo más su `.venv`; uv resuelve desde
`uv.lock`, que es el equivalente al lockfile del portal.

### Artifact

Un directorio de release **inmutable y fechado**, no un `git pull` sobre el directorio que sirve.

```
T:\sites\portal\releases\2026-08-31T2130-1e8a742\
T:\sites\portal\current              ← junction (mklink /J) al release activo
T:\sites\portal\shared\portal.env    ← secretos, fuera de todo release
T:\sites\portal\logs\
```

Mismo esquema para `T:\sites\procesadores\`.

Cada release lleva un `RELEASE.txt` con: SHA del commit, rama, fecha de build, versiones de Node /
pnpm / Python / uv, y el resultado de los tres gates. Eso es la trazabilidad: de lo que está
corriendo se puede volver al commit exacto sin adivinar.

Se conservan los **últimos 5 releases**. El rollback es repuntar la junction; por eso los releases
viejos no se borran hasta que el nuevo está verificado.

### Config & Secrets

**Config** (no secreto, versionado): `next.config.ts`, `web.config` de cada sitio IIS, nombres de
variables en `.env.example`.

**Secretos** (nunca versionados, nunca en el artefacto): un único archivo maestro por desplegable,
fuera del directorio de release, copiado dentro del release en el momento del deploy.

| Variable | Desplegable | Origen |
|---|---|---|
| `DATABASE_URL`, `SHADOW_DATABASE_URL` | portal | Login SQL del portal, ya provisionado |
| `AUTH_SECRET`, `AUTH_URL` | portal | Autogenerado / la URL HTTPS interna |
| `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_ISSUER` | portal | Registro de app en Entra ID (TI) |
| `ALLOWED_EMAIL_DOMAIN`, `ADMIN_EMAIL` | portal | Dominio corporativo / admin semilla |
| `MAIL_API_BASE_URL`, `MAIL_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_INNOVACION_ADDRESS` | portal | API de correo (TI / Innovación) |
| `PROCESADORES_BASE_URL`, `PROCESADORES_SERVICE_TOKEN` | portal | `http://127.0.0.1:8000` y el token compartido |
| `TOKEN_SERVICIO` | procesadores | **El mismo valor** que `PROCESADORES_SERVICE_TOKEN` |
| `EJECUCIONES_MAX`, `TIMEOUT_EJECUCION` | procesadores | Calibrados en `MEDICIONES.md`; `TIMEOUT_EJECUCION` debe quedar estrictamente bajo los 2 min del portal |

El archivo maestro se protege por ACL: lectura solo para la identidad del pool de IIS y para
administradores. No va a Git, no va al ZIP del artefacto, no se imprime en logs.

**Decisión pendiente sobre `trustServerCertificate`.** Como el portal correrá en el mismo host que
SQL Server, la cadena puede pasar a `encrypt=true;trustServerCertificate=false` si SQL Server tiene
un certificado válido instalado, o quedarse como está aceptando el riesgo por localidad. Lo dejo
como decisión tuya, explícita, no como default silencioso.

### Infraestructura

**Un solo host Windows Server 2019, el mismo que corre SQL Server.** No es lo que elegiría en
abstracto — es lo que hay, y es defendible para un portal interno de volumen acotado siempre que
los tres bloqueantes de arriba se cierren.

Topología propuesta:

```
Colaborador ──HTTPS──► IIS: sitio "portal"          (443, nombre DNS interno, certificado)
                          └─ HttpPlatformHandler ──► node server.js  (puerto dinámico, loopback)
                                                          │
                                                          └─ HTTP ──► IIS: sitio "procesadores"
                                                                       (binding 127.0.0.1:8000)
                                                                        └─ HttpPlatformHandler
                                                                             └─ uvicorn 1 worker
```

**Por qué HttpPlatformHandler y no otra cosa:**

- Es un módulo **de Microsoft**, firmado, que arranca, supervisa y reinicia un proceso arbitrario
  (node.exe, python.exe) y le hace de reverse proxy. Un solo mecanismo para las dos cosas.
- La alternativa era ARR (ya instalado, pero solo proxea: no administra el ciclo de vida del
  proceso) más un envoltorio de servicio de terceros tipo NSSM o WinSW. Eso significa bajar un
  binario de terceros a un servidor corporativo que además es el motor de base de datos. Peor
  gobernanza, mismo resultado.
- `iisnode` queda descartado: sin mantenimiento hace años.
- Hay que **instalarlo** (no está hoy). Es un MSI de Microsoft. Es la única dependencia nueva de
  plataforma que este plan introduce.

**Por qué el servicio de procesadores va detrás de un sitio IIS con binding `127.0.0.1:8000`:** esto
es lo que cierra el requisito de aislamiento de red diferido del ítem #0 —"hacer inalcanzable el
endpoint del servicio desde fuera de la red interna"—. Un binding a loopback no es una regla de
firewall que alguien puede aflojar: el socket sencillamente no escucha en ninguna interfaz externa.
Se complementa con una regla de firewall de Windows que bloquee entrante en 8000, como defensa en
profundidad, no como mecanismo principal.

**Un solo worker de uvicorn** (ADR 0012). `EJECUCIONES_MAX` es la única perilla de concurrencia.
HttpPlatformHandler arranca un proceso, así que el invariante se respeta por construcción.

### Entornos

**Uno solo.** Decisión tuya, tomada explícitamente en este pase: producción usa **la misma base de
datos** que venís usando en desarrollo.

Lo que eso significa, dicho sin maquillaje:

- Lo que probás queda registrado en `evento_uso`, así que **contamina la analítica** de los ítems
  #18 y #19. El ranking de recursos y la adopción van a incluir tu tráfico de prueba.
- No hay red de contención contra un comando de migración equivocado: `prisma migrate dev` sobre
  esta base toca producción.
- `prisma migrate reset` sigue **prohibido** (README, regla operativa 1). Ahora con más razón.

Mitigación mínima que sí podés aplicar sin provisionar nada: usar tu propio usuario para las pruebas
y excluirlo por correo en las consultas de analítica, o aceptar el ruido y documentarlo. La salida
real —una segunda base dedicada en la misma instancia— queda como disparador: se retoma si la
analítica empieza a usarse para decidir algo.

### Estrategia de release

**Release directo con intercambio de directorio (swap de junction).** No blue/green, no canary.

Y te digo por qué, porque la respuesta correcta acá es la aburrida: blue/green y canary sirven
cuando podés correr dos versiones **contra estados independientes**. Acá hay un host, una base de
datos y un esquema del que el portal es dueño único. Dos versiones simultáneas compartirían el mismo
esquema, así que el canary no te protegería de lo único que realmente puede romper: una migración.
Sería ceremonia sin cobertura.

Secuencia:

1. Build y gates en un directorio de staging.
2. Backup de la base del portal (ver Data & Migrations).
3. `prisma migrate deploy`.
4. `Stop-Website` de los dos sitios.
5. Repuntar las junctions `current` a los nuevos releases.
6. `Start-Website`.
7. Verificación (abajo).

**Downtime esperado: segundos.** El swap es instantáneo; el costo real es el arranque en frío de
Node y de uvicorn. Para un portal interno con audiencia acotada, eso es aceptable y no justifica
la complejidad de evitarlo.

### Data & Migrations

- **Backup obligatorio antes de cada migración.** `BACKUP DATABASE` de la base del portal al
  volumen que se elija una vez confirmada la ubicación de los archivos de la base. `U:` está
  etiquetado `Backup`, pero hoy aloja una base de 565 GB y le quedan **34 GB libres**: hay que
  medir el tamaño de la base del portal antes de asumir que entra ahí. Sin backup verificado, no se
  corre `migrate deploy`. Punto.
- **Verificación previa de espacio de log.** Como `L:` está en 10 MB libres, el script de deploy
  debe **abortar** si el espacio libre del volumen de log está por debajo de un umbral. Migrar con
  el log lleno es cómo se rompe una instancia compartida.
- `prisma migrate deploy` únicamente. Nunca `migrate dev`, nunca `migrate reset` contra esta
  instancia.
- `prisma migrate status` antes y después, y su salida queda en el registro de ejecución.

**Y esto hay que decirlo con todas las letras: un rollback de código NO es un rollback de datos.**
Repuntar la junction al release anterior devuelve el código, no el esquema. Si una migración agregó
una columna con NOT NULL y el código viejo no la escribe, el código viejo se rompe. Por eso las
migraciones de este portal deben ser **compatibles hacia atrás** con el release inmediatamente
anterior: agregar antes de usar, dejar de usar antes de borrar. Si alguna vez una migración no puede
ser compatible hacia atrás, el rollback de esa versión es restaurar el backup, con la pérdida de
datos que eso implica desde el momento del backup.

### Deploy gates

**Decisión tomada: el despliegue es manual y no usa git.** El procedimiento vive en
[`DESPLIEGUE-MANUAL.md`](DESPLIEGUE-MANUAL.md); esta sección solo dice qué es el gate y qué se
perdió al elegir así.

El gate es **el operador ejecutando la Fase 1.3 del runbook antes de empaquetar**, sobre el árbol
exacto que va a desplegar:

| Condición | Cómo se comprueba |
|---|---|
| `typecheck`, `lint` o `test` fallan | Se corren en el momento, sobre el árbol que se va a empaquetar. No se confía en un resultado viejo |
| El build falla | `pnpm build` |
| El lockfile divergió de `package.json` | `pnpm install --frozen-lockfile` falla en vez de resolver versiones nuevas en silencio |
| Falta espacio libre en el volumen donde viven los archivos de la base y en el del backup | `Get-Volume` sobre los volúmenes que devuelva `sys.master_files` |
| No hay backup fresco y verificado de la base | `BACKUP DATABASE` + `RESTORE VERIFYONLY`, en el momento |
| Falta alguna variable de entorno requerida | Las listas `REQUIRED` que el propio código ya declara (`lib/auth/env.ts`, `lib/correo/env.ts`, `lib/procesadores/servicio.ts`, `lib/admins/directorio-env.ts`) |

**Qué se pierde sin git, y qué no.**

No se pierde la parte sustantiva: las tres compuertas son las mismas y corren sobre el mismo código.
Los chequeos de git que planteaba la versión anterior de este plan —árbol limpio, commit presente en
`origin/main`— eran un **sustituto** de "esto que estoy por desplegar es lo que probé", y ejecutar
las compuertas sobre el árbol real lo verifica de forma más directa.

Lo que sí se pierde es **trazabilidad**: sin SHA, un release no sabe de qué código salió. El runbook
lo compensa con dos pasos baratos —una copia del árbol de trabajo dentro de cada release
(`_fuente\`, sin `node_modules`) y un `RELEASE.txt` con fecha, versiones y resultado de las
compuertas—. No es equivalente a la historia de git, pero responde la pregunta que importa el día de
un incidente: *¿qué código es este?*

Lo que queda sin red, dicho sin maquillaje: **nada impide desplegar un árbol con cambios a medio
hacer.** El único control es el propio operador corriendo las compuertas antes de empaquetar. Por
eso la Fase 1.3 del runbook está marcada como el punto donde se para.

**CI en GitHub Actions: descartado.** El remoto existe, pero el runner de GitHub no puede alcanzar
`172.16.50.100` —es una IP privada—, así que nunca podría desplegar. Como el despliegue además es
manual, un CI sería una señal que nadie mira. Se retoma si alguna vez el proyecto vuelve a un flujo
con git.

### Verify & Observe

**Falta un endpoint de salud en el portal.** El servicio de procesadores tiene `/salud`
(liveness-only, sin base de datos, con un test que verifica por AST que no importe nada de `app.*`).
El portal no tiene equivalente. Es un ítem de GENERATE: `GET /api/salud`, liveness-only, sin guard
de sesión, sin tocar la base — mismo criterio que el ADR 0016 del otro repo.

Verificación después de cada release, en orden:

1. `GET https://<host>/api/salud` → 200. Si esto falla, el deploy falló. No es "desplegó y después
   vemos".
2. `GET http://127.0.0.1:8000/salud` → `{"estado":"vivo"}`.
3. `GET https://<host>/` sin sesión → redirección al login de Entra ID (no un 500).
4. Login real con una cuenta corporativa → dashboard cargado.
5. Una ruta de admin con una cuenta **no** admin → la pantalla 403 de `DESIGN.md`, no un 500.
6. Ejecución de punta a punta del procesador de fixture (ítem #11) → archivo de salida descargado.
   Esto es lo único que prueba la cadena completa portal → proxy → token → uvicorn → hijo → ZIP.
7. `prisma migrate status` → sin migraciones pendientes.

**Observabilidad.** Modesta y honesta, acorde al tamaño:

- `stdout`/`stderr` de ambos procesos a `T:\sites\*\logs\` vía HttpPlatformHandler. **Estos logs no
  rotan solos**: hace falta una tarea programada de limpieza, o el disco se llena en silencio.
- Registro de eventos de Windows para los arranques y caídas de proceso de HttpPlatformHandler.
- Sin APM, sin trazas distribuidas. Para dos procesos en un host, sería sobredimensionado.

### Recovery

| Escenario | Acción |
|---|---|
| El release nuevo falla la verificación | `Stop-Website`, repuntar junction al release anterior, `Start-Website`. Segundos. |
| El proceso Node se cae repetidamente | HttpPlatformHandler reinicia; si entra en ciclo, rollback y revisar `logs\` |
| Migración fallida a mitad | Restaurar el backup previo. Se pierde lo escrito desde el backup: es el costo de tener un solo entorno |
| Se corrió `migrate reset` por error | Restaurar backup. Y por eso está prohibido |
| El portal degrada a SQL Server | Frenar el sitio del portal (`Stop-Website`). La base de otros proyectos vuelve a su estado normal de inmediato |
| El servicio de procesadores no responde | El portal ya lo maneja: el proxy tiene corte a 2 minutos y errores tipificados. El portal sigue funcionando sin procesadores |

**El botón de emergencia es `Stop-Website` del sitio del portal.** Como el portal vive dentro del
servidor de base de datos corporativo, esa es la acción que devuelve el host a su estado previo sin
tocar nada más.

---

## Autorizaciones pendientes

Nada de esto se ejecutó. Cada línea necesita tu permiso explícito **en el momento**, por separado.

### Decisiones tuyas, previas a cualquier ejecución

- [ ] Nombre DNS interno definitivo y certificado TLS: ¿existen ya, o hay que pedirlos a TI?
- [ ] Redirect URI de producción registrado en Entra ID (sin esto el login no arranca)
- [ ] `trustServerCertificate`: ¿se mantiene o pasa a `false`?
- [ ] Confirmar dónde viven los archivos de la base del portal (`sys.master_files`) y cuánto espacio
      libre queda en ese volumen y en el destino del backup — **bloqueante de la migración**
- [ ] Fijar `max server memory` en SQL Server para garantizar margen de RAM

### Acciones de infraestructura (las ejecutás vos, en consola elevada)

- [ ] Instalar HttpPlatformHandler
- [ ] Crear el sitio IIS del portal con binding HTTPS y su certificado
- [ ] Crear el sitio IIS de procesadores con binding `127.0.0.1:8000`
- [ ] Subir `maxAllowedContentLength` (el default de IIS son ~28,6 MB y rompería una carga de varios
      archivos de 25 MB) y `requestTimeout` por encima de los 2 minutos del proxy
- [ ] Regla de firewall bloqueando entrante en 8000
- [ ] Vaciar la papelera de reciclaje de `L:` — housekeeping opcional, recupera ~196 GB muertos en
      un servidor compartido. No bloquea este despliegue.

### Acciones que puedo ejecutar yo, con tu permiso, una por una

- [x] Generar los `web.config` de los dos sitios — `deploy/portal/`, `deploy/procesadores/`
- [x] Generar el runbook de despliegue manual — `DESPLIEGUE-MANUAL.md`
- [~] Workflow de CI y scripts de deploy — **descartados**: el despliegue es manual y sin git
- [ ] Agregar `output: "standalone"` y `poweredByHeader: false` a `next.config.ts` (paso 0.1 del runbook)
- [ ] Agregar `GET /api/salud` al portal
- [ ] Agregar las cabeceras de seguridad HTTP (hallazgo MEDIUM nº2 de `SECURITY-REPORT.md`)
- [ ] Correr el build y los gates
- [ ] Tomar el backup de la base
- [ ] Correr `prisma migrate deploy`
- [ ] Hacer el swap de release
- [ ] Correr la verificación

---

## Registro de ejecución y verificación

*(Vacío. Se completa después de EXECUTE y VERIFY, no antes.)*

Una fila por despliegue, agregada a mano en la Fase 6 de `DESPLIEGUE-MANUAL.md`:

| Sello | Fecha | Qué trae | Verificación | Incidencias |
|---|---|---|---|---|
| | | | | |

**Línea base previa al primer release, medida el 2026-08-31:**

| Comprobación | Resultado |
|---|---|
| `pnpm typecheck` | limpio |
| `pnpm lint` | limpio |
| `pnpm test` | 2033 tests en 128 archivos, todos en verde |
| `pnpm build` | no ejecutado todavía |
| Suite de procesadores | no ejecutada todavía |
