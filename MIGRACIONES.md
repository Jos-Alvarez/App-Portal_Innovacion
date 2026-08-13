# Runbook de migraciones — base de datos `Portal`

Documento operativo. Se consulta **mientras algo está pasando**: al crear una migración, al
aplicarla, o cuando Prisma reporta drift. El contexto general de la instancia compartida está en
`README.md`; aquí están los comandos y las decisiones concretas.

**Contexto que condiciona todo lo demás:** SQL Server **corporativo compartido**, con otros
proyectos alojados en la misma instancia. La base del portal y la base shadow se aprovisionan a
mano. El portal es el único componente autorizado a migrar el esquema (ADR 0005).

---

## 1. Prohibiciones

### `prisma migrate reset` está PROHIBIDO

Elimina la base de datos, la vuelve a crear y reaplica todas las migraciones. En una instancia
compartida con otros proyectos eso es inaceptable, y no existe forma de acotarlo. **No se ejecuta
nunca, bajo ninguna circunstancia.** Por eso tampoco existe un script `db:migrate:reset`.

### `prisma migrate dev --create-only` NO es de solo lectura

Antes de generar el archivo nuevo, **aplica a la base todas las migraciones PENDIENTES** y solo
retiene la que acaba de crear. Ya ocurrió una vez: invocarlo dos veces aplicó el esquema a la base
real antes de que nadie lo revisara.

Consecuencia práctica: `--create-only` solo es seguro cuando **no hay migraciones pendientes**.
Verificar siempre antes:

```bash
pnpm db:migrate:status
```

### No existe un script `prisma migrate dev` a secas

Es deliberado. `migrate dev` puede detectar drift y **ofrecer un reset interactivo**, que es
exactamente el comando prohibido. Al no existir el script, ese prompt nunca es alcanzable desde el
flujo normal: se crea con `--create-only` y se aplica con `migrate deploy`.

---

## 2. Comandos disponibles

Todos pasan por `dotenv-cli` (ver sección 7).

| Script | Qué hace | ¿Toca la base? |
|---|---|---|
| `pnpm db:validate` | Valida la sintaxis y la coherencia de `schema.prisma`. | No |
| `pnpm db:format` | Formatea `schema.prisma`. | No |
| `pnpm db:generate` | Regenera el Prisma Client. | No |
| `pnpm db:migrate:status` | Compara el historial local con `_prisma_migrations`. | Solo lectura |
| `pnpm db:migrate:create` | `migrate dev --create-only`: crea el SQL **y aplica lo pendiente**. | **Sí** |
| `pnpm db:migrate:apply` | `migrate deploy`: aplica las pendientes, sin prompts ni reset. | **Sí** |
| `pnpm db:studio` | Explorador de datos. | Sí (lectura/escritura) |

---

## 3. Flujo para crear y aplicar una migración

```bash
# 1. Confirmar que no hay nada pendiente. Si lo hay, resolverlo ANTES de seguir.
pnpm db:migrate:status

# 2. Editar prisma/schema.prisma y validarlo.
pnpm db:validate

# 3. Generar el SQL. Con el estado limpio del paso 1, solo crea el archivo.
pnpm db:migrate:create --name descripcion_corta

# 4. Revisar el SQL generado a mano y AÑADIR los CHECK que Prisma no genera (sección 4).

# 5. Aplicar.
pnpm db:migrate:apply

# 6. Verificar.
pnpm db:migrate:status
pnpm test
```

### Generar SQL sin tocar la base del portal

El único comando que produce el SQL **sin escribir en la base del portal** es `migrate diff`:

```bash
pnpm prisma migrate diff \
  --from-schema-datasource ./prisma/schema.prisma \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script
```

Lee el estado **actual de la base** como origen y el `schema.prisma` como destino, y emite la
diferencia. Es una lectura: no escribe en la base del portal ni en la shadow.

> **Corrección.** Una versión anterior de esta sección usaba `--from-migrations ./prisma/migrations`
> con `--shadow-database-url`. **Ese comando no funciona en este proyecto**: falla con
> `` `mssql` is not a supported connector ``, porque `--from-migrations` necesita replayar el
> historial en una base shadow y esa vía no soporta el conector de SQL Server. Comprobado al generar
> la migración `enlace_nombre_unico` del ítem #5. La variante `--from-schema-datasource` de arriba sí
> funciona y cumple la misma garantía de no escribir.

**Si `migrate dev --create-only` aborta.** En un entorno no interactivo, Prisma se niega a generar
una migración que arrastre un warning —por ejemplo, agregar una restricción `UNIQUE` sobre una
columna con datos— y sale sin escribir ni aplicar nada. Es seguro: no deja estado a medias.
La salida es generar el SQL con el `migrate diff` de arriba y crear la carpeta de migración a mano,
con el formato `<timestamp>_<nombre>/migration.sql`. `migrate status` la reconoce como pendiente y
`migrate deploy` la aplica con normalidad.

`--shadow-database-url` exige el valor literal; no lee la variable del schema. Tomarlo de
`.env.local` y **no** dejarlo escrito en ningún archivo versionado. La salida se revisa, y recién
después se crea a mano la carpeta `prisma/migrations/<timestamp>_<nombre>/migration.sql`.

---

## 4. Los CHECK se escriben a mano

Prisma **no genera enums nativos ni CHECK constraints** sobre SQL Server. Las columnas con forma de
enum quedan como `NVARCHAR` que aceptan cualquier cadena salvo que alguien añada el CHECK.

Regla: **toda migración que introduzca una columna con forma de enum debe llevar su CHECK escrito a
mano antes de aplicarse.** El formato que el proyecto usa, y que la prueba estructural reconoce:

```sql
ALTER TABLE [dbo].[tabla] ADD CONSTRAINT [tabla_columna_check]
    CHECK ([columna] IN ('valor_a', 'valor_b'));
```

El vocabulario permitido se declara en el comentario `/// Enum-shaped: "a" | "b"` del campo en
`schema.prisma`, y debe coincidir **exactamente** con el del CHECK.

Quien vigila esto es `lib/prisma-schema.test.ts`: recorre el schema, recoge cada columna con forma
de enum y exige un CHECK equivalente en las migraciones, en ambas direcciones. Añadir una columna
enum sin su CHECK, o editar el vocabulario en un solo lado, deja la suite en rojo. No requiere
conexión a la base.

---

## 5. Colación: historia y regla

La base nació con `SQL_Latin1_General_CP850_CI_AS`. El motor Rust de Prisma **no puede decodificar
esa colación**: `migrate status` y `migrate deploy` fallaban con un error de codificación. Las
consultas de la aplicación no se veían afectadas, porque Prisma mapea `String` a `NVARCHAR`; el
problema era exclusivo de la herramienta de migraciones. Estando la base todavía vacía, se
reconstruyó con `SQL_Latin1_General_CP1_CI_AS` y se aplicó una migración inicial limpia.

**Regla hacia adelante:** toda base nueva que se aprovisione para este proyecto —incluida la
shadow— debe crearse ya con una colación soportada. La comprobación es barata y va **antes** de
cualquier otra cosa:

```sql
SELECT DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS colacion;
```

Si devuelve una colación `CP850` (o cualquier code page que el motor no decodifique), **detenerse**:
corregir la colación mientras la base está vacía. Rehacerla con datos dentro es mucho más caro.

---

## 6. Qué hacer ante drift

Prisma, al detectar drift, ofrece un reset. Aquí ese remedio **no está disponible**. La salida real
es `migrate resolve`, que corrige el historial `_prisma_migrations` sin tocar el esquema, combinado
con `migrate diff` y `db execute` para corregir el esquema sin tocar el historial.

| Situación | Acción |
|---|---|
| El SQL ya se ejecutó a mano en la base y Prisma la sigue viendo pendiente | `pnpm prisma migrate resolve --applied <nombre_migracion>` |
| Una migración quedó registrada como fallida y **no** alcanzó a modificar nada | `pnpm prisma migrate resolve --rolled-back <nombre_migracion>`, corregir el SQL y reaplicar |
| Una migración falló **a medias** | Deshacer a mano lo que sí se aplicó, luego `--rolled-back`, corregir y reaplicar |
| Alguien cambió el esquema fuera de las migraciones | Generar el SQL correctivo con `migrate diff`, revisarlo, aplicarlo con `db execute` y registrarlo con `--applied` |

```bash
# Aplicar un SQL correctivo revisado (sí escribe en la base del portal).
pnpm prisma db execute --file ./correccion.sql --schema ./prisma/schema.prisma
```

Dos cosas que **no** son remedios de drift: `migrate reset` (prohibido) y editar una migración ya
aplicada. Una migración aplicada es inmutable; toda corrección va en una migración nueva.

---

## 7. Secretos

- `.env.local` es la **única fuente de verdad** de `DATABASE_URL` y `SHADOW_DATABASE_URL`. Está en
  `.gitignore` y no se versiona.
- El CLI de Prisma lee `.env`, **no** `.env.local`. Por eso los scripts `db:*` pasan por
  `dotenv-cli` en lugar de duplicar credenciales.
- **Nunca crear un segundo archivo de entorno.** Dos archivos con credenciales es un archivo
  desactualizado esperando el momento de confundir a alguien.
- `.env.example` es la única plantilla versionada y solo contiene marcadores de posición.
