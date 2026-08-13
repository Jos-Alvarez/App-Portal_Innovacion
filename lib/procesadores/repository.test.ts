// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { ProcesadoresClient } from "@/lib/procesadores/repository";
import {
  actualizarProcesador,
  crearProcesador,
  darDeBajaProcesador,
  leerContratoProcesador,
  listarProcesadores,
} from "@/lib/procesadores/repository";

/**
 * The reads and writes the procesadores catalogue performs.
 *
 * The Prisma client is an argument, so the suite passes a double and never
 * opens a connection against the shared corporate SQL Server instance. What is
 * checked here is the SHAPE of what reaches Prisma — and, new to this resource,
 * that the contract read exists at all: `PATCH` cannot validate the four
 * cross-field columns without the row they are being merged into.
 */

const FILA = {
  id: 7,
  nombre: "Maestro de Excel",
  descripcion: null,
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx,csv",
  tamanoMax: 5_000_000,
  entradasMin: 1,
  entradasMax: null,
  tamanoMaxTotal: null,
  salidaEsperada: "archivo",
  activo: true,
};

/** What `select: SELECT_CONTRATO` really brings back — four columns, not eleven. */
const CONTRATO = {
  entradasMin: FILA.entradasMin,
  entradasMax: FILA.entradasMax,
  tamanoMax: FILA.tamanoMax,
  tamanoMaxTotal: FILA.tamanoMaxTotal,
};

function clientDouble(result: unknown = FILA, contrato: unknown = CONTRATO) {
  const findMany = vi.fn(async (_args?: unknown) => [result]);
  const findUnique = vi.fn(async (_args: unknown) => contrato);
  const create = vi.fn(async (_args: unknown) => result);
  const update = vi.fn(async (_args: unknown) => result);
  const deleteRow = vi.fn(async (_args: unknown) => result);

  const client = {
    procesador: { findMany, findUnique, create, update, delete: deleteRow },
  } as unknown as ProcesadoresClient;

  return { client, findMany, findUnique, create, update, deleteRow };
}

/** Every column the API hands to the browser, and nothing else. */
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
};

describe("listarProcesadores", () => {
  it("reads exactly the columns the API sends back", async () => {
    const { client, findMany } = clientDouble();

    expect(await listarProcesadores(client)).toEqual([FILA]);
    expect(findMany.mock.calls[0][0]).toMatchObject({ select: SELECT_DTO });
  });

  /**
   * No `activo` filter: this read serves the administration screen, and an
   * administrator who cannot see what they deactivated cannot put it back. The
   * collaborator's view is filtered by the authorization guard instead, which
   * already denies a grant whose resource is inactive.
   */
  it("returns bajas as well, because the administrator has to see them", async () => {
    const { client, findMany } = clientDouble();

    await listarProcesadores(client);

    expect(findMany.mock.calls[0][0]).not.toHaveProperty("where");
  });
});

describe("crearProcesador", () => {
  it("writes every declared column and leaves activo to the database default", async () => {
    const { client, create } = clientDouble();

    await crearProcesador(client, {
      nombre: "Maestro de Excel",
      descripcion: null,
      claveProcesador: "maestro-excel",
      formatosAceptados: "xlsx,csv",
      tamanoMax: 5_000_000,
      entradasMin: 1,
      entradasMax: null,
      tamanoMaxTotal: null,
      salidaEsperada: "archivo",
    });

    const { data } = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toEqual({
      nombre: "Maestro de Excel",
      descripcion: null,
      claveProcesador: "maestro-excel",
      formatosAceptados: "xlsx,csv",
      tamanoMax: 5_000_000,
      entradasMin: 1,
      entradasMax: null,
      tamanoMaxTotal: null,
      salidaEsperada: "archivo",
    });
  });
});

describe("leerContratoProcesador", () => {
  it("reads only the four columns the cross-field rules need", async () => {
    const { client, findUnique } = clientDouble();

    expect(await leerContratoProcesador(client, 7)).toEqual(CONTRATO);
    expect(findUnique.mock.calls[0][0]).toEqual({
      where: { id: 7 },
      select: { entradasMin: true, entradasMax: true, tamanoMax: true, tamanoMaxTotal: true },
    });
  });

  /** A row that is not there is not an error here; the route turns it into a 404. */
  it("answers null when there is no such row", async () => {
    const { client } = clientDouble(FILA, null);

    expect(await leerContratoProcesador(client, 7)).toBeNull();
  });
});

describe("actualizarProcesador", () => {
  it("passes the parsed fragment through, so an absent key leaves its column alone", async () => {
    const { client, update } = clientDouble();

    await actualizarProcesador(client, 7, { entradasMax: null });

    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: 7 },
      data: { entradasMax: null },
      select: SELECT_DTO,
    });
  });
});

describe("darDeBajaProcesador", () => {
  /**
   * `asignacion_procesador` rows reference this id, the analytics events of
   * ADR 0010 reference it with no foreign key to protect them, and the guard
   * already reads `activo = false` as "no access". A hard delete breaks all
   * three quietly.
   */
  it("flips the flag and never removes the row", async () => {
    const { client, update, deleteRow } = clientDouble();

    await darDeBajaProcesador(client, 7);

    expect(deleteRow).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0]).toMatchObject({ where: { id: 7 }, data: { activo: false } });
  });
});
