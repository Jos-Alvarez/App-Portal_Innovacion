import { describe, expect, it } from "vitest";

import type { Metricas, RecursoUsado } from "@/lib/analitica/metricas";

import {
  claveDeRecurso,
  indiceDeAreas,
  indiceDeErrores,
  indiceDeRecursos,
  indiceDeUsuarios,
  resumenDe,
  totalDeErrores,
  totalDeUsos,
  variacion,
} from "./comparacion";

/**
 * The arithmetic behind "vs. el periodo anterior".
 *
 * The cases worth writing down are the ones where a plausible implementation is
 * wrong rather than broken: an id that means two different resources, a row that
 * did not exist before, and a total that quietly counts failures as use.
 */

function recurso(parcial: Partial<RecursoUsado> & Pick<RecursoUsado, "tipo" | "id">): RecursoUsado {
  return {
    nombre: "Recurso",
    activo: true,
    aperturas: 0,
    ejecuciones: 0,
    errores: 0,
    usos: 0,
    ...parcial,
  };
}

const METRICAS: Metricas = {
  recursos: [
    recurso({ tipo: "enlace", id: 1, nombre: "Tablero", aperturas: 9, usos: 9 }),
    recurso({ tipo: "procesador", id: 1, nombre: "Conciliador", ejecuciones: 4, errores: 6, usos: 4 }),
  ],
  usuarios: [
    { id: 7, nombre: "Ana", area: "Peajes", activo: true, aperturas: 9, ejecuciones: 0, usos: 9 },
    { id: 8, nombre: "Luis", area: "", activo: true, aperturas: 0, ejecuciones: 4, usos: 4 },
  ],
  areas: [
    { area: "Peajes", personas: 1, usos: 9 },
    { area: "", personas: 1, usos: 4 },
  ],
  adopcion: { conAcceso: 14, activos: 2 },
  errores: [
    {
      id: 1,
      nombre: "Conciliador",
      activo: true,
      porTipo: {
        error_formato: 4,
        error_tamano: 2,
        error_contenido: 0,
        error_cantidad: 0,
        error_clave_inexistente: 0,
      },
      total: 6,
    },
  ],
  sugerencias: {
    total: 3,
    porEstado: { pendiente: 2, en_revision: 1, aprobada: 0, rechazada: 0, implementada: 0 },
    porArea: [{ area: "Peajes", total: 3 }],
  },
};

describe("claveDeRecurso", () => {
  /*
   * ADR 0002 parte los recursos en dos tablas, así que el id 1 existe dos veces
   * y significa cosas distintas. Indexar solo por id haría que la comparación de
   * un enlace mostrara las cifras de un procesador.
   */
  it("distingue el enlace 1 del procesador 1", () => {
    expect(claveDeRecurso({ tipo: "enlace", id: 1 })).not.toBe(
      claveDeRecurso({ tipo: "procesador", id: 1 }),
    );
  });
});

describe("los índices direccionan cada corte por su identidad", () => {
  it("indexa el ranking por tipo e id", () => {
    const indice = indiceDeRecursos(METRICAS.recursos);

    expect(indice.get(claveDeRecurso({ tipo: "procesador", id: 1 }))?.usos).toBe(4);
  });

  it("indexa a las personas por id", () => {
    expect(indiceDeUsuarios(METRICAS.usuarios).get(7)?.usos).toBe(9);
  });

  /* El área vacía es un balde propio, no una ausencia: tiene que ser indexable. */
  it("indexa las áreas, incluida la vacía", () => {
    expect(indiceDeAreas(METRICAS.areas).get("")?.usos).toBe(4);
  });

  it("indexa los errores por procesador", () => {
    expect(indiceDeErrores(METRICAS.errores).get(1)?.total).toBe(6);
  });
});

describe("variacion", () => {
  it("resta el periodo anterior al actual", () => {
    expect(variacion(12, 9)).toEqual({ anterior: 9, diferencia: 3 });
  });

  it("informa una caída como diferencia negativa", () => {
    expect(variacion(4, 10)).toEqual({ anterior: 10, diferencia: -6 });
  });

  /*
   * La regla que `metricas.ts` fija y esta pantalla hereda: en el periodo
   * anterior, la ausencia de una fila significa cero usos, no "se desconoce". Un
   * procesador estrenado esta semana sube desde cero, y eso es cierto.
   */
  it("trata la ausencia previa como un cero", () => {
    const indice = indiceDeRecursos([]);

    expect(indice.get(claveDeRecurso({ tipo: "enlace", id: 1 }))?.usos ?? 0).toBe(0);
    expect(variacion(9, 0).diferencia).toBe(9);
  });
});

describe("totalDeUsos", () => {
  it("suma el ranking completo", () => {
    expect(totalDeUsos(METRICAS)).toBe(13);
  });

  /*
   * El procesador del fixture acumula 6 errores y 4 ejecuciones. Si los intentos
   * fallidos entraran en el total, la tarjeta diría 19 y el ranking de abajo
   * sumaría 13: la única forma de que un resumen se crea es que dé lo mismo que
   * la lista que encabeza.
   */
  it("no cuenta los intentos fallidos como uso", () => {
    expect(totalDeUsos(METRICAS)).not.toBe(19);
  });
});

describe("totalDeErrores", () => {
  it("suma los rechazos de todos los procesadores", () => {
    expect(totalDeErrores(METRICAS)).toBe(6);
  });
});

describe("resumenDe", () => {
  it("arma las cinco cifras de cabecera de un mismo periodo", () => {
    expect(resumenDe(METRICAS)).toEqual({
      usos: 13,
      activos: 2,
      conAcceso: 14,
      sugerencias: 3,
      errores: 6,
    });
  });
});
