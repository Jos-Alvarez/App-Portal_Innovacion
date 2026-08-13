import type { PrismaClient } from "@prisma/client";

import type {
  ActualizarProcesador,
  ContratoEjecucion,
  CrearProcesador,
  SalidaEsperada,
} from "@/lib/procesadores/schema";

/**
 * The database reads and writes the procesadores catalogue performs.
 *
 * The Prisma client is a parameter and not a module import, exactly as in
 * `lib/enlaces/repository.ts`: production passes the singleton, the suite
 * passes a double and never reaches SQL Server.
 *
 * Every query selects the same narrow column set, so a column added to
 * `procesador` later does not silently start travelling to every client.
 */

/** The slice of Prisma these functions use. */
export type ProcesadoresClient = Pick<PrismaClient, "procesador">;

/**
 * One `procesador` as the API hands it to the browser.
 *
 * The two size fields are in BYTES, in both directions. ADR 0002 does not fix a
 * unit, and bytes is the one the FastAPI pipeline already compares against, so
 * the portal storing anything else would put a conversion between two systems
 * that must agree. Part 2's form may show megabytes; the contract does not.
 *
 * `salidaEsperada` is narrowed to the vocabulary here, held up on both sides by
 * `procesador_salida_esperada_check` at the database and `crearProcesadorSchema`
 * before the write — Prisma has no enums on SQL Server, so the column is a
 * plain string.
 */
export interface ProcesadorDTO {
  id: number;
  nombre: string;
  descripcion: string | null;
  claveProcesador: string;
  formatosAceptados: string;
  tamanoMax: number;
  entradasMin: number;
  entradasMax: number | null;
  tamanoMaxTotal: number | null;
  salidaEsperada: SalidaEsperada;
  activo: boolean;
}

/** The eleven columns of `ProcesadorDTO`, as Prisma's `select`. */
const SELECT_DTO = {
  id: true,
  nombre: true,
  descripcion: true,
  claveProcesador: true,
  formatosAceptados: true,
  tamanoMax: true,
  entradasMin: true,
  entradasMax: true,
  tamanoMaxTotal: true,
  salidaEsperada: true,
  activo: true,
} as const;

/** The four columns of the execution contract, and nothing else. */
const SELECT_CONTRATO = {
  entradasMin: true,
  entradasMax: true,
  tamanoMax: true,
  tamanoMaxTotal: true,
} as const;

/** Narrows the row Prisma types as `salidaEsperada: string` into the DTO. */
function toDTO(row: Omit<ProcesadorDTO, "salidaEsperada"> & { salidaEsperada: string }): ProcesadorDTO {
  return { ...row, salidaEsperada: row.salidaEsperada as SalidaEsperada };
}

/**
 * The whole catalogue, active rows and bajas alike.
 *
 * No `where` clause, deliberately: this read serves the administration screen,
 * whose job includes seeing what was deactivated and putting it back. The
 * collaborator's view is filtered by the authorization guard, which denies a
 * grant whose resource has `activo = false`.
 */
export async function listarProcesadores(client: ProcesadoresClient): Promise<ProcesadorDTO[]> {
  const rows = await client.procesador.findMany({
    select: SELECT_DTO,
    orderBy: { nombre: "asc" },
  });

  return rows.map(toDTO);
}

/**
 * The four contract columns of one row, or `null` when there is no such row.
 *
 * This read exists for `PATCH`, which cannot judge ADR 0002's cross-field rules
 * without the row the fragment is being merged into. It selects four columns
 * and not the whole DTO because that is all the merge needs.
 */
export async function leerContratoProcesador(
  client: ProcesadoresClient,
  id: number,
): Promise<ContratoEjecucion | null> {
  return client.procesador.findUnique({ where: { id }, select: SELECT_CONTRATO });
}

/**
 * Registers a new procesador.
 *
 * `activo` is not written: the column defaults to `true`, so a new procesador
 * is usable immediately and the flag has exactly one writer — the baja.
 */
export async function crearProcesador(
  client: ProcesadoresClient,
  datos: CrearProcesador,
): Promise<ProcesadorDTO> {
  return toDTO(
    await client.procesador.create({
      data: {
        nombre: datos.nombre,
        /* An omitted description is `undefined` after parsing; the column takes NULL. */
        descripcion: datos.descripcion ?? null,
        claveProcesador: datos.claveProcesador,
        formatosAceptados: datos.formatosAceptados,
        tamanoMax: datos.tamanoMax,
        entradasMin: datos.entradasMin,
        entradasMax: datos.entradasMax,
        tamanoMaxTotal: datos.tamanoMaxTotal,
        salidaEsperada: datos.salidaEsperada,
      },
      select: SELECT_DTO,
    }),
  );
}

/**
 * Applies a partial edit.
 *
 * `cambios` is passed through as parsed: the schema only ever produces the keys
 * the request actually carried, and Prisma leaves a column alone when its key
 * is absent. An `entradasMax: null` that IS present is a deliberate removal of
 * the cap, and is honoured. The coherence of the resulting row is settled
 * before this is called — see the PATCH handler.
 */
export async function actualizarProcesador(
  client: ProcesadoresClient,
  id: number,
  cambios: ActualizarProcesador,
): Promise<ProcesadorDTO> {
  return toDTO(
    await client.procesador.update({
      where: { id },
      data: cambios,
      select: SELECT_DTO,
    }),
  );
}

/**
 * The baja: a LOGICAL delete.
 *
 * The row survives, and three things depend on that. `asignacion_procesador`
 * rows reference this id; the analytics events of ADR 0010 reference it with no
 * foreign key to stop a hard delete from orphaning them; and the authorization
 * guard already reads `activo = false` as "no access".
 */
export async function darDeBajaProcesador(
  client: ProcesadoresClient,
  id: number,
): Promise<ProcesadorDTO> {
  return toDTO(
    await client.procesador.update({
      where: { id },
      data: { activo: false },
      select: SELECT_DTO,
    }),
  );
}
