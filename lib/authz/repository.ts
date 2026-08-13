import type { PrismaClient } from "@prisma/client";

import type { RecursoRef, ResourceGrant, UsuarioAuthzRow } from "@/lib/authz/decisions";

/**
 * The database reads authorization performs, one per question it asks.
 *
 * The Prisma client is a parameter and not a module import, exactly as in
 * `lib/auth/usuario-repository.ts`: production passes the singleton, the suite
 * passes a double and never reaches SQL Server. `request-source.ts` is the one
 * place that binds these to the real client.
 *
 * Both reads select the narrowest set of columns they need. That is not
 * micro-optimisation: it keeps a row that grows later (a token, a note, a
 * personal field) from being pulled into a code path that runs on every single
 * authenticated request.
 */

/** The slice of Prisma these functions use. */
export type AuthzClient = Pick<PrismaClient, "usuario" | "asignacionEnlace" | "asignacionProcesador">;

/** The account behind a session's e-mail, or `null` if it no longer exists. */
export async function readUsuarioByCorreo(
  client: AuthzClient,
  correo: string,
): Promise<UsuarioAuthzRow | null> {
  return client.usuario.findUnique({
    where: { correo },
    select: { id: true, correo: true, nombre: true, esAdmin: true, activo: true },
  });
}

/**
 * The grant a user holds over one resource, or `null` when there is none.
 *
 * ADR 0002 splits the grants into two tables with no shared parent, so the two
 * branches are irreducible — there is no single `asignacion` to query. Each one
 * reads through the relation to the resource, which answers "is this grant
 * still usable" in the same round trip as "does this grant exist".
 */
export async function readGrant(
  client: AuthzClient,
  recurso: RecursoRef,
  usuarioId: number,
): Promise<ResourceGrant | null> {
  if (recurso.tipo === "enlace") {
    const row = await client.asignacionEnlace.findUnique({
      where: { usuarioId_enlaceId: { usuarioId, enlaceId: recurso.id } },
      select: { enlace: { select: { activo: true } } },
    });

    return row ? { recursoActivo: row.enlace.activo } : null;
  }

  const row = await client.asignacionProcesador.findUnique({
    where: { usuarioId_procesadorId: { usuarioId, procesadorId: recurso.id } },
    select: { procesador: { select: { activo: true } } },
  });

  return row ? { recursoActivo: row.procesador.activo } : null;
}
