import { describe, expect, it } from "vitest";

import { aEntero, bytesAMegabytes, cambiosDelProcesador, megabytesABytes } from "./edicion";

/**
 * The arithmetic the form does on its own, tested without rendering anything.
 *
 * These two jobs are the reason this screen is not the enlaces one with more
 * boxes: the API speaks bytes and the administrator speaks megabytes, and a
 * PATCH carries only what moved. The safety of the first depends on the second,
 * so both live in one module and are pinned here together.
 */

const PROCESADOR = {
  id: 4,
  nombre: "Maestro de Excel",
  descripcion: "Consolida los maestros mensuales",
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx,csv",
  tamanoMax: 26_214_400,
  entradasMin: 1,
  entradasMax: 5,
  tamanoMaxTotal: 83_886_080,
  salidaEsperada: "zip",
  activo: true,
} as const;

describe("bytesAMegabytes", () => {
  it("writes a whole number of megabytes plainly, and rounds one that is not", () => {
    expect(bytesAMegabytes(26_214_400)).toBe("25");
    /* 26 000 000 B = 24.7955… MiB. Two decimals ≈ 10 KB of precision. */
    expect(bytesAMegabytes(26_000_000)).toBe("24.8");
  });

  it("never writes a positive size as a flat zero", () => {
    /* Two decimals would round 500 B to "0", a size nobody could have typed. */
    expect(bytesAMegabytes(500)).toBe("0.000476837158203125");
  });
});

describe("megabytesABytes", () => {
  it("turns what the administrator typed into the bytes the column stores", () => {
    expect(megabytesABytes("25")).toBe(26_214_400);
    /* The decimal comma is how a size is written in Spanish. */
    expect(megabytesABytes("1,5")).toBe(1_572_864);
    /* Rounded to the whole byte the INT column holds. */
    expect(megabytesABytes("0.7")).toBe(734_003);
  });

  it("reports an unreadable size as NaN, but passes a zero through", () => {
    expect(megabytesABytes("veinticinco")).toBeNaN();
    expect(megabytesABytes("")).toBeNaN();
    /* Zero is a size, and the schema answers about the size rather than the type. */
    expect(megabytesABytes("0")).toBe(0);
  });
});

describe("aEntero", () => {
  it("reads a whole count of files and refuses anything that is not one", () => {
    expect(aEntero("3")).toBe(3);
    expect(aEntero("2.5")).toBeNaN();
    expect(aEntero("")).toBeNaN();
  });
});

describe("cambiosDelProcesador", () => {
  it("carries only the fields that actually moved", () => {
    const cambios = cambiosDelProcesador(PROCESADOR, {
      ...PROCESADOR,
      nombre: "Maestro de Excel v2",
    });

    expect(cambios).toEqual({ nombre: "Maestro de Excel v2" });
  });

  it("sends a removed cap as an explicit null instead of leaving the field out", () => {
    const cambios = cambiosDelProcesador(PROCESADOR, {
      ...PROCESADOR,
      entradasMax: null,
      tamanoMaxTotal: null,
    });

    /* An omitted key means "leave this column alone" to the API, which is the
       opposite of what clearing a cap asks for. */
    expect(cambios).toEqual({ entradasMax: null, tamanoMaxTotal: null });
    expect("entradasMax" in cambios).toBe(true);
  });

  it("leaves an untouched size out, so a rounded megabyte can never overwrite the stored bytes", () => {
    /* What the form shows for 26 000 000 B is 24.8 MB, which converts back to
       26 004 684 B. The field was not edited, so it must not travel at all. */
    const cambios = cambiosDelProcesador(
      { ...PROCESADOR, tamanoMax: 26_000_000 },
      { ...PROCESADOR, tamanoMax: 26_000_000, nombre: "Otro nombre" },
    );

    expect(cambios).toEqual({ nombre: "Otro nombre" });
  });

  it("finds nothing to send when the form still holds the stored row", () => {
    expect(cambiosDelProcesador(PROCESADOR, { ...PROCESADOR })).toEqual({});
  });

  it("treats a description cleared to blank and a description already absent as the same", () => {
    const sinDescripcion = { ...PROCESADOR, descripcion: null };

    expect(cambiosDelProcesador(sinDescripcion, { ...sinDescripcion, descripcion: null })).toEqual(
      {},
    );
    expect(cambiosDelProcesador(PROCESADOR, { ...PROCESADOR, descripcion: null })).toEqual({
      descripcion: null,
    });
  });
});
