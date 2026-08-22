// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  type AnaliticaClient,
  agregarPorRecurso,
  agregarPorUsuario,
  agregarSugerencias,
  leerDimensiones,
} from "@/lib/analitica/repository";

/**
 * The three aggregations and the three dimension reads.
 *
 * The Prisma client is an argument, exactly as in every other repository here,
 * so the suite passes a double and never opens a connection against the shared
 * corporate SQL Server instance (README.md's operational rules).
 *
 * What these tests protect is the SHAPE of what reaches Prisma: that the
 * aggregation really is a `GROUP BY` and not a full read folded in memory, that
 * the range is half-open on the indexed `fecha` column, and — the one a refactor
 * would get wrong — that suggestions are filed by the date they were SENT.
 */

const PERIODO = {
  desde: new Date("2026-08-15T00:00:00.000Z"),
  hasta: new Date("2026-08-22T00:00:00.000Z"),
};

function clientDouble({
  eventos = [] as unknown[],
  sugerencias = [] as unknown[],
  enlaces = [] as unknown[],
  procesadores = [] as unknown[],
  usuarios = [] as unknown[],
} = {}) {
  const groupByEventos = vi.fn(async (_args: unknown) => eventos);
  const groupBySugerencias = vi.fn(async (_args: unknown) => sugerencias);
  const findManyEnlaces = vi.fn(async (_args: unknown) => enlaces);
  const findManyProcesadores = vi.fn(async (_args: unknown) => procesadores);
  const findManyUsuarios = vi.fn(async (_args: unknown) => usuarios);

  const client = {
    eventoUso: { groupBy: groupByEventos },
    sugerencia: { groupBy: groupBySugerencias },
    enlace: { findMany: findManyEnlaces },
    procesador: { findMany: findManyProcesadores },
    usuario: { findMany: findManyUsuarios },
  } as unknown as AnaliticaClient;

  return {
    client,
    groupByEventos,
    groupBySugerencias,
    findManyEnlaces,
    findManyProcesadores,
    findManyUsuarios,
  };
}

describe("agregarPorRecurso", () => {
  it("agrupa en SQL por recurso y tipo de evento", async () => {
    const { client, groupByEventos } = clientDouble();

    await agregarPorRecurso(client, PERIODO);

    expect(groupByEventos.mock.calls[0][0]).toMatchObject({
      by: ["tipoRecurso", "idRecurso", "tipoEvento"],
      _count: { _all: true },
    });
  });

  /**
   * Half-open on the indexed column: `gte`/`lt` and never `lte`. A closed range
   * would either drop the last millisecond of the period or double-count the
   * boundary between a period and the one before it.
   */
  it("acota por fecha con el rango semiabierto", async () => {
    const { client, groupByEventos } = clientDouble();

    await agregarPorRecurso(client, PERIODO);

    expect(groupByEventos.mock.calls[0][0]).toMatchObject({
      where: { fecha: { gte: PERIODO.desde, lt: PERIODO.hasta } },
    });
  });

  it("devuelve los conteos ya desenvueltos", async () => {
    const { client } = clientDouble({
      eventos: [
        { tipoRecurso: "enlace", idRecurso: 4, tipoEvento: "apertura", _count: { _all: 12 } },
      ],
    });

    expect(await agregarPorRecurso(client, PERIODO)).toEqual([
      { tipoRecurso: "enlace", idRecurso: 4, tipoEvento: "apertura", total: 12 },
    ]);
  });
});

describe("agregarPorUsuario", () => {
  it("agrupa por persona y tipo de evento", async () => {
    const { client, groupByEventos } = clientDouble();

    await agregarPorUsuario(client, PERIODO);

    expect(groupByEventos.mock.calls[0][0]).toMatchObject({
      by: ["usuarioId", "tipoEvento"],
      where: { fecha: { gte: PERIODO.desde, lt: PERIODO.hasta } },
    });
  });

  /**
   * Not grouped by area: `evento_uso` has no area column, and denormalising one
   * would split somebody's history in two the day they transfer.
   */
  it("no agrupa por área, que no vive en la tabla de eventos", async () => {
    const { client, groupByEventos } = clientDouble();

    await agregarPorUsuario(client, PERIODO);

    expect(JSON.stringify(groupByEventos.mock.calls[0][0])).not.toContain("area");
  });
});

describe("agregarSugerencias", () => {
  it("agrupa por autor y estado", async () => {
    const { client, groupBySugerencias } = clientDouble();

    await agregarSugerencias(client, PERIODO);

    expect(groupBySugerencias.mock.calls[0][0]).toMatchObject({
      by: ["autorId", "estado"],
      _count: { _all: true },
    });
  });

  /**
   * By `fechaCreacion`, so an idea belongs to the period it was SENT in. Filing
   * it by its last state change would move it between months every time somebody
   * reviewed it, and "sugerencias recibidas" would change retroactively.
   */
  it("acota por la fecha de creación, no por la del último cambio", async () => {
    const { client, groupBySugerencias } = clientDouble();

    await agregarSugerencias(client, PERIODO);

    expect(groupBySugerencias.mock.calls[0][0]).toMatchObject({
      where: { fechaCreacion: { gte: PERIODO.desde, lt: PERIODO.hasta } },
    });
  });
});

describe("leerDimensiones", () => {
  it("lee los dos catálogos y el padrón", async () => {
    const { client, findManyEnlaces, findManyProcesadores, findManyUsuarios } = clientDouble();

    await leerDimensiones(client);

    expect(findManyEnlaces).toHaveBeenCalledTimes(1);
    expect(findManyProcesadores).toHaveBeenCalledTimes(1);
    expect(findManyUsuarios).toHaveBeenCalledTimes(1);
  });

  /**
   * A resource retired last week was used the week before. Filtering by `activo`
   * would erase usage that really happened from a ranking whose job is to
   * explain what happened.
   */
  it("no filtra por activo: lo dado de baja también se usó", async () => {
    const { client, findManyEnlaces, findManyUsuarios } = clientDouble();

    await leerDimensiones(client);

    expect(JSON.stringify(findManyEnlaces.mock.calls[0][0])).not.toContain("where");
    expect(JSON.stringify(findManyUsuarios.mock.calls[0][0])).not.toContain("where");
  });

  it("no pide período: los nombres no dependen del rango", async () => {
    const { client, findManyEnlaces } = clientDouble();

    await leerDimensiones(client);

    expect(JSON.stringify(findManyEnlaces.mock.calls[0][0])).not.toContain("fecha");
  });

  /**
   * The denominator of adoption is people, not grants: eleven accesses held by
   * one person is one person.
   */
  it("reduce las asignaciones a un booleano por persona", async () => {
    const { client } = clientDouble({
      usuarios: [
        {
          id: 7,
          nombre: "Ana Quispe",
          area: "TI",
          activo: true,
          _count: { asignacionesEnlace: 3, asignacionesProcesador: 8 },
        },
        {
          id: 9,
          nombre: "Beto Ruiz",
          area: "Legal",
          activo: true,
          _count: { asignacionesEnlace: 0, asignacionesProcesador: 0 },
        },
      ],
    });

    const { usuarios } = await leerDimensiones(client);

    expect(usuarios).toEqual([
      { id: 7, nombre: "Ana Quispe", area: "TI", activo: true, conAcceso: true },
      { id: 9, nombre: "Beto Ruiz", area: "Legal", activo: true, conAcceso: false },
    ]);
  });

  /** `usuario.area` is NOT NULL with an empty default; the client types it loosely. */
  it("normaliza un área nula a la cadena vacía", async () => {
    const { client } = clientDouble({
      usuarios: [
        {
          id: 7,
          nombre: "Ana",
          area: null,
          activo: true,
          _count: { asignacionesEnlace: 0, asignacionesProcesador: 0 },
        },
      ],
    });

    const { usuarios } = await leerDimensiones(client);

    expect(usuarios[0].area).toBe("");
  });
});
