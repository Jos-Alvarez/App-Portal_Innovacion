// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ETIQUETA_ESTADO, TONO_ESTADO } from "./etiquetas";
import { ESTADOS_SUGERENCIA } from "./schema";

/**
 * The five states, as a reader sees them.
 *
 * Small, and worth having: this is the only mapping in the portal that DESIGN.md
 * specifies colour by colour, so a change here is a change to the document —
 * and the test says which line of it.
 */

describe("ETIQUETA_ESTADO", () => {
  it("nombra los cinco estados y ninguno más", () => {
    expect(Object.keys(ETIQUETA_ESTADO).sort()).toEqual([...ESTADOS_SUGERENCIA].sort());
  });

  it("no deja escapar el token de almacenamiento a la pantalla", () => {
    expect(ETIQUETA_ESTADO.en_revision).toBe("En revisión");
    expect(Object.values(ETIQUETA_ESTADO).every((etiqueta) => !etiqueta.includes("_"))).toBe(true);
  });
});

describe("TONO_ESTADO", () => {
  /**
   * DESIGN.md, "Chips de tipo/estado": "Estados de sugerencia: pendiente gris,
   * en revisión ámbar, aprobada verde, rechazada rojo, implementada navy."
   */
  it("usa exactamente los colores que DESIGN.md asigna", () => {
    expect(TONO_ESTADO).toEqual({
      pendiente: "neutral",
      en_revision: "warn",
      aprobada: "ok",
      rechazada: "danger",
      implementada: "navy",
    });
  });

  /**
   * "El rojo jamás se usa fuera de error/destrucción" — y `rechazada` es la
   * excepción que el propio documento nombra. Es el único rojo legítimo del
   * portal que no es un error ni una baja, así que conviene que sea el único.
   */
  it("gasta el rojo en un solo estado, el que DESIGN.md nombra", () => {
    const rojos = Object.entries(TONO_ESTADO).filter(([, tono]) => tono === "danger");

    expect(rojos).toEqual([["rechazada", "danger"]]);
  });

  it("cubre los cinco estados, así que ningún chip queda sin color", () => {
    for (const estado of ESTADOS_SUGERENCIA) {
      expect(TONO_ESTADO[estado]).toBeTruthy();
    }
  });
});
