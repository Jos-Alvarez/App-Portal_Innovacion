// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BUSQUEDA_MAX,
  BUSQUEDA_MIN,
  INT_MAX,
  RESULTADOS_MAX,
  idUsuarioSchema,
  promoverSchema,
  terminoBusquedaSchema,
} from "@/lib/admins/schema";

/**
 * The three shapes the administrator routes accept.
 *
 * What matters here is what is REFUSED: a search short enough to return half
 * the company, an id SQL Server cannot hold, and — the one that would corrupt
 * data rather than merely annoy somebody — an address that does not normalize to
 * the same value the sign-in would write.
 */

describe("terminoBusquedaSchema", () => {
  it(`acepta un término de ${BUSQUEDA_MIN} caracteres`, () => {
    expect(terminoBusquedaSchema.safeParse("an").success).toBe(true);
  });

  it("rechaza un término más corto que el mínimo", () => {
    expect(terminoBusquedaSchema.safeParse("a").success).toBe(false);
  });

  it("recorta antes de medir, así que los espacios no cuentan como búsqueda", () => {
    expect(terminoBusquedaSchema.safeParse("   ").success).toBe(false);
  });

  it("devuelve el término recortado, no el que llegó con espacios", () => {
    expect(terminoBusquedaSchema.parse("  ana  ")).toBe("ana");
  });

  /**
   * The term is matched case-insensitively by both sources, so lowercasing it
   * would change nothing about the results and would make a log line disagree
   * with what the administrator actually typed.
   */
  it("no cambia la caja de lo que se escribió", () => {
    expect(terminoBusquedaSchema.parse("Ana Quispe")).toBe("Ana Quispe");
  });

  it("rechaza un término más largo que la columna que busca", () => {
    expect(terminoBusquedaSchema.safeParse("a".repeat(BUSQUEDA_MAX + 1)).success).toBe(false);
  });
});

describe("idUsuarioSchema", () => {
  it("convierte un segmento de dígitos en número", () => {
    expect(idUsuarioSchema.parse("42")).toBe(42);
  });

  it.each(["12abc", " 12", "12.0", "-3", "", "1e3"])("rechaza %o antes de convertirlo", (crudo) => {
    expect(idUsuarioSchema.safeParse(crudo).success).toBe(false);
  });

  it("rechaza el cero: ninguna fila lo tiene como identidad", () => {
    expect(idUsuarioSchema.safeParse("0").success).toBe(false);
  });

  /**
   * Without the ceiling the value reaches Prisma and comes back as a database
   * error the administrator cannot act on, instead of a 400 that says the link
   * they followed is wrong.
   */
  it("rechaza un id que no cabe en la columna", () => {
    expect(idUsuarioSchema.safeParse(String(INT_MAX + 1)).success).toBe(false);
  });
});

describe("promoverSchema", () => {
  it("normaliza el correo como lo normaliza el login", () => {
    expect(promoverSchema.parse({ correo: "  Ana.Quispe@Corp.COM " })).toEqual({
      correo: "ana.quispe@corp.com",
    });
  });

  it("rechaza algo que no es una dirección", () => {
    expect(promoverSchema.safeParse({ correo: "ana" }).success).toBe(false);
  });

  it("rechaza un cuerpo sin correo", () => {
    expect(promoverSchema.safeParse({}).success).toBe(false);
  });

  it("rechaza un cuerpo que no es un objeto", () => {
    expect(promoverSchema.safeParse(undefined).success).toBe(false);
  });

  /**
   * The name and the area are resolved by the server — from the `usuario` row
   * or from the directory. A body that carries them is parsed down to the one
   * field, so there is no path by which a caller invents somebody's identity.
   */
  it("descarta cualquier otra clave del cuerpo", () => {
    expect(
      promoverSchema.parse({
        correo: "ana@corp.com",
        nombre: "Quien sea",
        area: "La que sea",
        esAdmin: true,
      }),
    ).toEqual({ correo: "ana@corp.com" });
  });
});

describe("las constantes que la UI y la API comparten", () => {
  it("acota los resultados de una búsqueda", () => {
    expect(RESULTADOS_MAX).toBeGreaterThan(0);
  });

  it("exige más de una letra para buscar", () => {
    expect(BUSQUEDA_MIN).toBeGreaterThan(1);
  });
});
