import type { PrismaClient } from "@prisma/client";

import { RolRechazado } from "@/lib/admins/errors";
import { RESULTADOS_MAX } from "@/lib/admins/schema";

/**
 * The database reads and writes of the administrator-management screen —
 * backlog item #17, under ADR 0009.
 *
 * The Prisma client is a parameter and not a module import, exactly as in
 * `lib/usuarios/repository.ts` and `lib/authz/repository.ts`: production passes
 * the singleton, the suite passes a double and never reaches SQL Server.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS NOT PART OF `lib/usuarios/repository.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * That module answers "who is there to assign to" and "what does this person
 * already hold" — two reads that exist to serve the assignment screens. These
 * functions WRITE `usuario.es_admin`, which is the portal's single source of
 * truth for authorization (ADR 0009), under a rule no other module has: the
 * portal must never be left without an administrator. Putting a transactional
 * privilege change next to two reads about grants would invite the next person
 * to reuse the file's client slice, and that slice carries no `$transaction`.
 */

/**
 * The slice of Prisma these functions use.
 *
 * `$transaction` is in it because BOTH writes need atomicity, and the read of
 * the rule and the write it protects cannot be two round trips — see
 * `revocarAdministrador`.
 */
export type AdminsClient = Pick<PrismaClient, "usuario" | "$transaction">;

/** One account holding the administrator role, as the screen lists it. */
export interface AdministradorDTO {
  id: number;
  nombre: string;
  correo: string;
  /** May be the empty string — Entra ID does not always report a department. */
  area: string;
  activo: boolean;
}

/** One person a search found, and what the portal already knows about them. */
export interface PersonaDelPortal extends AdministradorDTO {
  esAdmin: boolean;
}

/**
 * `usuario.area` is NOT NULL with an empty default, precisely so nothing
 * downstream branches on NULL: the schema says the empty string IS the "no
 * department reported by Entra ID" bucket. The generated client types it more
 * loosely than the column, so the two are reconciled here once — the same
 * reconciliation `lib/usuarios/repository.ts` performs.
 */
function normalizarArea(area: string | null): string {
  return area ?? "";
}

/** The columns every read in this module selects. */
const SELECT_PERSONA = {
  id: true,
  nombre: true,
  correo: true,
  area: true,
  activo: true,
  esAdmin: true,
} as const;

interface FilaPersona {
  id: number;
  nombre: string;
  correo: string;
  area: string | null;
  activo: boolean;
  esAdmin: boolean;
}

function toPersona(fila: FilaPersona): PersonaDelPortal {
  return {
    id: fila.id,
    nombre: fila.nombre,
    correo: fila.correo,
    area: normalizarArea(fila.area),
    activo: fila.activo,
    esAdmin: fila.esAdmin,
  };
}

function toAdministrador({ esAdmin: _esAdmin, ...persona }: PersonaDelPortal): AdministradorDTO {
  return persona;
}

/**
 * Everyone who currently holds the role, by name.
 *
 * A deactivated administrator is listed rather than hidden, for the reason the
 * assignment picker lists a deactivated account: the row still holds a role, and
 * this screen is the only place it can be taken away. Hiding it would strand a
 * privilege nobody can see and nobody can remove.
 */
export async function listarAdministradores(client: AdminsClient): Promise<AdministradorDTO[]> {
  const filas = await client.usuario.findMany({
    where: { esAdmin: true },
    select: SELECT_PERSONA,
    orderBy: { nombre: "asc" },
  });

  return filas.map((fila) => toAdministrador(toPersona(fila)));
}

/**
 * People the portal already knows, matched by name or address.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS IS THE DEGRADED SEARCH OF ADR 0009, AND IT IS ALSO ALWAYS USED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0009 names it as the mitigation for TI not consenting to the Graph
 * `User.Read.All` permission: "buscar solo entre usuarios que ya iniciaron
 * sesión alguna vez en el portal". But it is not only a fallback — when the
 * directory IS reachable, this read is what tells the screen which of the people
 * Graph returned already exist here and which of those already hold the role.
 * Without it the screen would offer to promote somebody who is an administrator
 * already, and TECH-DESIGN asks for the opposite.
 *
 * NO `mode: "insensitive"`. Prisma only supports that flag on PostgreSQL and
 * MongoDB — on `sqlserver` it does not exist, and case-insensitivity comes from
 * the column's collation instead (the SQL Server defaults are `_CI_`). Passing
 * the flag would not compile; assuming a case-sensitive collation and
 * lowercasing both sides in TypeScript would mean reading the whole table into
 * the application to filter it.
 */
export async function buscarUsuariosDelPortal(
  client: AdminsClient,
  termino: string,
): Promise<PersonaDelPortal[]> {
  const filas = await client.usuario.findMany({
    where: {
      OR: [{ nombre: { contains: termino } }, { correo: { contains: termino } }],
    },
    select: SELECT_PERSONA,
    orderBy: { nombre: "asc" },
    take: RESULTADOS_MAX,
  });

  return filas.map(toPersona);
}

/**
 * The portal rows for a known set of addresses.
 *
 * This is the enrichment half of a directory search: Graph knows who exists in
 * the company, and only `usuario` knows which of them have signed in, which are
 * deactivated and which already hold the role. Matching on the exact addresses
 * the directory returned — rather than running the term against this table too —
 * is what keeps the two lists aligned: a person Graph matched by their display
 * name may be spelled differently in `usuario.nombre`, and a second `contains`
 * search would simply miss them and offer to promote somebody who is already an
 * administrator.
 *
 * An empty list of addresses short-circuits: `IN ()` is not a query worth a
 * round trip.
 */
export async function leerUsuariosPorCorreos(
  client: AdminsClient,
  correos: readonly string[],
): Promise<PersonaDelPortal[]> {
  if (correos.length === 0) {
    return [];
  }

  const filas = await client.usuario.findMany({
    where: { correo: { in: [...correos] } },
    select: SELECT_PERSONA,
  });

  return filas.map(toPersona);
}

/** One account by its address — the identity key of the upsert (ADR 0009). */
export async function leerUsuarioPorCorreo(
  client: AdminsClient,
  correo: string,
): Promise<PersonaDelPortal | null> {
  const fila = await client.usuario.findUnique({ where: { correo }, select: SELECT_PERSONA });

  return fila === null ? null : toPersona(fila);
}

/** The identity a promotion writes when the person has never signed in. */
export interface PersonaAPromover {
  correo: string;
  nombre: string;
  area: string;
}

/**
 * Grants the administrator role, creating the `usuario` row if the person has
 * never signed in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ADR 0009 ASKS FOR AN UPSERT, AND THE REASON IS THE PRODUCT'S
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Al promover, se hace upsert del usuario en la tabla `usuario` con
 * `es_admin = 1`." The PRD lets an administrator promote somebody found in the
 * COMPANY DIRECTORY, not somebody found in the portal — so the person may have
 * no row here at all, and requiring them to sign in first would make the
 * directory search pointless. When they do sign in, the login's own upsert
 * refreshes their name and area and leaves `es_admin` alone
 * (`lib/auth/usuario-repository.ts`), so the role granted here survives.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE READ AND THE WRITE ARE ONE TRANSACTION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Already an administrator" and "deactivated account" are refusals, and a
 * refusal decided from a row that changed before the write is a refusal about a
 * world that no longer exists. Inside `$transaction` the row the rule was
 * decided on is the row that gets written.
 *
 * The isolation level is deliberately NOT raised here, unlike in the revocation:
 * there is no invariant across ROWS to protect — only this one row — and the one
 * race that remains (two administrators promoting the same new person at the
 * same instant) is caught by the unique index on `correo` and answered as a
 * conflict the caller can retry (`errorDeRol`, P2002).
 *
 * @throws RolRechazado when the account is deactivated or already holds the role.
 */
export async function promoverAAdministrador(
  client: AdminsClient,
  persona: PersonaAPromover,
): Promise<AdministradorDTO> {
  return client.$transaction(async (tx) => {
    const actual = await tx.usuario.findUnique({
      where: { correo: persona.correo },
      select: SELECT_PERSONA,
    });

    if (actual === null) {
      const creada = await tx.usuario.create({
        data: {
          correo: persona.correo,
          nombre: persona.nombre,
          area: persona.area,
          esAdmin: true,
        },
        select: SELECT_PERSONA,
      });

      return toAdministrador(toPersona(creada));
    }

    if (!actual.activo) {
      throw new RolRechazado("dado_de_baja");
    }

    if (actual.esAdmin) {
      throw new RolRechazado("ya_es_admin");
    }

    /*
     * Only the role is written. The name and the area of somebody who has signed
     * in belong to their own login, which refreshes them from Entra ID on every
     * visit; overwriting them here with what a directory search returned would
     * make this screen a second, worse source of identity.
     */
    const actualizada = await tx.usuario.update({
      where: { id: actual.id },
      data: { esAdmin: true },
      select: SELECT_PERSONA,
    });

    return toAdministrador(toPersona(actualizada));
  });
}

/**
 * Takes the administrator role away, under the one rule the PRD states as hard:
 * the portal never reaches zero administrators.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE COUNT HAPPENS *AFTER* THE UPDATE, INSIDE THE SAME TRANSACTION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The intuitive shape — count first, refuse if the count is 1, then update — is
 * wrong, and not subtly. Two administrators are left, A and B. One transaction
 * revokes A, another revokes B, at the same instant. Both count 2, both accept,
 * both update: the portal ends with zero administrators and neither request was
 * ever told anything was wrong. TECH-DESIGN names exactly this case — "nunca 0
 * admins, ni con dos revocaciones simultáneas".
 *
 * Counting after the update makes the number mean "how many are left if this
 * commits", which is the number the rule is actually about. Zero throws, and the
 * throw rolls back the `es_admin = 0` that produced it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  AND THAT STILL NEEDS `Serializable`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Under SQL Server's default READ COMMITTED, the two transactions above cannot
 * see each other's uncommitted updates, so both would count 1 remaining
 * administrator — each seeing the other still in place — and both would commit.
 * The invariant spans rows the transaction never wrote, which is precisely what
 * range locks are for. Serializable makes one of the two fail; Prisma surfaces
 * that as P2034, and `errorDeRol` turns it into a retry the reader understands.
 *
 * The cost is bounded: this table is small, the transaction is two statements
 * long, and a role change is a rare administrative act — not a request path.
 *
 * `correoFijado` is the `ADMIN_EMAIL` break-glass account, already normalized.
 * It is refused HERE, where the row's address is known, rather than in the route
 * — the route holds an id, and resolving the address there would mean an extra
 * read of the very row this transaction is about to lock.
 *
 * @throws RolRechazado for every refusal, which is what rolls the change back.
 */
export async function revocarAdministrador(
  client: AdminsClient,
  usuarioId: number,
  correoFijado: string,
): Promise<AdministradorDTO> {
  return client.$transaction(
    async (tx) => {
      const actual = await tx.usuario.findUnique({
        where: { id: usuarioId },
        select: SELECT_PERSONA,
      });

      if (actual === null) {
        throw new RolRechazado("no_encontrado");
      }

      if (!actual.esAdmin) {
        throw new RolRechazado("no_es_admin");
      }

      /* A revocation the next sign-in would undo is refused rather than
         accepted — see `cuentaFijada` in `errors.ts`. */
      if (correoFijado !== "" && actual.correo.toLowerCase() === correoFijado) {
        throw new RolRechazado("cuenta_fijada");
      }

      /*
       * `updateMany` and not `update` because only the `many` form takes a
       * non-unique `where` and reports how many rows it matched. Conditioning on
       * `esAdmin: true` is what makes a lost update visible: it matches at most
       * one row — `id` is the primary key.
       */
      const { count } = await tx.usuario.updateMany({
        where: { id: usuarioId, esAdmin: true },
        data: { esAdmin: false },
      });

      if (count !== 1) {
        throw new RolRechazado("conflicto");
      }

      const restantes = await tx.usuario.count({ where: { esAdmin: true } });

      if (restantes < 1) {
        throw new RolRechazado("ultimo_admin");
      }

      return toAdministrador(toPersona({ ...actual, esAdmin: false }));
    },
    { isolationLevel: "Serializable" },
  );
}
