# Runbook de despliegue manual — Portal de Innovación

Procedimiento paso a paso para desplegar a mano, sin git y sin pipeline automático, sobre el
servidor Windows que además corre SQL Server.

Complementa a `DEPLOY-PLAN.md`, que explica **por qué** el sistema es así. Este documento es el
**cómo**: se ejecuta de arriba abajo, y cada bloque termina con una comprobación que decide si se
sigue o se frena.

> **Regla que gobierna todo el documento:** si una comprobación falla, se para. No se sigue "a ver
> si el siguiente paso lo arregla". Un despliegue a medias en un servidor compartido con la base de
> datos corporativa es peor que un despliegue no hecho.

**Convención de consolas.** Los bloques marcados `[ADMIN]` van en **PowerShell como
administrador**. Los marcados `[NORMAL]` van en tu consola habitual. `appcmd.exe` y la creación de
sitios IIS **fallan sin elevación**.

---

## Índice

- [Fase 0 — Preparación, una sola vez](#fase-0--preparación-una-sola-vez)
- [Fase 1 — Construir el portal](#fase-1--construir-el-portal)
- [Fase 2 — Construir el servicio de procesadores](#fase-2--construir-el-servicio-de-procesadores)
- [Fase 3 — Backup y migraciones](#fase-3--backup-y-migraciones)
- [Fase 4 — Intercambio de release](#fase-4--intercambio-de-release)
- [Fase 5 — Verificación](#fase-5--verificación)
- [Fase 6 — Registro](#fase-6--registro)
- [Rollback](#rollback)
- [Mantenimiento periódico](#mantenimiento-periódico)

---

## Fase 0 — Preparación, una sola vez

Todo lo de esta fase se hace **una vez**. No se repite en cada despliegue.

### 0.1 — Cambios en el código, previos al primer build

Dos ediciones en `T:\App_Portal\next.config.ts`:

```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  agentRules: false,
  output: "standalone",   // <- agregar: build autocontenido, sin node_modules en el release
  poweredByHeader: false, // <- agregar: deja de anunciar "X-Powered-By: Next.js"
};
```

Sin `output: "standalone"`, el release necesita arrastrar `node_modules/` entero, con los binarios
nativos de Prisma adentro. Con standalone, Next emite sólo lo que el servidor importa de verdad.

### 0.2 — Instalar HttpPlatformHandler

No está instalado en este host (hoy hay ARR, ASP.NET Core Module y Web Deploy). Es el módulo de
Microsoft que arranca, supervisa y proxea un proceso arbitrario.

Descargarlo del sitio de Microsoft (`HttpPlatformHandler` v1.2, x64) e instalar el MSI.

**Comprobación** `[ADMIN]`:

```powershell
C:\Windows\System32\inetsrv\appcmd.exe list module /name:httpPlatformHandler
```

Si no devuelve una línea con `MODULE "httpPlatformHandler"`, no sigas: los `web.config` van a
fallar con **500.19**.

### 0.3 — Herramientas de scripting de IIS (opcional pero recomendado)

El módulo `WebAdministration` de PowerShell **no está presente** en este host. Sin él sólo tenés
`appcmd.exe`, que alcanza para todo lo de acá pero es más incómodo.

```powershell
# [ADMIN]
Install-WindowsFeature Web-Scripting-Tools
```

### 0.4 — Estructura de directorios

```powershell
# [ADMIN]
'T:\sites\portal\releases',
'T:\sites\portal\shared',
'T:\sites\portal\logs',
'T:\sites\procesadores\releases',
'T:\sites\procesadores\shared',
'T:\sites\procesadores\logs' | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ }
```

Queda así:

```
T:\sites\portal\
  releases\        <- una carpeta por release, inmutable
  current          <- junction al release activo (se crea en la Fase 4)
  shared\          <- secretos, FUERA de todo release
  logs\
T:\sites\procesadores\   (idéntico)
```

Los secretos viven en `shared\` y no adentro del release **a propósito**: el release se reemplaza
en cada despliegue, los secretos no.

### 0.5 — Archivos de secretos

Creá `T:\sites\portal\shared\.env.production.local` con los valores reales. Las variables las
declara el propio código, así que esta lista no es inventada:

| Variable | Declarada en |
|---|---|
| `DATABASE_URL` | `prisma/schema.prisma` |
| `AUTH_SECRET`, `ALLOWED_EMAIL_DOMAIN` | `lib/auth/env.ts` |
| `AUTH_MICROSOFT_ENTRA_ID_ID`, `_SECRET`, `_ISSUER` | `lib/auth/env.ts`, `lib/admins/directorio-env.ts` |
| `AUTH_URL` | Auth.js — la URL HTTPS pública del portal |
| `ADMIN_EMAIL` | administrador semilla |
| `MAIL_API_BASE_URL`, `MAIL_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_INNOVACION_ADDRESS` | `lib/correo/env.ts` |
| `PROCESADORES_BASE_URL` | `lib/procesadores/servicio.ts` — vale `http://127.0.0.1:8000` |
| `PROCESADORES_SERVICE_TOKEN` | `lib/procesadores/servicio.ts` |

Y `T:\sites\procesadores\shared\.env` con:

| Variable | Nota |
|---|---|
| `TOKEN_SERVICIO` | **El mismo valor exacto** que `PROCESADORES_SERVICE_TOKEN` del portal |
| `EJECUCIONES_MAX` | Calibrado en `MEDICIONES.md` del repo de procesadores |
| `TIMEOUT_EJECUCION` | Estrictamente **menor** a 120 (el corte del portal). El servicio se niega a arrancar si no |

Permisos sobre los dos archivos `[ADMIN]`:

```powershell
icacls 'T:\sites\portal\shared\.env.production.local' /inheritance:r `
  /grant 'IIS AppPool\portal:(R)' /grant 'Administrators:(F)' /grant 'SYSTEM:(F)'

icacls 'T:\sites\procesadores\shared\.env' /inheritance:r `
  /grant 'IIS AppPool\procesadores:(R)' /grant 'Administrators:(F)' /grant 'SYSTEM:(F)'
```

### 0.6 — Application pools

```powershell
# [ADMIN]
$appcmd = 'C:\Windows\System32\inetsrv\appcmd.exe'

foreach ($nombre in 'portal','procesadores') {
  & $appcmd add apppool /name:$nombre /managedRuntimeVersion:"" /autoStart:true
  & $appcmd set apppool /apppool.name:$nombre /startMode:"AlwaysRunning"
  & $appcmd set apppool /apppool.name:$nombre /processModel.idleTimeout:"00:00:00"
  & $appcmd set apppool /apppool.name:$nombre /recycling.periodicRestart.time:"00:00:00"
}
```

Los cuatro ajustes, uno por uno, porque cada uno arregla un problema concreto:

- **`managedRuntimeVersion:""`** — "Sin código administrado". No hay .NET acá; cargar el CLR sería
  memoria desperdiciada en un host que ya tiene 12 GB libres.
- **`startMode:AlwaysRunning` + `autoStart:true`** — el pool arranca con el servidor, no con la
  primera visita. Sin esto, el primer usuario de la mañana paga el arranque en frío.
- **`idleTimeout:00:00:00`** — **este es el importante.** El default de IIS mata el pool a los 20
  minutos sin tráfico, y con él mata el proceso de Node. Un portal interno pasa horas sin visitas.
  Sin este ajuste, casi todas las visitas serían arranques en frío.
- **`recycling.periodicRestart.time:00:00:00`** — desactiva el reciclado cada 29 horas. Ese default
  existe por las fugas de memoria de aplicaciones .NET viejas; acá sólo cortaría ejecuciones de
  procesadores en curso a horario impredecible.

### 0.7 — Sitios IIS

```powershell
# [ADMIN]
$appcmd = 'C:\Windows\System32\inetsrv\appcmd.exe'

# Portal: HTTPS, nombre DNS interno. Reemplazá portal.ejemplo.local por el tuyo.
& $appcmd add site /name:"portal" `
    /bindings:"https/*:443:portal.ejemplo.local" `
    /physicalPath:"T:\sites\portal\current"
& $appcmd set app /app.name:"portal/" /applicationPool:"portal"

# Procesadores: SOLO loopback. Esta linea es la frontera de seguridad.
& $appcmd add site /name:"procesadores" `
    /bindings:"http/127.0.0.1:8000:" `
    /physicalPath:"T:\sites\procesadores\current"
& $appcmd set app /app.name:"procesadores/" /applicationPool:"procesadores"
```

> **El binding `127.0.0.1:8000` no es una preferencia, es el mecanismo de aislamiento.** Es lo que
> hace inalcanzable el endpoint interno desde fuera del host — el requisito que el ítem #0 dejó
> diferido. Si algún día lo cambiás a `*:8000`, exponés el servicio de procesadores a toda la red
> corporativa. No lo cambies.

**El certificado se asocia desde el Administrador de IIS**, no desde `appcmd`: Sitios → `portal` →
Modificar enlaces → `https` → seleccionar el certificado. `appcmd` no sabe adjuntar certificados.

### 0.8 — Firewall

```powershell
# [ADMIN]
New-NetFirewallRule -DisplayName "Portal: bloquear 8000 entrante" `
  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Block
```

Defensa en profundidad. El mecanismo real sigue siendo el binding de loopback: esta regla es el
cartel, aquel es la puerta con llave.

### 0.9 — Entra ID

Con el nombre DNS ya definido, TI tiene que registrar el redirect URI de producción en la app de
Entra ID:

```
https://portal.ejemplo.local/api/auth/callback/microsoft-entra-id
```

**Sin esto el login no arranca.** Entra ID rechaza cualquier redirect URI no pre-registrado. No
degrada: falla.

### 0.10 — Permisos del pool sobre las carpetas

```powershell
# [ADMIN]
icacls 'T:\sites\portal'        /grant 'IIS AppPool\portal:(OI)(CI)(RX)'        /T
icacls 'T:\sites\portal\logs'   /grant 'IIS AppPool\portal:(OI)(CI)(M)'         /T
icacls 'T:\sites\procesadores'      /grant 'IIS AppPool\procesadores:(OI)(CI)(RX)' /T
icacls 'T:\sites\procesadores\logs' /grant 'IIS AppPool\procesadores:(OI)(CI)(M)'  /T
```

---

## Fase 1 — Construir el portal

A partir de acá, **esto es lo que se repite en cada despliegue**.

### 1.1 — Definir la etiqueta del release

```powershell
# [NORMAL]
$sello   = Get-Date -Format 'yyyyMMdd-HHmm'
$release = "T:\sites\portal\releases\$sello"
"Release: $sello"
```

Anotá ese sello. Se usa en las fases 1, 4 y 6.

### 1.2 — Construir

```powershell
# [NORMAL]
Set-Location T:\App_Portal

pnpm install --frozen-lockfile
```

`--frozen-lockfile` es deliberado: falla si `pnpm-lock.yaml` no coincide con `package.json`, en vez
de resolver versiones nuevas en silencio. Un despliegue no es el momento de descubrir una
dependencia distinta.

### 1.3 — Las tres compuertas

**Este es el gate real.** Sin git ni CI, esto es lo único que separa un release bueno de uno roto.
Corren sobre el árbol exacto que vas a empaquetar.

```powershell
# [NORMAL]
pnpm typecheck
pnpm lint
pnpm test
```

Línea base conocida, medida el 2026-08-31: **typecheck limpio, lint limpio, 2033 tests en 128
archivos, todos en verde.**

> Si alguno falla, **se para acá**. No hay despliegue.

### 1.4 — Build

```powershell
# [NORMAL]
pnpm build
```

### 1.5 — Armar la carpeta del release

`next build` con `output: "standalone"` **no copia** los estáticos ni `public`. Los tres copiados
de abajo no son opcionales: sin ellos la app levanta y sirve páginas sin estilos.

```powershell
# [NORMAL]
New-Item -ItemType Directory -Force -Path $release | Out-Null

# 1. El servidor autocontenido
Copy-Item -Recurse -Force .\.next\standalone\* $release

# 2. Los estaticos (next build NO los copia)
New-Item -ItemType Directory -Force -Path "$release\.next\static" | Out-Null
Copy-Item -Recurse -Force .\.next\static\* "$release\.next\static"

# 3. public (next build tampoco lo copia)
if (Test-Path .\public) { Copy-Item -Recurse -Force .\public $release }

# 4. La configuracion de IIS
Copy-Item -Force .\deploy\portal\web.config $release

# 5. Los secretos, desde shared\
Copy-Item -Force 'T:\sites\portal\shared\.env.production.local' $release
```

### 1.6 — Copia del código fuente (esto reemplaza a git)

```powershell
# [NORMAL]
$fuente = "$release\_fuente"
New-Item -ItemType Directory -Force -Path $fuente | Out-Null
robocopy T:\App_Portal $fuente /E /XD node_modules .next .git .codegraph _fuente /NFL /NDL /NJH /NJS
```

**Por qué este paso existe.** Sin git, la carpeta `T:\App_Portal` es la única copia del código, y se
sobrescribe cada vez que trabajás. Dentro de tres meses, mirando un release que falla, no vas a
poder saber de qué código salió. Esta copia —unos pocos MB, sin `node_modules`— es lo que te
devuelve esa respuesta. Es barato ahora y es invaluable el día que lo necesites.

### 1.7 — RELEASE.txt

```powershell
# [NORMAL]
@"
Release      : $sello
Desplegado   : $(Get-Date -Format 'yyyy-MM-dd HH:mm')
Por          : $env:USERNAME
Host         : $env:COMPUTERNAME

Node         : $(node -v)
pnpm         : $(pnpm -v)

Compuertas   : typecheck OK / lint OK / test OK
Fuente       : _fuente\  (copia del arbol de trabajo al momento del build)

Cambios de este release (completar a mano):
  -
"@ | Set-Content -Encoding UTF8 "$release\RELEASE.txt"
```

Completá a mano la línea de cambios. Es el único lugar donde va a quedar escrito qué trae este
release.

---

## Fase 2 — Construir el servicio de procesadores

Se salta entera **sólo si** este despliegue no toca el servicio de procesadores. Si es el primer
despliegue, no se salta.

```powershell
# [NORMAL]
$selloP   = Get-Date -Format 'yyyyMMdd-HHmm'
$releaseP = "T:\sites\procesadores\releases\$selloP"

Set-Location T:\API-Portal

# Compuertas del servicio
uv sync --frozen
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy app tests tools
```

Si alguna falla, se para.

```powershell
# [NORMAL]
New-Item -ItemType Directory -Force -Path $releaseP | Out-Null
robocopy T:\API-Portal $releaseP /E /XD .venv .git .mypy_cache .pytest_cache .ruff_cache __pycache__ /NFL /NDL /NJH /NJS

Copy-Item -Force T:\App_Portal\deploy\procesadores\web.config $releaseP
Copy-Item -Force 'T:\sites\procesadores\shared\.env' $releaseP
```

### 2.1 — El entorno virtual se crea DENTRO del release

```powershell
# [NORMAL]
Set-Location $releaseP
uv sync --frozen
Set-Location T:\App_Portal
```

**No copies el `.venv` desde `T:\API-Portal`.** Un entorno virtual guarda rutas absolutas en
`pyvenv.cfg` y en sus scripts; movido de lugar queda en un estado frágil que falla de maneras raras
y a destiempo. Se crea en su destino final, y listo.

---

## Fase 3 — Backup y migraciones

> **BLOQUEANTE PENDIENTE.** Todavía no está confirmado dónde viven los archivos de la base del
> portal ni cuánto espacio libre queda en ese volumen. Se resuelve con una consulta, ejecutada con
> el login del portal:
>
> ```sql
> SELECT DB_NAME(database_id), type_desc, size*8/1024 AS MB, physical_name
> FROM sys.master_files ORDER BY size DESC;
> ```
>
> Hasta tener esa respuesta, **no corras la migración**: no sabés a qué volumen escribe el backup ni
> si entra. Como referencia, el único volumen con archivos de base legibles es `U:`, que aloja una
> base de 565 GB y tiene 34 GB libres.

### 3.1 — Estado actual

```powershell
# [NORMAL]
Set-Location T:\App_Portal
pnpm db:migrate:status
```

Si dice que no hay migraciones pendientes, **saltá a la Fase 4**. No hay nada que migrar y no hace
falta backup de migración.

### 3.2 — Backup

```sql
BACKUP DATABASE [<base_del_portal>]
TO DISK = N'<volumen_confirmado>\portal_pre_<sello>.bak'
WITH INIT, CHECKSUM, STATS = 10;
```

```sql
-- Verificar que el backup sirve. Un backup no verificado no es un backup.
RESTORE VERIFYONLY FROM DISK = N'<volumen_confirmado>\portal_pre_<sello>.bak';
```

> Sin backup verificado no se corre la migración. Punto.

### 3.3 — Aplicar

```powershell
# [NORMAL]
pnpm db:migrate:apply
```

Ese script corre `prisma migrate deploy`, que es el único comando de migración permitido acá.

> **`prisma migrate reset` está PROHIBIDO contra esta instancia** (README, regla operativa 1).
> Borra la base, la recrea y reaplica todo, en un servidor que aloja otros proyectos. Nunca, bajo
> ninguna circunstancia.

### 3.4 — Compatibilidad hacia atrás

**Un rollback de código no es un rollback de datos.** Volver al release anterior devuelve el código,
no el esquema.

Por eso cada migración tiene que ser compatible con el release inmediatamente anterior: **agregar
antes de usar, dejar de usar antes de borrar.** Si una migración no puede serlo, el rollback de esa
versión es restaurar el backup — con la pérdida de todo lo escrito desde que se tomó.

---

## Fase 4 — Intercambio de release

Downtime esperado: **segundos**. El intercambio es instantáneo; lo que se paga es el arranque en
frío de Node y de uvicorn.

```powershell
# [ADMIN]
$appcmd = 'C:\Windows\System32\inetsrv\appcmd.exe'

& $appcmd stop site /site.name:"portal"
& $appcmd stop site /site.name:"procesadores"

# Portal: rehacer la junction
if (Test-Path 'T:\sites\portal\current') {
  cmd /c rmdir 'T:\sites\portal\current'
}
cmd /c mklink /J 'T:\sites\portal\current' $release

# Procesadores: solo si la Fase 2 se ejecuto
if (Test-Path 'T:\sites\procesadores\current') {
  cmd /c rmdir 'T:\sites\procesadores\current'
}
cmd /c mklink /J 'T:\sites\procesadores\current' $releaseP

& $appcmd start site /site.name:"procesadores"
& $appcmd start site /site.name:"portal"
```

`rmdir` sobre una junction borra **el enlace, no el destino**. Es la razón por la que se usa
`rmdir` y no `Remove-Item -Recurse`: este último, según versión de PowerShell, puede seguir el
enlace y borrar el release apuntado. Usá `rmdir`.

---

## Fase 5 — Verificación

**Un despliegue que "terminó" pero falla su verificación es un despliegue fallido**, no uno exitoso
con un pendiente. Las siete comprobaciones, en orden:

| # | Qué | Cómo | Esperado |
|---|---|---|---|
| 1 | Salud del servicio de procesadores | `curl.exe http://127.0.0.1:8000/salud` | `{"estado":"vivo"}` |
| 2 | El portal responde | `curl.exe -I https://portal.ejemplo.local/` | 200 o 307 al login |
| 3 | Sin sesión redirige a Entra ID | Navegador en ventana privada | Pantalla de login, **no** un 500 |
| 4 | Login real | Cuenta corporativa | Dashboard cargado |
| 5 | Guard de admin | Ruta `/admin/...` con cuenta **no** admin | La pantalla 403 de `DESIGN.md`, no un 500 ni una página de IIS |
| 6 | Cadena completa | Ejecutar el procesador de fixture (ítem #11) | Archivo de salida descargado |
| 7 | Migraciones | `pnpm db:migrate:status` | Sin pendientes |

La **6** es la única que prueba la tubería entera: portal → proxy → token → uvicorn → proceso hijo →
descarga. Las otras seis pueden pasar con el servicio de procesadores caído.

La **5** además valida el `httpErrors existingResponse="PassThrough"` del `web.config`. Si ves una
página de error de IIS en vez de tu pantalla 403, ese ajuste no quedó aplicado.

**Si algo falla acá, andá a [Rollback](#rollback).** No dejes el release puesto "hasta mañana".

### Cuando algo no arranca

```powershell
# Que dijo el proceso al morir
Get-Content T:\sites\portal\logs\portal-stdout.log -Tail 50
Get-Content T:\sites\procesadores\logs\procesadores-stdout.log -Tail 50

# Que dijo IIS
Get-EventLog -LogName Application -Newest 30 |
  Where-Object { $_.Source -like '*HttpPlatform*' -or $_.Source -like '*IIS*' } |
  Format-List TimeGenerated, Source, Message
```

Fallas típicas y su causa real:

| Síntoma | Causa casi siempre |
|---|---|
| **500.19** | HttpPlatformHandler no instalado (paso 0.2) |
| **502.5** | El proceso muere al arrancar. Falta una variable de entorno, o `.env.production.local` no se copió |
| **404.13** en una subida | `maxAllowedContentLength` no quedó aplicado en alguno de los dos sitios |
| Páginas sin estilos | Faltó copiar `.next\static` o `public` (paso 1.5) |
| La cookie de sesión no persiste | El sitio no está en HTTPS, o `AUTH_URL` no coincide con la URL real |
| Primera visita del día lentísima | `idleTimeout` no quedó en `00:00:00` (paso 0.6) |

---

## Fase 6 — Registro

Agregá una fila a la tabla de `DEPLOY-PLAN.md`, sección "Registro de ejecución y verificación":

```
| <sello> | <fecha> | <que trae> | 7/7 verificaciones OK | <incidencias, o "ninguna"> |
```

**Anotá también lo que salió mal**, aunque lo hayas resuelto en el momento. El próximo despliegue
lo hace la misma persona con tres meses menos de memoria.

---

## Rollback

Devuelve el código en segundos. **No devuelve datos.**

```powershell
# [ADMIN]
$appcmd = 'C:\Windows\System32\inetsrv\appcmd.exe'

# Ver los releases disponibles, mas nuevo primero
Get-ChildItem T:\sites\portal\releases | Sort-Object Name -Descending | Select-Object -First 5

$anterior = 'T:\sites\portal\releases\<sello_anterior>'

& $appcmd stop site /site.name:"portal"
cmd /c rmdir 'T:\sites\portal\current'
cmd /c mklink /J 'T:\sites\portal\current' $anterior
& $appcmd start site /site.name:"portal"
```

Después del rollback, **volvé a correr la Fase 5**. Un rollback también es un despliegue.

**Si el release incluía una migración**, releer la sección 3.4 antes de dar el rollback por
terminado: el esquema quedó adelantado respecto del código. Si la migración era compatible hacia
atrás, no pasa nada. Si no lo era, hay que restaurar el backup, y se pierde lo escrito desde que se
tomó.

---

## Mantenimiento periódico

### Podar releases viejos

Se conservan los **últimos 5**. Los viejos son la red de rollback: no se borran hasta que el nuevo
esté verificado.

```powershell
# [NORMAL]
foreach ($sitio in 'portal','procesadores') {
  Get-ChildItem "T:\sites\$sitio\releases" |
    Sort-Object Name -Descending |
    Select-Object -Skip 5 |
    Remove-Item -Recurse -Force
}
```

> Antes de correrlo, confirmá que `current` no apunta a ninguno de los que se van a borrar.

### Rotar logs

**HttpPlatformHandler no rota nada.** El archivo de stdout crece indefinidamente hasta llenar el
disco, en silencio, en un servidor que también es tu base de datos. Tarea programada semanal:

```powershell
# [NORMAL]
Get-ChildItem T:\sites\*\logs\*.log |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  Remove-Item -Force
```

### Vigilar la memoria

El host tiene 96 GB con ~12 GB libres, y SQL Server no devuelve memoria por gusto.

```powershell
# [NORMAL]
Get-Process node, python -ErrorAction SilentlyContinue |
  Select-Object Name, Id, @{n='RAM_MB';e={[math]::Round($_.WorkingSet64/1MB)}}

$os = Get-CimInstance Win32_OperatingSystem
'Libre: {0} GB' -f [math]::Round($os.FreePhysicalMemory/1MB, 1)
```

Si el margen libre se achica, la salida es fijar `max server memory` en SQL Server para garantizar
espacio a la aplicación — no achicar la aplicación.

---

## Botón de emergencia

Si el portal degrada al servidor de base de datos y afecta a otros proyectos:

```powershell
# [ADMIN]
C:\Windows\System32\inetsrv\appcmd.exe stop site /site.name:"portal"
C:\Windows\System32\inetsrv\appcmd.exe stop site /site.name:"procesadores"
```

Devuelve el host a su estado previo de inmediato, sin tocar la base de datos ni ningún otro sitio.
