// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ETIQUETA_ESTADO, TONO_ESTADO, textoDeAsiento } from "./etiquetas";
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

/**
 * Un asiento del historial, en palabras.
 *
 * It moved down here from `buzon.tsx` in item #15 because a second screen now
 * renders the same ledger. These tests are what stop the two screens from ever
 * wording one transition differently.
 */
describe("textoDeAsiento", () => {
  /**
   * The entry row reads as an EVENT, not as a transition: "→ Pendiente" with
   * nothing on the left is a sentence about the database, not about what
   * happened.
   */
  it("llama «Enviada» al asiento de entrada, que no tiene estado anterior", () => {
    expect(textoDeAsiento({ estadoAnterior: null, estadoNuevo: "pendiente" })).toBe(
      "Enviada · Pendiente",
    );
  });

  it("escribe los dos extremos de una transición real", () => {
    expect(textoDeAsiento({ estadoAnterior: "pendiente", estadoNuevo: "en_revision" })).toBe(
      "Pendiente → En revisión",
    );
  });

  /** Ningún estado llega crudo a la pantalla: los dos lados pasan por la etiqueta. */
  it("nunca deja salir un token de almacenamiento", () => {
    for (const anterior of ESTADOS_SUGERENCIA) {
      for (const nuevo of ESTADOS_SUGERENCIA) {
        const texto = textoDeAsiento({ estadoAnterior: anterior, estadoNuevo: nuevo });

        expect(texto).not.toMatch(/en_revision/);
        expect(texto).toBe(`${ETIQUETA_ESTADO[anterior]} → ${ETIQUETA_ESTADO[nuevo]}`);
      }
    }
  });

  /**
   * El repositorio permite volver atrás a propósito — ver la nota del embudo —
   * y el texto tiene que poder contarlo.
   */
  it("sabe escribir una vuelta atrás, porque el embudo no es de una sola dirección", () => {
    expect(textoDeAsiento({ estadoAnterior: "aprobada", estadoNuevo: "en_revision" })).toBe(
      "Aprobada → En revisión",
    );
  });
});
