import type { PrismaClient } from "@prisma/client";

import { TransicionRechazada } from "@/lib/sugerencias/errors";
import {
  type CrearSugerencia,
  ESTADO_INICIAL,
  type EstadoSugerencia,
} from "@/lib/sugerencias/schema";

/**
 * The database reads and writes the suggestions box performs.
 *
 * The Prisma client is a parameter and not a module import, exactly as in every
 * other repository here: production passes the singleton, the suite passes a
 * double and never reaches SQL Server.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DATES LEAVE THIS MODULE AS STRINGS, AND THAT IS NOT A DETAIL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Prisma hands back `Date` objects. If the DTO carried them, this screen would
 * hold the same value in two different types depending on how it arrived: the
 * Server Component's props keep a `Date` across the RSC boundary, while the
 * very same list fetched by SWR arrives as JSON and is a `string`. The
 * component would then be right on the first paint and wrong on the first
 * revalidation — a `toLocaleDateString is not a function` that appears a minute
 * after the page loads and never in a test that renders it once.
 *
 * Converting here removes the possibility instead of documenting it. The DTO is
 * what crosses to the browser, so the DTO is where the wire format is decided,
 * and ISO 8601 is the format that survives `JSON.stringify` unambiguously.
 * Turning it into something a person reads is the UI's job.
 */

/**
 * The slice of Prisma these functions use.
 *
 * `usuario` is in it for exactly one column — see `leerAreaDelAutor` at the
 * bottom. It is NOT in `lib/usuarios/repository.ts` because that module opens by
 * declaring what it is ("the database reads the assignment SCREENS perform over
 * `usuario`", neither of them exposed as an endpoint), and a read that prefills
 * a collaborator's form is neither of those things. It is a read the suggestions
 * box performs, so it lives with the suggestions box.
 */
export type SugerenciasClient = Pick<PrismaClient, "sugerencia" | "usuario">;

/**
 * One entry of the ledger — a state transition, as `historial_sugerencia`
 * records it and as the author reads it.
 *
 * `estadoAnterior` is `null` on exactly one entry: the one this item writes
 * when the suggestion is created, because there was no previous state. Every
 * later entry (item #15) carries both ends of the transition.
 *
 * `autor` is a NAME and not an id. ADR 0002 asks the ledger to record "quién lo
 * hizo y cuándo", and the trail is shown to the person who wrote the
 * suggestion: an id would tell them nothing, and the e-mail of the
 * administrator who reviewed it is more than they need to see.
 */
export interface AsientoSugerencia {
  id: number;
  estadoAnterior: EstadoSugerencia | null;
  estadoNuevo: EstadoSugerencia;
  /** ISO 8601, UTC. See the note at the top of this module. */
  fechaCambio: string;
  autor: string;
}

/**
 * One suggestion as the API hands it to its author.
 *
 * `estado` is narrowed to the vocabulary here, and it is the one claim this
 * module makes that the database cannot make in the type system: Prisma has no
 * enums on SQL Server, so the column is a plain string. Two guarantees hold it
 * up — the `sugerencia_estado_check` constraint refuses any other value at the
 * database, and no code path writes anything but `ESTADO_INICIAL`. Widening it
 * to `string` would push the same uncertainty onto every chip that renders it.
 *
 * `grupoId` is deliberately absent. It exists on the row and belongs to item
 * #16; grouping is something the Área de Innovación does for its own
 * convenience, and the PRD is explicit that collaborators neither comment on
 * nor vote on suggestions — so the author has no use for the bucket their idea
 * was filed into, and the API does not send it.
 */
export interface SugerenciaDTO {
  id: number;
  titulo: string;
  descripcion: string;
  areaDestino: string;
  estado: EstadoSugerencia;
  /** ISO 8601, UTC. See the note at the top of this module. */
  fechaCreacion: string;
  /** The full trail, oldest first: the "trazabilidad visible" of item #13. */
  historial: AsientoSugerencia[];
}

/**
 * The columns of `SugerenciaDTO`, as Prisma's `select`.
 *
 * Narrow on purpose, like every other repository here: a column added to
 * `sugerencia` later does not silently start travelling to every browser. Note
 * what is NOT selected — `autorId` and `grupoId` — even though the reader is
 * the author and already knows who they are.
 *
 * The ledger is ordered OLDEST FIRST because it is read as a story: the entry
 * that says the suggestion was sent belongs at the top, and the current state
 * at the bottom. It is ordered by `id` and not by `fechaCambio` because two
 * transitions can share a timestamp — `DATETIME2` is precise, but nothing stops
 * an item #15 batch from writing two entries in the same instant — and an
 * autoincrement id cannot tie.
 */
const SELECT_DTO = {
  id: true,
  titulo: true,
  descripcion: true,
  areaDestino: true,
  estado: true,
  fechaCreacion: true,
  historial: {
    select: {
      id: true,
      estadoAnterior: true,
      estadoNuevo: true,
      fechaCambio: true,
      autor: { select: { nombre: true } },
    },
    orderBy: { id: "asc" },
  },
} as const;

/** The row shape `SELECT_DTO` produces, before the narrowing and the dates. */
interface FilaSugerencia {
  id: number;
  titulo: string;
  descripcion: string;
  areaDestino: string;
  estado: string;
  fechaCreacion: Date;
  historial: {
    id: number;
    estadoAnterior: string | null;
    estadoNuevo: string;
    fechaCambio: Date;
    autor: { nombre: string };
  }[];
}

function toDTO(fila: FilaSugerencia): SugerenciaDTO {
  return {
    id: fila.id,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    areaDestino: fila.areaDestino,
    estado: fila.estado as EstadoSugerencia,
    fechaCreacion: fila.fechaCreacion.toISOString(),
    historial: fila.historial.map((asiento) => ({
      id: asiento.id,
      estadoAnterior: asiento.estadoAnterior as EstadoSugerencia | null,
      estadoNuevo: asiento.estadoNuevo as EstadoSugerencia,
      fechaCambio: asiento.fechaCambio.toISOString(),
      autor: asiento.autor.nombre,
    })),
  };
}

/**
 * Registers a suggestion and opens its ledger, in one write.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE LEDGER ENTRY IS CREATED HERE AND NOT LEFT TO ITEM #15
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `historial_sugerencia.estado_anterior` is nullable, and `prisma/schema.prisma`
 * says what the nullability is for: "NULL for the entry row of a suggestion that
 * has no previous state". That row can only be written at creation.
 *
 * Without it, the trail of a brand-new suggestion is EMPTY, and the backlog asks
 * this item for "listado propio con trazabilidad visible" — a trail that starts
 * only once an administrator touches the suggestion is not visible traceability,
 * it is a gap that happens to close later. It would also make `fecha_creacion`
 * and the ledger tell the same story in two different shapes, which is the split
 * ADR 0002 wrote the ledger to avoid.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE NESTED WRITE, NOT TWO CALLS IN A TRANSACTION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Prisma runs a nested create inside an implicit transaction, so the row and its
 * first ledger entry either both exist or neither does. Doing it as two calls
 * wrapped in `$transaction` would buy the same atomicity, cost the repository's
 * client slice a `$transaction` member, and force every test double to implement
 * one. There is no third statement here that would justify that.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `estado` IS WRITTEN EXPLICITLY, THOUGH THE COLUMN HAS A DEFAULT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This is the opposite of what `crearEnlace` does with `activo`, and the
 * difference is the invariant. There, the default is the only writer of a flag
 * nothing else mirrors. Here, the row's `estado` and its first ledger entry must
 * say the same thing — so taking one from the database's default and the other
 * from a constant in TypeScript would create two sources for one fact, and the
 * day they disagree, the trail contradicts the chip above it. Both come from
 * `ESTADO_INICIAL`.
 *
 * The author signs their own entry (`cambiadoPor: autorId`): they are the one
 * who moved the suggestion into `pendiente` by sending it.
 */
export async function crearSugerencia(
  client: SugerenciasClient,
  autorId: number,
  datos: CrearSugerencia,
): Promise<SugerenciaDTO> {
  const fila = await client.sugerencia.create({
    data: {
      autorId,
      titulo: datos.titulo,
      descripcion: datos.descripcion,
      areaDestino: datos.areaDestino,
      estado: ESTADO_INICIAL,
      historial: { create: { estadoNuevo: ESTADO_INICIAL, cambiadoPor: autorId } },
    },
    select: SELECT_DTO,
  });

  return toDTO(fila as FilaSugerencia);
}

/**
 * Everything this collaborator has sent, newest first.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE `where` IS THE AUTHORIZATION, AND IT IS NOT OPTIONAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `autorId` is a required parameter with no default and no "all" escape hatch,
 * so there is no way to call this function and accidentally read somebody else's
 * suggestions. Item #15 needs the complete list for an administrator; it must
 * add a SEPARATE, admin-guarded read rather than making this one's filter
 * conditional. A read whose scope widens depending on who is asking is one
 * refactor away from widening for the wrong caller, and the failure is silent —
 * a collaborator's screen quietly filling with other people's ideas.
 *
 * Newest first because the list is a record of what you sent, and the thing you
 * sent last is the thing you are most likely to be checking on. Ties break on
 * `id`, descending with the date, so two suggestions sent in the same instant
 * still come back in a stable order rather than whatever the engine chose that
 * day.
 */
export async function listarSugerenciasDeAutor(
  client: SugerenciasClient,
  autorId: number,
): Promise<SugerenciaDTO[]> {
  const filas = await client.sugerencia.findMany({
    where: { autorId },
    select: SELECT_DTO,
    orderBy: [{ fechaCreacion: "desc" }, { id: "desc" }],
  });

  return (filas as FilaSugerencia[]).map(toDTO);
}

/**
 * The author's own area, as Entra ID last reported it — the form's default
 * destination.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A PREFILL IS WORTH A QUERY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The PRD lets someone write a suggestion "para sí mismo, su área u otra área",
 * and the first two of those three are their own area. `area_destino` is free
 * text — it has to be, since an area with no registered user yet is still a
 * legal destination — so without a default the common case is someone typing
 * their own department from memory. That is where item #19's grouping goes to
 * die: "Peajes", "peajes" and "Área de Peajes" are three bars in a chart that
 * should have one.
 *
 * Prefilling does not fix the drift, and this item does not claim to. It just
 * removes the most frequent chance to introduce it, at the cost of one column
 * on a screen that is already querying.
 *
 * The empty string is a real answer and not a missing one: `usuario.area`
 * defaults to `""` for a person whose Entra ID profile reports no department,
 * and `prisma/schema.prisma` is explicit that this is the "no area reported"
 * bucket rather than a NULL. The form treats it as "no default" and asks.
 */
export async function leerAreaDelAutor(
  client: SugerenciasClient,
  autorId: number,
): Promise<string> {
  const fila = await client.usuario.findUnique({
    where: { id: autorId },
    select: { area: true },
  });

  /* No row means the account went away between the guard and this read. The
     form still works; it just opens with nothing filled in. */
  return fila?.area ?? "";
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ÍTEM #15 — LA GESTIÓN
 *
 * Everything above answers one collaborator about their own suggestions.
 * Everything below answers the Área de Innovación about all of them, and moves
 * them through the funnel. The two are kept apart on purpose — see the note on
 * `listarSugerenciasDeAutor`.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * The slice of Prisma the administration screen writes through.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `$transaction` ARRIVED WITH A REASON, AND IT IS A NEW TYPE FOR IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `crearSugerencia` argued against adding `$transaction` to `SugerenciasClient`:
 * a nested create is already atomic and there was no third statement to justify
 * the cost. `cambiarEstadoSugerencia` IS that third statement — it reads a state,
 * writes the row conditionally on it, and then writes the ledger entry that
 * quotes it — so the interactive transaction has finally earned its place.
 *
 * It is a SEPARATE type rather than a widened `SugerenciasClient` so that every
 * existing test double of the collaborator box stays valid. Adding a member to
 * the shared slice would have made the compiler demand a `$transaction` stub from
 * suites that never open one.
 *
 * `historialSugerencia` is here because the asiento is now written on its own
 * rather than nested under the row it belongs to: `updateMany` — the conditional
 * write below — has no nested-write form.
 */
export type SugerenciasAdminClient = Pick<
  PrismaClient,
  "sugerencia" | "historialSugerencia" | "$transaction"
>;

/**
 * One suggestion as the Área de Innovación reads it: everything the author sees,
 * plus who wrote it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A SEPARATE DTO, NOT A WIDENED `SugerenciaDTO`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The author name and area are exactly the fields the collaborator endpoint must
 * never grow: `GET /api/sugerencias` answers about you, so it has no reason to
 * name anyone. Making `autor` optional on the shared DTO would put that
 * distinction in an `undefined` check instead of in the type, and the day a
 * screen forgets the check the mistake renders rather than failing to compile.
 *
 * `area` is here and not only `nombre` because it is what the Área de Innovación
 * actually triages by — an idea from Peajes and an idea from Sistemas go to
 * different people. Note that it is the AUTHOR area, which is not the same field
 * as `areaDestino`: the PRD lets someone write a suggestion for another area
 * entirely, and item #19 reports on both ("sugerencias por estado y área").
 *
 * `correo` is deliberately NOT selected. The Área de Innovación already receives
 * the notification mail of item #14 with the author address in it, and a
 * management screen that lists every collaborator corporate e-mail is a copy of
 * the directory that nothing on this screen needs.
 */
export interface SugerenciaAdminDTO extends SugerenciaDTO {
  autor: { nombre: string; area: string };
}

/** `SELECT_DTO` plus the author. */
const SELECT_ADMIN = {
  ...SELECT_DTO,
  autor: { select: { nombre: true, area: true } },
} as const;

interface FilaSugerenciaAdmin extends FilaSugerencia {
  autor: { nombre: string; area: string };
}

function toAdminDTO(fila: FilaSugerenciaAdmin): SugerenciaAdminDTO {
  return { ...toDTO(fila), autor: { nombre: fila.autor.nombre, area: fila.autor.area } };
}

/**
 * Every suggestion the portal holds, newest first — "el listado completo" of
 * item #15.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS IS THE SEPARATE READ `listarSugerenciasDeAutor` ASKED FOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * That function comment named the one way item #13 could be broken from outside:
 * "Item #15 needs the complete list for an administrator; it must add a SEPARATE,
 * admin-guarded read rather than making this one filter conditional." This is
 * that read. It takes no author, it has no `where`, and it is called from exactly
 * two places — a route behind `guardRouteAdmin` and a page behind
 * `guardPageAdmin`.
 *
 * The two functions cannot be confused for one another by a future refactor: one
 * requires an author and cannot be widened, the other accepts none and cannot be
 * narrowed. The authorization is in which name you typed.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NO PAGINATION, AND THAT IS A DECISION WITH A LIFESPAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A suggestions box for one company staff grows by a handful of rows a week, and
 * the screen filters by state in the browser over the list it already holds —
 * which is only honest while the whole list fits in one answer. The moment this
 * table is in the thousands, the filter has to move to the server and this read
 * has to take a cursor. It is written down here rather than guessed at now
 * because paginating a list nobody has yet would cost the item #16 grouping
 * screen a shape it does not need either.
 */
export async function listarSugerencias(
  client: Pick<PrismaClient, "sugerencia">,
): Promise<SugerenciaAdminDTO[]> {
  const filas = await client.sugerencia.findMany({
    select: SELECT_ADMIN,
    orderBy: [{ fechaCreacion: "desc" }, { id: "desc" }],
  });

  return (filas as FilaSugerenciaAdmin[]).map(toAdminDTO);
}

/**
 * Moves one suggestion through the funnel and writes the asiento that records
 * the move.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ROW AND THE ASIENTO ARE ONE TRANSACTION, NOT TWO WRITES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TECH-DESIGN.md asks that "cada cambio de estado escribe un asiento inmutable
 * en historial_sugerencia … y ningún estado anterior se pierde al avanzar el
 * embudo". Two separate writes break that promise in both directions: a crash
 * between them leaves either a state nobody can account for, or an asiento for a
 * change that did not happen. Inside `$transaction` there is no "between them".
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE UPDATE IS CONDITIONAL ON THE STATE THAT WAS READ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `updateMany` with `where: { id, estado: actual }` is optimistic concurrency,
 * and it is what makes `estado_anterior` TRUE rather than merely plausible. Two
 * administrators reviewing the same suggestion in the same seconds both read
 * `pendiente`; without the condition, both updates succeed and both write an
 * asiento claiming the row was `pendiente` when they changed it — so the ledger
 * would show `pendiente → aprobada` followed by `pendiente → rechazada`, a trail
 * that is internally impossible and, worse, silently wrong about the first
 * decision. With the condition the second update matches zero rows, the whole
 * transaction rolls back, and the second reviewer is told to look again.
 *
 * `updateMany` and not `update` because only the `many` form takes a non-unique
 * `where` and reports how many rows it matched. It matches at most one: `id` is
 * the primary key.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A TRANSITION TO THE SAME STATE IS REFUSED, ON PURPOSE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `aprobada → aprobada` is not a transition; it is a double click, or two
 * administrators agreeing. Writing it would put non-events into a ledger whose
 * whole value is that every row in it is a change somebody made — and the trail
 * the author reads on their own screen would fill with lines saying that nothing
 * happened, twice. The row is untouched and the caller gets a 409.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FUNNEL ORDER IS *NOT* ENFORCED, AND THAT IS DELIBERATE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TECH-DESIGN.md describes the path as "pendiente → en revisión →
 * aprobada/rechazada/implementada", and it would be easy to read that as a graph
 * to police. It is a description of the normal case, and no document asks for the
 * other moves to be impossible.
 *
 * Refusing them would cost more than it buys. An administrator who clicks
 * "Rechazada" instead of "Aprobada" needs to correct it, and with a one-way graph
 * the only correction left is a database edit — outside the portal, outside the
 * ledger, and therefore outside the accountability the PRD asks for. A rejected
 * idea revived months later is a real thing that happens, and an approved idea
 * that turns out to be unworkable has to be able to go back.
 *
 * What the product actually asked for is that nothing is LOST, and that is what
 * the asiento gives: every move — forward, back or sideways — is recorded with
 * who made it and when. Accountability, not a locked door. The vocabulary stays
 * closed either way: `cambiarEstadoSchema` and the `sugerencia_estado_check`
 * constraint both refuse anything that is not one of the five states.
 *
 * `cambiadoPor` is the administrator from the session. It is a parameter and not
 * a field of any body — see `cambiarEstadoSchema`.
 */
export async function cambiarEstadoSugerencia(
  client: SugerenciasAdminClient,
  id: number,
  estadoNuevo: EstadoSugerencia,
  cambiadoPor: number,
): Promise<SugerenciaAdminDTO> {
  return client.$transaction(async (tx) => {
    const actual = await tx.sugerencia.findUnique({ where: { id }, select: { estado: true } });

    if (actual === null) {
      throw new TransicionRechazada("no_encontrada");
    }

    if (actual.estado === estadoNuevo) {
      throw new TransicionRechazada("sin_cambio");
    }

    const { count } = await tx.sugerencia.updateMany({
      where: { id, estado: actual.estado },
      data: { estado: estadoNuevo },
    });

    /* Somebody else moved it between the read and the write. Throwing is what
       rolls the transaction back — see the note on `TransicionRechazada`. */
    if (count !== 1) {
      throw new TransicionRechazada("conflicto");
    }

    await tx.historialSugerencia.create({
      data: { sugerenciaId: id, estadoAnterior: actual.estado, estadoNuevo, cambiadoPor },
    });

    /*
     * Read back inside the transaction rather than assembling the answer from
     * what was just written: the response carries the FULL ledger, including the
     * asiento above with the `fecha_cambio` the database chose, and the author
     * this screen lists by. Building it by hand would mean inventing a timestamp
     * in TypeScript that the row does not have.
     */
    const fila = await tx.sugerencia.findUnique({ where: { id }, select: SELECT_ADMIN });

    /* Unreachable: the update above matched this row inside this transaction. */
    if (fila === null) {
      throw new TransicionRechazada("no_encontrada");
    }

    return toAdminDTO(fila as FilaSugerenciaAdmin);
  });
}
