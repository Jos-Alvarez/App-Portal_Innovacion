import { describe, expect, it } from "vitest";

import { filasDelCatalogo } from "./catalogo";

/**
 * The merge, judged on its own — no rendering, the same way `edicion.test.ts`
 * judges the change set.
 *
 * What matters here is the SHAPE of a row: that a column belonging to the other
 * resource comes back as `null` rather than as an empty string or a zero, and
 * that the two lists arrive as one sequence a reader can scan.
 */

const ENLACE = {
  id: 7,
  nombre: "Facturación electrónica",
  descripcion: "Emisión de comprobantes",
  url: "https://facturacion.limaexpresa.pe",
  tipo: "app",
  activo: true,
} as const;

const PROCESADOR = {
  id: 4,
  nombre: "Maestro de Excel",
  descripcion: null,
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx,csv",
  tamanoMax: 26_214_400,
  entradasMin: 1,
  entradasMax: 5,
  tamanoMaxTotal: 83_886_080,
  salidaEsperada: "zip",
  activo: false,
} as const;

describe("filasDelCatalogo", () => {
  it("da a un enlace su dirección y deja en null todo lo del procesador", () => {
    const [fila] = filasDelCatalogo([ENLACE], []);

    expect(fila).toMatchObject({
      clase: "enlace",
      id: 7,
      nombre: "Facturación electrónica",
      tipo: "app",
      activo: true,
      url: "https://facturacion.limaexpresa.pe",
      /* No son datos que falten: un enlace no tiene contrato de ejecución. */
      claveProcesador: null,
      formatos: null,
      entradas: null,
      tamanos: null,
      salida: null,
    });
  });

  it("escribe el contrato del procesador y deja en null la dirección", () => {
    const [fila] = filasDelCatalogo([], [PROCESADOR]);

    expect(fila).toMatchObject({
      clase: "procesador",
      id: 4,
      tipo: "procesador",
      activo: false,
      url: null,
      claveProcesador: "maestro-excel",
      /* Tal como lo escribía la tabla de procesadores: separados, en MB, y con
         "Sin tope" en palabras cuando el tope no existe. */
      formatos: "xlsx, csv",
      entradas: "Mínimo 1 · Máximo 5",
      tamanos: "25 MB por archivo · 80 MB en total",
      salida: "zip",
    });
  });

  it("escribe «Sin tope» cuando el tope es NULL, en vez de dejarlo en blanco", () => {
    const [fila] = filasDelCatalogo(
      [],
      [{ ...PROCESADOR, entradasMax: null, tamanoMaxTotal: null }],
    );

    expect(fila.entradas).toBe("Mínimo 1 · Sin tope");
    expect(fila.tamanos).toBe("25 MB por archivo · Sin tope en total");
  });

  it("mezcla las dos listas ordenadas por nombre, no por tabla", () => {
    const filas = filasDelCatalogo(
      [ENLACE, { ...ENLACE, id: 8, nombre: "Zonas de riesgo" }],
      [PROCESADOR, { ...PROCESADOR, id: 5, nombre: "Álbum de actas" }],
    );

    /* La tilde ordena donde un lector en español la busca, no después de la Z. */
    expect(filas.map((fila) => fila.nombre)).toEqual([
      "Álbum de actas",
      "Facturación electrónica",
      "Maestro de Excel",
      "Zonas de riesgo",
    ]);
  });

  it("distingue dos recursos que comparten el id", () => {
    /* Los dos espacios de ids se solapan: sin la clase, React vería una sola fila. */
    const filas = filasDelCatalogo([{ ...ENLACE, id: 4 }], [PROCESADOR]);

    expect(filas.map((fila) => fila.clave)).toEqual(["enlace:4", "procesador:4"]);
  });

  it("no inventa filas cuando el catálogo está vacío", () => {
    expect(filasDelCatalogo([], [])).toEqual([]);
  });
});
