# Portal de Innovación — Lima Expresa (`portal`)

Este repositorio **es** el `portal` del Portal de Innovación de Lima Expresa: la aplicación
**Next.js + TypeScript** donde cada colaborador, autenticado con su correo corporativo, accede a
las apps, agentes de IA y procesadores de archivos que le fueron asignados.

Dos aclaraciones sobre el alcance de este repositorio:

- El servicio de **procesadores** (FastAPI + Python) vive en un **repositorio separado y futuro**,
  todavía no creado. Se crea en el ítem #9 del backlog, no aquí (ADR 0001, dos desplegables).
- **Todavía no hay código de aplicación**: hoy este repositorio contiene únicamente documentación.
  El scaffold de Next.js lo introduce el **ítem #1** del backlog.

## Documentos del proyecto

| Documento | Contenido |
|---|---|
| `PRD.md` | Requisitos de producto: qué hace el portal y para quién. |
| `TECH-DESIGN.md` | Diseño técnico: arquitectura, componentes y flujos. |
| `DESIGN.md` | Sistema de diseño: identidad, modo claro/oscuro y estados de UI obligatorios. |
| `BACKLOG.md` | Backlog ordenado por dependencia; cada ítem es un ciclo de SDD. |
| `adrs/` | Decisiones de arquitectura en formato MADR. |
| `openspec/changes/` | Ciclos de Spec-Driven Development en curso y su documentación. |

## Configuración del entorno local

1. **Base de datos.** La base de datos dedicada del portal, la base **shadow** dedicada y el login
   SQL del portal se aprovisionan **manualmente** sobre la instancia corporativa de SQL Server.
   Este paso **ya está hecho** por el responsable del proyecto: es una precondición, no una tarea
   pendiente.
2. **Plantilla de entorno.** Copiar `.env.example` a `.env.local`.
3. **Valores reales.** Completar en `.env.local` los valores reales de `DATABASE_URL` y
   `SHADOW_DATABASE_URL` (host, nombres de base, usuario y contraseña).
4. **Secretos.** `.env.local` está en `.gitignore` y **no se versiona nunca**. `.env.example` es la
   única plantilla versionada y solo contiene marcadores de posición.

### Forma de la cadena de conexión

Prisma sobre SQL Server usa una cadena **estilo JDBC**, no el formato de URL de Postgres:

```
sqlserver://HOST:1433;database=<db>;user=<user>;password=<password>;encrypt=true;trustServerCertificate=true
```

Dos detalles que suelen causar errores de conexión:

- **Separador punto y coma.** Los parámetros van después del host como pares `clave=valor`
  separados por `;`. No es `postgresql://user:password@host:5432/db`.
- **Llaves para valores con caracteres especiales.** Un valor que contenga `:`, `\`, `=`, `;` o `/`
  debe envolverse en llaves. Aplica sobre todo a la contraseña: `password={mi;pass}`.

---

## ⚠️ Reglas operativas — instancia de SQL Server compartida

La instancia de SQL Server es un **servidor corporativo compartido** que ya aloja otros proyectos.
No es una base de datos de desarrollo aislada. Las tres reglas siguientes son obligatorias.

### 1. `prisma migrate reset` está PROHIBIDO contra esta instancia

`prisma migrate reset` **elimina la base de datos, la vuelve a crear y reaplica todas las
migraciones**. Es destructivo por diseño e inaceptable en un servidor compartido con otros
proyectos. No se ejecuta nunca aquí, bajo ninguna circunstancia.

### 2. Prisma NUNCA crea la base de datos

Ambas bases de datos —la del portal y la shadow— se crean **a mano**. Prisma solo administra el
**esquema** de una base que ya existe. `prisma migrate dev` y `prisma migrate deploy` asumen esa
base existente; ningún comando ni script de este repositorio crea bases de datos.

### 3. La base shadow existe para proteger el servidor compartido

Por defecto, Prisma Migrate **crea y elimina automáticamente** una base shadow. Ese comportamiento
es inaceptable aquí. Por eso la base shadow está aprovisionada a mano y declarada en
`SHADOW_DATABASE_URL`: para que Prisma Migrate **no cree ni elimine** ninguna base de datos por su
cuenta en un servidor compartido.

---

## Trabajo diferido

Dos temas quedaron **deliberadamente fuera** del ítem #0, con su disparador de reentrada definido:

- **Pipeline de despliegue y promoción de entornos.** Se retoma cuando exista una fecha de entrega
  o defensa definida.
- **Aislamiento de red interna entre el portal y el servicio de procesadores.** Se retoma al iniciar
  el **ítem #9**, que no puede empezar sin él: es un requisito de seguridad.

Nada de esto está cancelado. El detalle completo, con responsables y disparadores, está en
`openspec/changes/local-dev-environment/proposal.md`.
