import type { PrismaClient } from "@prisma/client";

/**
 * The database reads the assignment screens perform over `usuario`.
 *
 * The Prisma client is a parameter and not a module import, exactly as in
 * `lib/asignaciones/repository.ts` and `lib/authz/repository.ts`: production
 * passes the singleton, the suite passes a double and never reaches SQL Server.
 *
 * WHY NOT IN `lib/asignaciones/`. That module is the WRITE side of a grant, and
 * every function in it takes one user AND one resource. These two take no
 * resource at all: they answer "who is there to assign to" and "what does this
 * person already hold", which are questions about the `usuario` row.
 *
 * NEITHER READ IS EXPOSED AS AN ENDPOINT. There is no `GET .../asignaciones`,
 * on purpose (see the route files): the screens are Server Components that read
 * these directly, so a second way to be right about the same rows never exists.
 */

/** The slice of Prisma these functions use. */
export type UsuariosClient = Pick<PrismaClient, "usuario">;

/** One account as the picker lists it: who they are, and how much they hold. */
export interface UsuarioListadoDTO {
  id: number;
  nombre: string;
  correo: string;
  /** May be the empty string — Entra ID does not always report a department. */
  area: string;
  esAdmin: boolean;
  activo: boolean;
  enlacesAsignados: number;
  procesadoresAsignados: number;
}

/** One account with everything it has been granted, by identifier. */
export interface UsuarioAsignacionesDTO {
  id: number;
  nombre: string;
  correo: string;
  area: string;
  esAdmin: boolean;
  activo: boolean;
  /** Ids of the `enlace` rows this account holds a grant over. */
  enlaces: number[];
  /** Ids of the `procesador` rows this account holds a grant over. */
  procesadores: number[];
}

/**
 * `usuario.area` is NOT NULL with an empty default, precisely so nothing
 * downstream branches on NULL: the schema says the empty string IS the "no
 * department reported by Entra ID" bucket. The generated client types it more
 * loosely than the column, so the two are reconciled here once.
 */
function normalizarArea(area: string | null): string {
  return area ?? "";
}

/** The six identity columns both reads share. */
const SELECT_IDENTIDAD = {
  id: true,
  nombre: true,
  correo: true,
  area: true,
  esAdmin: true,
  activo: true,
} as const;

/**
 * Every account in the portal, by name.
 *
 * No `where` clause, deliberately, and for the same reason the catalogues have
 * none: an administrator has to see a deactivated account, if only to strip the
 * grants it left behind — which the API allows precisely so those rows do not
 * get stranded. Whether such an account may RECEIVE a grant is decided by
 * `lib/asignaciones/handlers.ts`, not by hiding the row here.
 *
 * The two counts are read in the same round trip because they are what makes
 * the picker worth reading: an account with no access at all looks exactly like
 * one with twelve grants otherwise.
 */
export async function listarUsuarios(client: UsuariosClient): Promise<UsuarioListadoDTO[]> {
  const rows = await client.usuario.findMany({
    select: {
      ...SELECT_IDENTIDAD,
      _count: { select: { asignacionesEnlace: true, asignacionesProcesador: true } },
    },
    orderBy: { nombre: "asc" },
  });

  return rows.map(({ _count, area, ...identidad }) => ({
    ...identidad,
    area: normalizarArea(area),
    enlacesAsignados: _count.asignacionesEnlace,
    procesadoresAsignados: _count.asignacionesProcesador,
  }));
}

/**
 * One account and the identifiers of everything granted to it, or `null`.
 *
 * IDENTIFIERS, NOT ROWS. The catalogues come whole from their own repositories,
 * and what this adds is which of them are already granted. Joining the
 * resources in here would produce a second, partial copy of each catalogue
 * holding only the granted half — and the screen needs the other half most of
 * all: it is the half with switches still to turn on.
 */
export async function leerUsuarioConAsignaciones(
  client: UsuariosClient,
  usuarioId: number,
): Promise<UsuarioAsignacionesDTO | null> {
  const row = await client.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      ...SELECT_IDENTIDAD,
      asignacionesEnlace: { select: { enlaceId: true } },
      asignacionesProcesador: { select: { procesadorId: true } },
    },
  });

  if (row === null) {
    return null;
  }

  const { asignacionesEnlace, asignacionesProcesador, area, ...identidad } = row;

  return {
    ...identidad,
    area: normalizarArea(area),
    enlaces: asignacionesEnlace.map((asignacion) => asignacion.enlaceId),
    procesadores: asignacionesProcesador.map((asignacion) => asignacion.procesadorId),
  };
}
