import type { PrismaClient } from "@prisma/client";

import type { TipoEnlace } from "@/lib/enlaces/schema";

/**
 * What one collaborator was assigned, read as a single list.
 *
 * The Prisma client is a parameter and not a module import, exactly as in
 * `lib/enlaces/repository.ts` and `lib/authz/repository.ts`: production passes
 * the singleton, the suite passes a double and never reaches SQL Server.
 *
 * This is the first read in the portal written for a collaborator rather than
 * for an administrator, and the difference shows in every clause below. The
 * admin catalogues list everything and let the guard filter per use; this one is
 * filtered at the query, by the user asking and by the resource still being
 * active, because what it produces is a page of things the reader is invited to
 * click.
 */

/** The slice of Prisma these functions use. */
export type MisRecursosClient = Pick<
  PrismaClient,
  "asignacionEnlace" | "asignacionProcesador" | "enlace"
>;

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE UNIFIED SHAPE: ONE VOCABULARY OF THREE, NOT TWO SHAPES SIDE BY SIDE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * An `enlace` already carries a type of its own — `app` or `agente` — and a
 * `procesador` is a third kind of thing entirely. The dashboard shows all three
 * in ONE list with one chip per row, so this type flattens them into one
 * vocabulary instead of exposing ADR 0002's two-table split to the screen.
 *
 * Why not a second field naming the table. It would be derivable from this one
 * (`tipo === "procesador"`) and therefore able to disagree with it after a
 * future edit, and the screen has no question it would answer: an `app` and an
 * `agente` are opened the same way, a `procesador` is executed, and `tipo`
 * already says which.
 *
 * Why the pair (`tipo`, `id`) is safe as a key. `tipo` determines which table
 * the id came from, so an enlace and a procesador that happen to share an id
 * are still two distinct entries — which is what lets a row be identified, and
 * its action built, from these two fields alone.
 *
 * WHAT IS DELIBERATELY MISSING IS `url`. The dashboard links to
 * `/api/enlaces/{id}/abrir`, never to the destination, so the external address
 * has no reason to reach the browser. A field that is never selected cannot
 * leak from a page left open after the grant was revoked, from a cached
 * response, or from a screenshot — and the redirect route is the only place
 * that needs it, one authorised request at a time.
 *
 * A `procesador` has no execution contract here either (its formats, its size
 * caps). The dashboard names it and shows its chip; the execution screen that
 * needs those columns is item #10.
 */
export type TipoRecursoAsignado = TipoEnlace | "procesador";

export interface RecursoAsignado {
  tipo: TipoRecursoAsignado;
  id: number;
  nombre: string;
  descripcion: string | null;
}

/** The columns of an assigned enlace the dashboard renders — `url` is not one. */
const SELECT_ENLACE = {
  enlace: { select: { id: true, nombre: true, descripcion: true, tipo: true } },
} as const;

/** The columns of an assigned procesador the dashboard renders. */
const SELECT_PROCESADOR = {
  procesador: { select: { id: true, nombre: true, descripcion: true } },
} as const;

/**
 * One alphabetical list rather than two blocks.
 *
 * The collaborator is looking for a resource by name; which of ADR 0002's two
 * tables it lives in is an implementation detail they have no reason to learn.
 * `localeCompare` with the Spanish locale is what puts `Nómina` before `Nube`
 * instead of after it, which is where a reader expects to find it.
 *
 * The tie-break on `tipo` and `id` is not decoration: two resources may share a
 * name, and without it their order would depend on how the database happened to
 * return the rows, so the list could reshuffle between two revalidations that
 * changed nothing.
 */
function porNombre(a: RecursoAsignado, b: RecursoAsignado): number {
  return (
    a.nombre.localeCompare(b.nombre, "es") || a.tipo.localeCompare(b.tipo) || a.id - b.id
  );
}

/**
 * Everything this user may currently use, from both grant tables.
 *
 * TWO FILTERS, BOTH LOAD-BEARING.
 *
 * `usuarioId` scopes each read at the query, so another collaborator's rows are
 * never in memory in the first place and no later filter is the one thing
 * keeping them off the page.
 *
 * `activo: true` on the resource leaves out anything given de baja. The guard
 * already denies a grant over an inactive resource on any attempted use
 * (`authorizeGrant` answers `inactive-resource`), so listing one would put a row
 * on the dashboard whose only possible outcome is a 403 — the portal offering
 * something it will refuse.
 *
 * The two reads are irreducible, exactly as in `readGrant`: ADR 0002 gives the
 * grants no shared parent, so there is no single table to query.
 */
export async function listarRecursosAsignados(
  client: MisRecursosClient,
  usuarioId: number,
): Promise<RecursoAsignado[]> {
  const [enlaces, procesadores] = await Promise.all([
    client.asignacionEnlace.findMany({
      where: { usuarioId, enlace: { activo: true } },
      select: SELECT_ENLACE,
    }),
    client.asignacionProcesador.findMany({
      where: { usuarioId, procesador: { activo: true } },
      select: SELECT_PROCESADOR,
    }),
  ]);

  const recursos: RecursoAsignado[] = [
    ...enlaces.map((fila) => ({
      /*
       * The enlace's own `app` | `agente`, narrowed here for the same reason
       * `lib/enlaces/repository.ts` narrows it: Prisma has no enums on SQL
       * Server, and the value is held up by the `enlace_tipo_check` constraint
       * at the database and by `crearEnlaceSchema` before every write.
       */
      tipo: fila.enlace.tipo as TipoEnlace,
      id: fila.enlace.id,
      nombre: fila.enlace.nombre,
      descripcion: fila.enlace.descripcion,
    })),
    ...procesadores.map((fila) => ({
      tipo: "procesador" as const,
      id: fila.procesador.id,
      nombre: fila.procesador.nombre,
      descripcion: fila.procesador.descripcion,
    })),
  ];

  return recursos.sort(porNombre);
}

/**
 * The destination of one enlace, or `null` when there is no such row.
 *
 * One column, and only the redirect route calls it. By the time it runs, the
 * guard has already established who is asking and that they hold a usable grant
 * over this exact row, so the address is the only thing left to learn.
 *
 * Deliberately NOT filtered by `activo`. The guard denies a grant over an
 * inactive resource before this is reached, and repeating the rule here would
 * put a second, weaker copy of it somewhere a later edit could make the two
 * disagree — with the weaker copy winning silently.
 */
export async function leerUrlDeEnlace(
  client: MisRecursosClient,
  id: number,
): Promise<string | null> {
  const fila = await client.enlace.findUnique({ where: { id }, select: { url: true } });

  return fila ? fila.url : null;
}
