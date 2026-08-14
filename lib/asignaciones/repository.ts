import type { PrismaClient } from "@prisma/client";

import { type RecursoTipo, esFilaAusente, esFilaYaExistente } from "@/lib/asignaciones/errors";

/**
 * The database reads and writes an assignment performs.
 *
 * The Prisma client is a parameter and not a module import, exactly as in
 * `lib/enlaces/repository.ts` and `lib/authz/repository.ts`: production passes
 * the singleton, the suite passes a double and never reaches SQL Server.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY EVERY FUNCTION BRANCHES ON THE TYPE INSTEAD OF BEING WRITTEN TWICE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0002 splits the grants into two tables with no shared parent, so there is
 * no single `asignacion` delegate to call — the branch is irreducible, exactly
 * as it is in `readGrant` in `lib/authz/repository.ts`, which reads these same
 * two tables. The branch is written out with both table names LITERAL and
 * visible rather than hidden behind a lookup table of delegates, and that is a
 * deliberate refusal to be clever: whoever debugs a collaborator seeing the
 * wrong catalogue needs to read which table a request lands in, not resolve it.
 *
 * The two branches differ in one identifier and nothing else, so the logic
 * around them — what counts as success, what is rethrown — is written once.
 */

/** The slice of Prisma these functions use. */
export type AsignacionesClient = Pick<
  PrismaClient,
  "usuario" | "enlace" | "procesador" | "asignacionEnlace" | "asignacionProcesador"
>;

/**
 * All an assignment decision needs to know about the row at either end: whether
 * it is still active. `null` from either read means "no such row".
 */
export interface FilaAsignable {
  activo: boolean;
}

/**
 * The account that would receive the grant, or `null` when there is none.
 *
 * One column. The name, the e-mail and the admin flag are none of this
 * decision's business, and not selecting them keeps a `usuario` row that grows
 * later out of a path that has no use for it.
 */
export async function leerUsuarioAsignable(
  client: AsignacionesClient,
  usuarioId: number,
): Promise<FilaAsignable | null> {
  return client.usuario.findUnique({ where: { id: usuarioId }, select: { activo: true } });
}

/**
 * The resource the grant would be over, or `null` when there is none.
 *
 * Reports the baja rather than acting on it: whether `activo: false` forbids
 * the operation depends on WHICH operation, and only the handler knows that —
 * a deactivated resource cannot be granted, but must remain revocable.
 */
export async function leerRecursoAsignable(
  client: AsignacionesClient,
  tipo: RecursoTipo,
  recursoId: number,
): Promise<FilaAsignable | null> {
  if (tipo === "enlace") {
    return client.enlace.findUnique({ where: { id: recursoId }, select: { activo: true } });
  }

  return client.procesador.findUnique({ where: { id: recursoId }, select: { activo: true } });
}

/**
 * Grants the resource to the user.
 *
 * IDEMPOTENT, AND THAT IS THE CONTRACT — not a nicety. When this resolves, the
 * grant exists; whether this call is what created it is deliberately NOT
 * reported. A caller that could tell the two apart would eventually answer
 * differently for the second click of a double-click, which is the exact
 * failure PUT exists to prevent.
 *
 * P2002 is therefore success. The composite `@@id([usuarioId, enlaceId])` is
 * the only unique constraint on either table, so a duplicate key can mean
 * nothing except that the row is already there. Everything else is rethrown for
 * `errorDePrisma` to answer — including P2025, which belongs to the revoke path
 * and has no meaning on a create.
 *
 * `create` + catch, rather than `upsert`: there is nothing to update (the row
 * has no columns beyond its key), and Prisma's upsert is not guaranteed to be
 * atomic against a concurrent insert on every connector, so it can raise P2002
 * itself and would need this catch anyway.
 */
export async function asignarRecurso(
  client: AsignacionesClient,
  tipo: RecursoTipo,
  usuarioId: number,
  recursoId: number,
): Promise<void> {
  try {
    if (tipo === "enlace") {
      await client.asignacionEnlace.create({ data: { usuarioId, enlaceId: recursoId } });
    } else {
      await client.asignacionProcesador.create({ data: { usuarioId, procesadorId: recursoId } });
    }
  } catch (error) {
    if (!esFilaYaExistente(error)) {
      throw error;
    }
    /* The grant was already in place. That is the state the caller asked for. */
  }
}

/**
 * Removes the grant.
 *
 * A HARD DELETE, unlike every other "delete" in this codebase. `enlace` and
 * `procesador` are deactivated because rows elsewhere depend on them; an
 * assignment row has no `activo` column to flip, nothing references it, and
 * ADR 0010 already accepts in writing that no assignment history is kept — the
 * adoption metric reads the current snapshot on purpose. There is nothing here
 * to preserve.
 *
 * IDEMPOTENT for the same reason as `asignarRecurso`, mirrored: P2025 means the
 * grant is already gone, which is the state the caller asked for. Everything
 * else is rethrown, including P2002, which belongs to the grant path.
 */
export async function revocarRecurso(
  client: AsignacionesClient,
  tipo: RecursoTipo,
  usuarioId: number,
  recursoId: number,
): Promise<void> {
  try {
    if (tipo === "enlace") {
      await client.asignacionEnlace.delete({
        where: { usuarioId_enlaceId: { usuarioId, enlaceId: recursoId } },
      });
    } else {
      await client.asignacionProcesador.delete({
        where: { usuarioId_procesadorId: { usuarioId, procesadorId: recursoId } },
      });
    }
  } catch (error) {
    if (!esFilaAusente(error)) {
      throw error;
    }
    /* The grant was already gone. That is the state the caller asked for. */
  }
}
