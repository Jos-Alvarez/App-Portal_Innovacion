// @vitest-environment node
import { describe, expect, it } from "vitest";

import { consultaSchema, diaSchema, leerConsulta } from "@/lib/analitica/schema";

/**
 * What a valid analytics question is.
 *
 * The rules worth protecting are the ones whose failure is SILENT: a date that
 * rolls into the next month, a preset that quietly ignores the dates sent with
 * it, and an inverted range that answers zero for everything and reads as "nadie
 * usó el portal".
 */

function consulta(params: Record<string, string | null>) {
  return consultaSchema.safeParse({
    rango: null,
    desde: null,
    hasta: null,
    comparar: null,
    ...params,
  });
}

describe("diaSchema", () => {
  it("acepta un día de calendario y lo devuelve en piezas", () => {
    expect(diaSchema.parse("2026-08-21")).toEqual({ anio: 2026, mes: 8, dia: 21 });
  });

  /**
   * `new Date("2026-02-31")` rolls into March instead of failing, so a typo in a
   * date picker would return another month's data under the label the reader
   * chose. The round trip through `Date.UTC` is what refuses it.
   */
  it("rechaza un día que el calendario no tiene", () => {
    expect(diaSchema.safeParse("2026-02-31").success).toBe(false);
    expect(diaSchema.safeParse("2026-13-01").success).toBe(false);
    expect(diaSchema.safeParse("2026-00-10").success).toBe(false);
  });

  it("conoce los bisiestos en ambos sentidos", () => {
    expect(diaSchema.safeParse("2028-02-29").success).toBe(true);
    expect(diaSchema.safeParse("2026-02-29").success).toBe(false);
  });

  /**
   * A full ISO timestamp would let a caller ask for a period starting at 14:30 —
   * a range this engine cannot describe and the screen cannot label.
   */
  it.each(["2026-08-21T10:00:00Z", "21/08/2026", "2026-8-21", "", "hoy"])(
    "rechaza %o, que no es un día de calendario",
    (valor) => {
      expect(diaSchema.safeParse(valor).success).toBe(false);
    },
  );
});

describe("consultaSchema", () => {
  it("acepta los tres presets sin fechas", () => {
    for (const rango of ["hoy", "7d", "30d"]) {
      expect(consulta({ rango }).success).toBe(true);
    }
  });

  it("rechaza un rango que no existe", () => {
    expect(consulta({ rango: "anual" }).success).toBe(false);
  });

  it("rechaza una consulta sin rango", () => {
    expect(consulta({}).success).toBe(false);
  });

  /**
   * Accepting and ignoring the dates would tell a caller their range was applied
   * while the server resolved `hoy` — a failure only noticed by somebody who
   * trusted the number.
   */
  it("rechaza un preset que además manda fechas", () => {
    expect(consulta({ rango: "7d", desde: "2026-08-01", hasta: "2026-08-07" }).success).toBe(false);
  });

  it("exige las dos fechas en el rango personalizado", () => {
    expect(consulta({ rango: "personalizado", desde: "2026-08-01" }).success).toBe(false);
    expect(consulta({ rango: "personalizado", hasta: "2026-08-07" }).success).toBe(false);
    expect(consulta({ rango: "personalizado" }).success).toBe(false);
  });

  it("acepta el rango personalizado con sus dos extremos", () => {
    const parsed = consulta({ rango: "personalizado", desde: "2026-08-01", hasta: "2026-08-07" });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.desde).toEqual({ anio: 2026, mes: 8, dia: 1 });
  });

  it("acepta un rango personalizado de un solo día", () => {
    expect(
      consulta({ rango: "personalizado", desde: "2026-08-21", hasta: "2026-08-21" }).success,
    ).toBe(true);
  });

  /** Un rango invertido está vacío: todas las métricas darían cero. */
  it("rechaza un rango que empieza después de terminar", () => {
    expect(
      consulta({ rango: "personalizado", desde: "2026-08-07", hasta: "2026-08-01" }).success,
    ).toBe(false);
  });

  it("no compara si no se lo piden", () => {
    const parsed = consulta({ rango: "hoy" });

    expect(parsed.success && parsed.data.comparar).toBe(false);
  });

  it("compara cuando se lo piden", () => {
    const parsed = consulta({ rango: "hoy", comparar: "true" });

    expect(parsed.success && parsed.data.comparar).toBe(true);
  });

  /**
   * `comparar=si` asked for a comparison. Reading it as false would return a
   * screen quietly missing the half the reader came for.
   */
  it("rechaza un `comparar` que no sabe leer, en vez de asumir que es no", () => {
    expect(consulta({ rango: "hoy", comparar: "si" }).success).toBe(false);
    expect(consulta({ rango: "hoy", comparar: "1" }).success).toBe(false);
  });
});

describe("leerConsulta", () => {
  it("traduce la query string a lo que el schema espera", () => {
    const params = new URLSearchParams("rango=personalizado&desde=2026-08-01&hasta=2026-08-07&comparar=true");

    expect(leerConsulta(params)).toEqual({
      rango: "personalizado",
      desde: "2026-08-01",
      hasta: "2026-08-07",
      comparar: "true",
    });
  });

  /** Un parámetro ausente llega como `null`, que el schema lee como "no vino". */
  it("deja en null lo que no vino", () => {
    expect(leerConsulta(new URLSearchParams("rango=hoy"))).toEqual({
      rango: "hoy",
      desde: null,
      hasta: null,
      comparar: null,
    });
  });
});
