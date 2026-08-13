// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ERROR_INTERNO,
  errorDePrisma,
  errorDeValidacion,
  identificadorInvalido,
  procesadorNoEncontrado,
} from "@/lib/procesadores/errors";
import { actualizarProcesadorSchema, crearProcesadorSchema } from "@/lib/procesadores/schema";

/**
 * Every way a request about a `procesador` fails, as the reader sees it.
 *
 * Item #5 already proved the envelope, the "first issue only" policy and the
 * duck-typed Prisma code, so this file checks only what is new here: a
 * cross-field violation must NOT collapse into the owning field's ordinary
 * message. "El máximo de archivos no puede ser menor que el mínimo" tells the
 * administrator what to change; "revisa el máximo de archivos" does not, and
 * the two failures are indistinguishable to anyone mapping by field alone.
 */

function fallo(schema: z.ZodType, cuerpo: unknown) {
  const result = schema.safeParse(cuerpo);
  if (result.success) throw new Error("this body was supposed to fail");
  return errorDeValidacion(result.error);
}

const VALIDO = {
  nombre: "Maestro de Excel",
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx",
  tamanoMax: 5_000_000,
  salidaEsperada: "archivo",
};

describe("errorDeValidacion — one message per field", () => {
  it.each([
    ["nombre", { nombre: "" }, "nombre_invalido"],
    ["claveProcesador", { claveProcesador: "mal clave" }, "clave_invalida"],
    ["formatosAceptados", { formatosAceptados: "*.xlsx" }, "formatos_invalidos"],
    ["tamanoMax", { tamanoMax: 0 }, "tamano_max_invalido"],
    ["entradasMin", { entradasMin: 0 }, "entradas_min_invalida"],
    ["entradasMax", { entradasMax: 0 }, "entradas_max_invalida"],
    ["tamanoMaxTotal", { tamanoMaxTotal: 0 }, "tamano_max_total_invalido"],
    ["salidaEsperada", { salidaEsperada: "excel" }, "salida_esperada_invalida"],
  ])("names %s as the field to fix", (_campo, override, codigo) => {
    const failure = fallo(crearProcesadorSchema, { ...VALIDO, ...override });

    expect(failure.status).toBe(400);
    expect(failure.error.codigo).toBe(codigo);
  });

  it("falls back to a whole-body message when the body is not a procesador at all", () => {
    expect(fallo(crearProcesadorSchema, undefined).error.codigo).toBe("datos_invalidos");
  });

  it("tells an empty update apart from an invalid one", () => {
    expect(fallo(actualizarProcesadorSchema, {}).error.codigo).toBe("sin_cambios");
  });
});

describe("errorDeValidacion — the cross-field rules get their own message", () => {
  it("says the maximum is below the minimum, not merely that the maximum is wrong", () => {
    const failure = fallo(crearProcesadorSchema, { ...VALIDO, entradasMin: 5, entradasMax: 3 });

    expect(failure.status).toBe(400);
    expect(failure.error.codigo).toBe("rango_entradas_incoherente");
    expect(failure.error.codigo).not.toBe("entradas_max_invalida");
    expect(failure.error.mensaje).toMatch(/mínimo/i);
  });

  it("says the combined cap is below the per-file cap", () => {
    const failure = fallo(crearProcesadorSchema, {
      ...VALIDO,
      tamanoMax: 8_000,
      tamanoMaxTotal: 1_000,
    });

    expect(failure.error.codigo).toBe("topes_tamano_incoherentes");
    expect(failure.error.mensaje).toMatch(/archivo/i);
  });
});

describe("errorDePrisma", () => {
  /**
   * `clave_procesador` is the only unique column on this table, so P2002 here
   * can mean nothing else — and it is the ordinary outcome of registering the
   * same module twice, which has to read as something the administrator can fix.
   */
  it("turns a duplicate key into a 409 that names the key", () => {
    const failure = errorDePrisma({ code: "P2002", meta: { target: ["clave_procesador"] } });

    expect(failure.status).toBe(409);
    expect(failure.error.codigo).toBe("clave_duplicada");
    expect(failure.error.mensaje).toMatch(/clave/i);
  });

  it("turns a missing row into the same 404 an unknown id gets", () => {
    expect(errorDePrisma({ code: "P2025" })).toEqual(procesadorNoEncontrado());
  });

  it.each([
    [new Error("Violation of CHECK constraint 'procesador_salida_esperada_check', error 547")],
    [{ code: 547 }],
    [null],
  ])("answers a generic 500 for %j", (error) => {
    expect(errorDePrisma(error)).toEqual(ERROR_INTERNO);
  });
});

describe("every message the module can produce", () => {
  it("is plain Spanish with no library, table or error-number text in it", () => {
    const fallos = [
      ERROR_INTERNO,
      identificadorInvalido(),
      procesadorNoEncontrado(),
      errorDePrisma({ code: "P2002" }),
      fallo(crearProcesadorSchema, { ...VALIDO, entradasMin: 5, entradasMax: 3 }),
      fallo(crearProcesadorSchema, { ...VALIDO, claveProcesador: "mal clave" }),
    ];

    for (const { error } of fallos) {
      expect(Object.keys(error).sort()).toEqual(["codigo", "mensaje"]);
      expect(error.mensaje).not.toMatch(/prisma|zod|invalid|expected|constraint|P2\d{3}|dbo\./i);
    }
  });
});
