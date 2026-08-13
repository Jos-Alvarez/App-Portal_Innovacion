import type { PrismaClient } from "@prisma/client";

import type { ActualizarEnlace, CrearEnlace, TipoEnlace } from "@/lib/enlaces/schema";

/**
 * The database reads and writes the enlaces catalogue performs.
 *
 * The Prisma client is a parameter and not a module import, exactly as in
 * `lib/authz/repository.ts` and `lib/auth/usuario-repository.ts`: production
 * passes the singleton, the suite passes a double and never reaches SQL Server.
 *
 * Every query selects the same narrow column set — the six the API actually
 * sends to the browser — so a column added to `enlace` later (a note, an owner,
 * an internal token) does not silently start travelling to every client.
 */

/** The slice of Prisma these functions use. */
export type EnlacesClient = Pick<PrismaClient, "enlace">;

/**
 * One `enlace` as the API hands it to the browser.
 *
 * `tipo` is narrowed to the vocabulary here, and it is the one place a claim is
 * made that the database cannot make in the type system: Prisma has no enums on
 * SQL Server, so the column is a plain string. What holds the claim up is a
 * pair of guarantees on either side of it — the `enlace_tipo_check` constraint
 * refuses any other value at the database, and `crearEnlaceSchema` refuses it
 * before the write. Widening this to `string` instead would push the same
 * uncertainty onto every screen that renders a type chip.
 */
export interface EnlaceDTO {
  id: number;
  nombre: string;
  descripcion: string | null;
  url: string;
  tipo: TipoEnlace;
  activo: boolean;
}

/** The six columns of `EnlaceDTO`, as Prisma's `select`. */
const SELECT_DTO = {
  id: true,
  nombre: true,
  descripcion: true,
  url: true,
  tipo: true,
  activo: true,
} as const;

/** Narrows the row Prisma types as `tipo: string` into the DTO. */
function toDTO(row: Omit<EnlaceDTO, "tipo"> & { tipo: string }): EnlaceDTO {
  return { ...row, tipo: row.tipo as TipoEnlace };
}

/**
 * The whole catalogue, active rows and bajas alike.
 *
 * No `where` clause, deliberately. This read serves the administration screen,
 * whose job includes seeing what was deactivated and putting it back; the
 * collaborator's view of a resource is filtered elsewhere, by the authorization
 * guard, which denies a grant whose resource has `activo = false`. Filtering
 * here as well would not add safety — the guard is the thing standing between a
 * collaborator and an inactive resource — and would remove the administrator's
 * only way to see a row they just took down.
 */
export async function listarEnlaces(client: EnlacesClient): Promise<EnlaceDTO[]> {
  const rows = await client.enlace.findMany({
    select: SELECT_DTO,
    orderBy: { nombre: "asc" },
  });

  return rows.map(toDTO);
}

/**
 * Registers a new enlace.
 *
 * `activo` is not written: the column defaults to `true`, so a new enlace is
 * usable immediately and the flag has exactly one writer — the baja.
 */
export async function crearEnlace(client: EnlacesClient, datos: CrearEnlace): Promise<EnlaceDTO> {
  return toDTO(
    await client.enlace.create({
      data: {
        nombre: datos.nombre,
        /* An omitted description is `undefined` after parsing; the column takes NULL. */
        descripcion: datos.descripcion ?? null,
        url: datos.url,
        tipo: datos.tipo,
      },
      select: SELECT_DTO,
    }),
  );
}

/**
 * Applies a partial edit.
 *
 * `cambios` is passed through as parsed, which is exactly right for a PATCH:
 * the schema only ever produces the keys the request actually carried, and
 * Prisma leaves a column alone when its key is absent. A `descripcion: null`
 * that IS present is therefore a deliberate blanking, and is honoured.
 *
 * A missing row surfaces as Prisma's P2025 rather than as a silent no-op, which
 * `errorDePrisma` turns into the same 404 any other unknown id gets.
 */
export async function actualizarEnlace(
  client: EnlacesClient,
  id: number,
  cambios: ActualizarEnlace,
): Promise<EnlaceDTO> {
  return toDTO(
    await client.enlace.update({
      where: { id },
      data: cambios,
      select: SELECT_DTO,
    }),
  );
}

/**
 * The baja: a LOGICAL delete.
 *
 * The row survives, and three things depend on that. `asignacion_enlace` rows
 * reference this id; the analytics events of ADR 0010 reference it too, with no
 * foreign key to stop a hard delete from orphaning them; and the authorization
 * guard already reads `activo = false` as "no access" (`authorizeGrant` denies
 * `inactive-resource`). Flipping the flag is what every one of those is already
 * written to expect — removing the row is what none of them survive.
 */
export async function darDeBajaEnlace(client: EnlacesClient, id: number): Promise<EnlaceDTO> {
  return toDTO(
    await client.enlace.update({
      where: { id },
      data: { activo: false },
      select: SELECT_DTO,
    }),
  );
}
