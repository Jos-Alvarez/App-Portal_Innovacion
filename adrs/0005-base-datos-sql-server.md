# ADR 0005: SQL Server como base de datos

## Estado

Aceptado

## Contexto

El modelo de datos (ADR 0002) es relacional con claves foráneas y la pantalla de analítica exige
agregaciones por periodo, usuario, área y recurso. Lima Expresa opera en un entorno corporativo
Microsoft (la identidad ya está en Entra ID), lo que hace natural alinear la base de datos con esa
plataforma.

## Decisión

La base de datos es **Microsoft SQL Server**, accedida desde Next.js mediante un ORM con soporte
oficial (Prisma o Drizzle con el driver `mssql`). En desarrollo se usa SQL Server en contenedor
Docker o la edición Express/Developer (gratuita); en producción, la instancia corporativa o Azure
SQL.

**Dueño único del esquema: Next.js (Prisma).** El backend del portal es el **único dueño absoluto
del esquema** y el **único autorizado a ejecutar migraciones** en SQL Server. El `schema.prisma`
del portal es la fuente de verdad del modelo de datos (ADR 0002); toda creación o alteración de
tablas, índices o columnas ocurre exclusivamente a través de las migraciones de Prisma del portal.
Ningún otro componente crea ni altera estructura.

**Rol de Python: solo lectura estructural (espejo del esquema).** El servicio FastAPI (ADR 0004,
0006) accede a la misma base de datos, pero en modo de **"solo lectura estructural"**: sus modelos
en Python son únicamente un **espejo del esquema dictado por Next.js** (mapean tablas que ya
existen, para leer la fila del `procesador`). El servicio de procesadores tiene **estrictamente
prohibido** crear tablas, modificarlas, gestionar índices o ejecutar migración alguna; si necesita
un cambio de estructura, se solicita al portal, que lo implementa en su migración de Prisma.

**El acceso de FastAPI a la BD es de solo lectura, también en datos.** El registro de `evento_uso`
lo hace el portal, no el servicio (ADR 0006): FastAPI devuelve el resultado o un error tipificado y
el portal escribe el evento, porque es quien conoce al usuario. En consecuencia el servicio no
escribe ninguna fila, y la regla se refuerza con un **usuario de BD de privilegios acotados** —
`SELECT` sobre las tablas que necesita, sin DDL y **sin `INSERT`/`UPDATE`/`DELETE`**. Un permiso
que no existe no se puede usar por accidente.

## Alternativas consideradas

- **PostgreSQL** — robusto, gratuito y con el mejor soporte en el ecosistema Node, pero introduce
  un motor ajeno a la plataforma Microsoft que la empresa ya opera; se prefirió la coherencia con
  el entorno corporativo.
- **SQLite** — cero infraestructura, ideal para una demo, pero con escritura concurrente limitada
  y una migración obligada si el portal pasa a producción real; se descartó para no rehacer la
  capa de datos después.

## Consecuencias

- Coherencia con la plataforma corporativa de Lima Expresa (Entra ID + SQL Server/Azure SQL):
  operación, respaldos y soporte quedan dentro del mundo que la empresa ya conoce.
- Costo real: licenciamiento en producción (o dependencia de Azure SQL) y un motor más pesado para
  el desarrollo local que Postgres/SQLite; la edición Developer/Express mitiga el costo en
  desarrollo pero Express tiene límites de tamaño y memoria.
- El ORM elegido debe tener soporte de primera clase para SQL Server; esto acota la elección
  (Prisma lo soporta; algunas librerías del ecosistema Node priorizan Postgres).
- Al ser Next.js el único dueño del esquema, la coordinación de la BD compartida (ADR 0001) se
  reduce a una sola dirección: el portal migra y el servicio FastAPI adapta su espejo de solo
  lectura. El costo residual es mantener ese espejo Python al día tras cada migración del portal;
  un desajuste solo puede provocar errores de lectura en el servicio (no corrupción de estructura,
  porque Python no tiene permisos DDL).
