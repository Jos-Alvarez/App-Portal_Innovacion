// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ERROR_INTERNO, consultaInvalida } from "@/lib/analitica/errors";
import { RANGOS } from "@/lib/analitica/periodos";

/**
 * The two ways an analytics request can fail.
 *
 * Two, and that is a property of the endpoint: it reads and never writes, so
 * there is no state to collide with and nothing to be already done.
 */

describe("consultaInvalida", () => {
  it("es un 400: la petición es lo que hay que corregir", () => {
    expect(consultaInvalida().status).toBe(400);
  });

  /** Los cuatro periodos están en la pantalla del lector; nombrarlos es útil. */
  it("nombra los periodos que sí acepta", () => {
    for (const rango of RANGOS) {
      expect(consultaInvalida().error.mensaje).toContain(rango);
    }
  });

  it("explica también la regla del rango personalizado", () => {
    expect(consultaInvalida().error.mensaje).toMatch(/dos fechas/i);
  });
});

describe("ERROR_INTERNO", () => {
  it("es un 500", () => {
    expect(ERROR_INTERNO.status).toBe(500);
  });

  /**
   * The distinction that matters most on an analytics screen: a zero is a
   * finding somebody may act on, so "no pudimos leer" must never be mistaken for
   * "no pasó nada".
   */
  it("distingue «no hay datos» de «no pudimos leerlos»", () => {
    expect(ERROR_INTERNO.error.mensaje).toMatch(/no pudimos leerlos/i);
  });
});

describe("las dos sentencias", () => {
  it.each([consultaInvalida(), ERROR_INTERNO])("$error.codigo no filtra jerga técnica", (fallo) => {
    expect(fallo.error.mensaje).not.toMatch(/prisma|sql|group by|evento_uso|undefined|null|zod/i);
  });

  it("usan códigos distintos", () => {
    expect(consultaInvalida().error.codigo).not.toBe(ERROR_INTERNO.error.codigo);
  });
});
