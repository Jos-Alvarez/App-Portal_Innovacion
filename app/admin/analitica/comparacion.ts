import type {
  AreaActiva,
  ErroresDeProcesador,
  Metricas,
  RecursoUsado,
  UsuarioActivo,
} from "@/lib/analitica/metricas";

/**
 * The arithmetic of "vs. el periodo anterior" — pure, and therefore the part of
 * this screen that can be argued about in a test rather than in a browser.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A ROW MISSING FROM THE PREVIOUS PERIOD IS A ZERO, NOT AN UNKNOWN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `lib/analitica/metricas.ts` states its own rule: "zero is a result and absence
 * is not" — a resource nobody opened is simply not in the list. Read from the
 * PREVIOUS period, that absence has exactly one meaning: it was used zero times.
 * So every lookup here falls back to zero rather than to "—".
 *
 * The consequence is worth stating because it is the interesting case: a
 * procesador that appears this week and did not exist last week shows `+14`,
 * which is true. It was used fourteen more times than before.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE COMPARISON NEVER ADDS ROWS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Only the rows of the CURRENT period are drawn. A resource used last week and
 * not this one drops off the ranking instead of appearing at zero with a
 * negative delta, because the ranking answers "what is being used", and a list
 * ordered by use with unused things in it is no longer that list. The totals in
 * the summary still carry the drop — that is what the summary is for.
 */

/** The composite identity of a resource: the id alone is not unique across the two tables. */
export function claveDeRecurso(recurso: { tipo: string; id: number }): string {
  return `${recurso.tipo}:${recurso.id}`;
}

/** A period's ranking, addressable by resource. */
export function indiceDeRecursos(recursos: readonly RecursoUsado[]): Map<string, RecursoUsado> {
  return new Map(recursos.map((recurso) => [claveDeRecurso(recurso), recurso]));
}

/** A period's activity, addressable by person. */
export function indiceDeUsuarios(usuarios: readonly UsuarioActivo[]): Map<number, UsuarioActivo> {
  return new Map(usuarios.map((usuario) => [usuario.id, usuario]));
}

/** A period's area cut, addressable by area — `""` included, as its own bucket. */
export function indiceDeAreas(areas: readonly AreaActiva[]): Map<string, AreaActiva> {
  return new Map(areas.map((area) => [area.area, area]));
}

/** A period's failures, addressable by procesador. */
export function indiceDeErrores(
  errores: readonly ErroresDeProcesador[],
): Map<number, ErroresDeProcesador> {
  return new Map(errores.map((fila) => [fila.id, fila]));
}

/** One figure against its equivalent in the previous period. */
export interface Variacion {
  /** What the same question answered for the period before. */
  anterior: number;
  /** `actual − anterior`. Negative means it fell. */
  diferencia: number;
}

/** A figure and the one it is compared against. */
export function variacion(actual: number, anterior: number): Variacion {
  return { anterior, diferencia: actual - anterior };
}

/**
 * Everything the portal was used for in a period, as one number.
 *
 * Summed over the RANKING and not over the people, even though the two are the
 * same total by construction — every event has both a resource and an author.
 * The ranking is the list this figure sits above, so a reader adding the column
 * up by hand gets the number in the card, which is the only way a summary earns
 * being believed.
 *
 * Errors are not in it: `usos` is `aperturas + ejecuciones`, and
 * `lib/analitica/metricas.ts` keeps failed attempts out of that sum on purpose.
 */
export function totalDeUsos(metricas: Metricas): number {
  return metricas.recursos.reduce((total, recurso) => total + recurso.usos, 0);
}

/** Every failed attempt in the period, across all procesadores and kinds. */
export function totalDeErrores(metricas: Metricas): number {
  return metricas.errores.reduce((total, fila) => total + fila.total, 0);
}

/**
 * The five figures of the summary strip, in the order they are drawn.
 *
 * Assembled here rather than inline in the component so that the comparison and
 * the value it compares are computed in the same expression: a card showing this
 * period's total beside the previous period's adoption is the one bug this strip
 * can have, and it is not a bug a rendering test would notice.
 */
export interface Resumen {
  usos: number;
  activos: number;
  conAcceso: number;
  sugerencias: number;
  errores: number;
}

export function resumenDe(metricas: Metricas): Resumen {
  return {
    usos: totalDeUsos(metricas),
    activos: metricas.adopcion.activos,
    conAcceso: metricas.adopcion.conAcceso,
    sugerencias: metricas.sugerencias.total,
    errores: totalDeErrores(metricas),
  };
}
