import { describe, expect, it } from "vitest";

import { formatearFecha } from "@/lib/sugerencias/fechas";

/**
 * La fecha como la lee una persona.
 *
 * LO QUE ESTE ARCHIVO TIENE QUE PROBAR es lo que no se ve: `Intl` separa el
 * `p. m.` con un ESPACIO SIN SALTO (U+00A0 en este runtime, U+202F en otros).
 * En pantalla son indistinguibles de un espacio normal, así que el defecto no
 * se descubre mirando — se descubre cuando alguien copia la fecha a Excel y no
 * le cuadra, o cuando una comparación de texto que parece correcta falla sin
 * motivo aparente.
 *
 * LOS CÓDIGOS SE CONSTRUYEN, NO SE PEGAN. Un `" "` literal en el archivo
 * es indistinguible de un espacio para quien lo lea después, y la prueba se
 * volvería tan invisible como el defecto que persigue. `fromCharCode` los
 * nombra por su número: se ven en el diff, se buscan con grep, y sobreviven a
 * cualquier herramienta que normalice espacios al guardar.
 */

/** Los dos espacios que no son espacios. */
const NBSP = String.fromCharCode(0x00a0);
const NBSP_ANGOSTO = String.fromCharCode(0x202f);

/** Un instante conocido, en UTC, para no depender del reloj de la máquina. */
const ISO = "2026-03-09T18:45:00.000Z";

describe("formatearFecha", () => {
  it("no deja espacios invisibles en el resultado", () => {
    const salida = formatearFecha(ISO);

    expect(salida).not.toContain(NBSP);
    expect(salida).not.toContain(NBSP_ANGOSTO);
  });

  it("sigue separando con un espacio de verdad, no pegando las partes", () => {
    const salida = formatearFecha(ISO);

    /* El arreglo REEMPLAZA por un espacio; borrarlo habría dejado "01:45p. m.". */
    expect(salida).toContain(" ");
    expect(salida).not.toMatch(/\d(a\.|p\.)/);
  });

  it("escribe la fecha en la zona del portal, con día, mes y año", () => {
    expect(formatearFecha(ISO)).toMatch(/09\/03\/2026/);
  });

  it("una fecha ilegible es una raya, nunca «Invalid Date»", () => {
    /* La fecha es contexto alrededor de una sugerencia, nunca el punto de la
       pantalla: no vale una excepción que deje la lista en blanco. */
    expect(formatearFecha("no es una fecha")).toBe("—");
    expect(formatearFecha("")).toBe("—");
  });
});
