import type { PrismaClient } from "@prisma/client";

import type { Periodo } from "@/lib/analitica/periodos";
import type { TipoEvento } from "@/lib/eventos/repository";
import type { EstadoSugerencia } from "@/lib/sugerencias/schema";

/**
 * The database side of the analytics engine — backlog item #18, under ADR 0010.
 *
 * The Prisma client is a parameter and not a module import, exactly as in every
 * other repository here: production passes the singleton, the suite passes a
 * double and never reaches SQL Server.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THREE AGGREGATIONS AND THREE DIMENSION READS, AND THE SPLIT IS THE DESIGN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The three `agregar*` functions run one `GROUP BY` each over a fact table, in
 * SQL, bounded by a date range — which is exactly what ADR 0010 chose and what
 * the four indexes on `evento_uso` were created for. They return counts keyed by
 * identifiers and nothing else: no names, no areas, no labels.
 *
 * `leerDimensiones` reads the three small tables that turn those identifiers
 * into something a person can read. It takes NO period, and that is the point:
 * the catalogue of resources and the roster of people do not change between the
 * period and the one before it, so a comparison runs the three aggregations
 * twice and this read once.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE JOINS HAPPEN IN TYPESCRIPT AND NOT IN SQL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0010 describes the queries as `GROUP BY` over `evento_uso` "unida a
 * `usuario` para el corte por área". The join could be written as raw SQL, and
 * it is not, for three reasons that all point the same way:
 *
 *   1. The expensive half is already in SQL. `evento_uso` is the table the ADR
 *      worries about — the one that grows with every click — and every read of
 *      it here is an indexed, range-bounded `GROUP BY` that returns one row per
 *      resource or per person, not per event. What is folded in memory is the
 *      RESULT of that aggregation: tens of rows, bounded by the size of the
 *      catalogue and the staff list, not by the history.
 *
 *   2. `evento_uso.id_recurso` has no foreign key. ADR 0002 made the reference
 *      polymorphic, so "join to the resource" is really "join to one of two
 *      tables depending on a string column" — expressible in SQL only as two
 *      `LEFT JOIN`s and a `COALESCE`, which is more machinery than reading two
 *      catalogues of tens of rows.
 *
 *   3. Raw SQL would be the first place in this portal where the schema's shape
 *      is duplicated as text. `prisma/schema.prisma` is the single owner
 *      (ADR 0005), and a renamed column that the compiler cannot see is a
 *      runtime failure on an admin screen instead of a build failure.
 *
 * If `evento_uso` ever grows to the volume ADR 0010 warns about, what changes is
 * the ADR's own escape hatch — precomputed summaries — and not this line.
 */

/** The slice of Prisma this module uses. */
export type AnaliticaClient = Pick<
  PrismaClient,
  "eventoUso" | "sugerencia" | "enlace" | "procesador" | "usuario"
>;

/* ══════════════════════════════════════════════════════════════════════════
 *  THE FACTS
 * ══════════════════════════════════════════════════════════════════════════ */

/** One resource, one kind of event, and how many times it happened. */
export interface ConteoPorRecurso {
  tipoRecurso: string;
  idRecurso: number;
  tipoEvento: TipoEvento;
  total: number;
}

/** One person, one kind of event, and how many times they caused it. */
export interface ConteoPorUsuario {
  usuarioId: number;
  tipoEvento: TipoEvento;
  total: number;
}

/** One author, one suggestion state, and how many they sent. */
export interface ConteoDeSugerencias {
  autorId: number;
  estado: EstadoSugerencia;
  total: number;
}

/** `fecha >= desde AND fecha < hasta` — half-open, as `periodos.ts` defines it. */
function enPeriodo({ desde, hasta }: Periodo) {
  return { gte: desde, lt: hasta };
}

/**
 * Usage per resource, per kind of event.
 *
 * ONE QUERY ANSWERS TWO SECTIONS OF THE SCREEN. The ranking of most-used
 * resources and the breakdown of processing errors per procesador are the same
 * rows read two ways — `apertura`/`ejecucion` for the first, the five `error_*`
 * members for the second. Splitting them into two queries would scan the same
 * index twice to produce halves of one result, and would let the two drift apart
 * the day somebody adds a sixth event type to one of the filters and not the
 * other.
 */
export async function agregarPorRecurso(
  client: AnaliticaClient,
  periodo: Periodo,
): Promise<ConteoPorRecurso[]> {
  const filas = await client.eventoUso.groupBy({
    by: ["tipoRecurso", "idRecurso", "tipoEvento"],
    where: { fecha: enPeriodo(periodo) },
    _count: { _all: true },
  });

  return filas.map((fila) => ({
    tipoRecurso: fila.tipoRecurso,
    idRecurso: fila.idRecurso,
    tipoEvento: fila.tipoEvento as TipoEvento,
    total: fila._count._all,
  }));
}

/**
 * Usage per person, per kind of event.
 *
 * Grouped by the person and NOT by their area, even though the area cut is one
 * of the metrics: `evento_uso` has no area column, the area lives on `usuario`,
 * and a person's area can be corrected at their next sign-in. Counting people
 * and folding them into areas afterwards means one number moves when somebody
 * transfers; grouping by a denormalised area would mean their history splits in
 * two and neither half is right.
 *
 * It also answers adoption's numerator: whoever appears here used the portal in
 * this period.
 */
export async function agregarPorUsuario(
  client: AnaliticaClient,
  periodo: Periodo,
): Promise<ConteoPorUsuario[]> {
  const filas = await client.eventoUso.groupBy({
    by: ["usuarioId", "tipoEvento"],
    where: { fecha: enPeriodo(periodo) },
    _count: { _all: true },
  });

  return filas.map((fila) => ({
    usuarioId: fila.usuarioId,
    tipoEvento: fila.tipoEvento as TipoEvento,
    total: fila._count._all,
  }));
}

/**
 * Suggestions per author, per state.
 *
 * BY `fecha_creacion`, so a suggestion belongs to the period it was SENT in and
 * stays there. The alternative — filing it by the date of its last state change
 * — would move an idea from one month to another every time somebody reviewed
 * it, and the count of "sugerencias recibidas" would change retroactively.
 *
 * `estado` is the CURRENT state of those suggestions, which is what the PRD's
 * "distribución por estado" means: of what arrived in this period, where does it
 * stand now. The ledger in `historial_sugerencia` is what answers "when did it
 * move", and no screen in this item asks that.
 *
 * By AUTHOR and not by `area_destino`: the PRD says "por área de origen", which
 * is the area of the person who wrote it. Both columns exist and they answer
 * different questions — where the idea came from, and who it is aimed at.
 */
export async function agregarSugerencias(
  client: AnaliticaClient,
  periodo: Periodo,
): Promise<ConteoDeSugerencias[]> {
  const filas = await client.sugerencia.groupBy({
    by: ["autorId", "estado"],
    where: { fechaCreacion: enPeriodo(periodo) },
    _count: { _all: true },
  });

  return filas.map((fila) => ({
    autorId: fila.autorId,
    estado: fila.estado as EstadoSugerencia,
    total: fila._count._all,
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
 *  THE DIMENSIONS
 * ══════════════════════════════════════════════════════════════════════════ */

/** One resource, as the ranking names it. */
export interface RecursoDimension {
  id: number;
  nombre: string;
  activo: boolean;
}

/** One person, plus whether they hold any access at all. */
export interface UsuarioDimension {
  id: number;
  nombre: string;
  area: string;
  activo: boolean;
  /** True when this account holds at least one grant, of either kind. */
  conAcceso: boolean;
}

export interface Dimensiones {
  enlaces: RecursoDimension[];
  procesadores: RecursoDimension[];
  usuarios: UsuarioDimension[];
}

/**
 * `usuario.area` is NOT NULL with an empty default; the generated client types
 * it more loosely than the column, so the two are reconciled here once — the
 * same reconciliation `lib/usuarios/repository.ts` performs.
 */
function normalizarArea(area: string | null): string {
  return area ?? "";
}

/**
 * The three small tables that give the numbers their names.
 *
 * DEACTIVATED ROWS ARE INCLUDED, all of them, and that is not an oversight. A
 * resource retired last week was used the week before, and hiding it would make
 * the events it produced disappear from a ranking that is supposed to explain
 * what happened. The same for a person who has left. Whether to DRAW them
 * differently is item #19's decision, and `activo` travels so that it can.
 *
 * Adoption's denominator is read here too, as a boolean per account rather than
 * as a count: the metric asks how many people HOLD access, and eleven grants
 * held by one person is one person.
 */
export async function leerDimensiones(client: AnaliticaClient): Promise<Dimensiones> {
  const [enlaces, procesadores, usuarios] = await Promise.all([
    client.enlace.findMany({ select: { id: true, nombre: true, activo: true } }),
    client.procesador.findMany({ select: { id: true, nombre: true, activo: true } }),
    client.usuario.findMany({
      select: {
        id: true,
        nombre: true,
        area: true,
        activo: true,
        _count: { select: { asignacionesEnlace: true, asignacionesProcesador: true } },
      },
    }),
  ]);

  return {
    enlaces,
    procesadores,
    usuarios: usuarios.map(({ _count, area, ...identidad }) => ({
      ...identidad,
      area: normalizarArea(area),
      conAcceso: _count.asignacionesEnlace + _count.asignacionesProcesador > 0,
    })),
  };
}
