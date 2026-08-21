import { describe, expect, it } from "vitest";

import { mensajeDeError } from "./mensajes";

/**
 * The sentences the reader sees.
 *
 * Two properties are worth more than any single wording, and most of these
 * tests are about them rather than about exact copy:
 *
 *   1. The message names the SPECIFIC reason. DESIGN.md asks for "motivo
 *      específico", and a banner that says "el archivo no es válido" for a
 *      missing column is the failure this module exists to prevent.
 *   2. The message degrades instead of throwing. `contexto` is data from
 *      another repository; a field that disappears must produce a vaguer
 *      sentence, never a TypeError inside an error handler.
 */

const MIB = 1024 * 1024;

describe("formato", () => {
  it("names the file, what it is, and what was expected", () => {
    const mensaje = mensajeDeError("formato", {
      archivo: "ventas.pdf",
      formato_recibido: "pdf",
      formatos_aceptados: ["xlsx", "csv"],
    });

    expect(mensaje).toContain("«ventas.pdf»");
    expect(mensaje).toContain(".pdf");
    expect(mensaje).toContain("xlsx, csv");
  });

  /** A file named with no dot at all: the service sends an empty extension. */
  it("says the file has no extension rather than printing a bare dot", () => {
    const mensaje = mensajeDeError("formato", {
      archivo: "ventas",
      formato_recibido: "",
      formatos_aceptados: ["xlsx"],
    });

    expect(mensaje).toContain("no tiene extensión");
    expect(mensaje).not.toContain(" .");
  });

  it("falls back to a general sentence when the context is missing", () => {
    expect(mensajeDeError("formato", {})).toContain("formato que este procesador no acepta");
  });
});

describe("tamano — one type, two shapes, two different instructions", () => {
  it("blames the single file when the service named one", () => {
    const mensaje = mensajeDeError("tamano", {
      archivo: "ventas.xlsx",
      limite_bytes: 25 * MIB,
      recibido_bytes: Math.round(31.4 * MIB),
    });

    expect(mensaje).toContain("«ventas.xlsx» pesa 31,4 MB");
    expect(mensaje).toContain("máximo por archivo es 25 MB");
  });

  /**
   * The batch shape carries `archivos` and no `archivo`, because no single file
   * is at fault. The reader is told to send fewer, not to shrink one.
   */
  it("blames the set when the service named the batch", () => {
    const mensaje = mensajeDeError("tamano", {
      archivos: ["a.xlsx", "b.xlsx"],
      limite_bytes: 40 * MIB,
      recibido_bytes: 62 * MIB,
    });

    expect(mensaje).toContain("Los archivos suman 62 MB");
    expect(mensaje).toContain("Envía menos archivos");
  });

  it("falls back when the numbers are missing", () => {
    expect(mensajeDeError("tamano", { archivo: "x.xlsx" })).toContain("superan el tamaño");
  });
});

describe("contenido", () => {
  it("names the missing column", () => {
    const mensaje = mensajeDeError("contenido", {
      archivo: "ventas.xlsx",
      motivo: "columna_faltante",
      columna: "Fecha",
    });

    expect(mensaje).toContain("«ventas.xlsx»");
    expect(mensaje).toContain("«Fecha»");
  });

  it("still says a column is missing when the service did not name it", () => {
    const mensaje = mensajeDeError("contenido", {
      archivo: "ventas.xlsx",
      motivo: "columna_faltante",
      columna: null,
    });

    expect(mensaje).toContain("una columna obligatoria");
  });

  it("says the file is empty for cero_filas", () => {
    const mensaje = mensajeDeError("contenido", { archivo: "ventas.xlsx", motivo: "cero_filas" });

    expect(mensaje).toContain("no tiene filas");
  });

  /**
   * `sin_salidas` is the sibling shape: the module ran and produced nothing, so
   * there is no file to blame and the sentence must not pretend there is.
   */
  it("does not invent a guilty file for sin_salidas", () => {
    const mensaje = mensajeDeError("contenido", { motivo: "sin_salidas" });

    expect(mensaje).toContain("no generó ningún archivo");
    expect(mensaje).not.toContain("«");
  });
});

describe("cantidad", () => {
  it("states the range and what arrived", () => {
    const mensaje = mensajeDeError("cantidad", { minimo: 1, maximo: 3, recibido: 5 });

    expect(mensaje).toContain("entre 1 y 3 archivos");
    expect(mensaje).toContain("enviaste 5");
  });

  /** ADR 0002: "un procesador de un solo archivo es `min = max = 1`". */
  it("says 'exactamente' rather than a range of one to one", () => {
    const mensaje = mensajeDeError("cantidad", { minimo: 1, maximo: 1, recibido: 3 });

    expect(mensaje).toContain("exactamente 1 archivo");
    expect(mensaje).not.toContain("entre 1 y 1");
  });
});

describe("clave_inexistente", () => {
  /**
   * Nothing the reader changes about their files would help: the row's key
   * matches no module in the service's registry. So the sentence names who
   * fixes it instead of asking them to try again.
   */
  it("addresses the reader, not their files", () => {
    const mensaje = mensajeDeError("clave_inexistente", { clave_procesador: "maestro-excel" });

    expect(mensaje).toContain("Área de Innovación");
    expect(mensaje).not.toContain("vuelve a intentarlo");
  });

  /** `clave_procesador` is an internal registry key, not something to show. */
  it("never leaks the registry key", () => {
    expect(mensajeDeError("clave_inexistente", { clave_procesador: "maestro-excel" })).not.toContain(
      "maestro-excel",
    );
  });
});

describe("every type survives an empty context", () => {
  it.each(["formato", "tamano", "contenido", "cantidad", "clave_inexistente"] as const)(
    "%s produces a sentence rather than throwing",
    (tipo) => {
      expect(mensajeDeError(tipo, {})).toMatch(/\S/);
    },
  );
});
