// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Conteos } from "@/lib/analitica/metricas";
import type { Periodo } from "@/lib/analitica/periodos";
import type { Dimensiones } from "@/lib/analitica/repository";
import { calcularAnalitica, periodoDe } from "@/lib/analitica/servicio";
import type { Consulta } from "@/lib/analitica/schema";

/**
 * The orchestration: which period, how many reads, and what is skipped.
 *
 * The two reads are injected, so what is exercised here is the real branching —
 * that the dimensions are read once for both halves of a comparison, and that
 * the previous period costs nothing when nobody asked for it.
 */

/** 21/08/2026, 10:00 in Lima. */
const AHORA = new Date("2026-08-21T15:00:00.000Z");

const DIMENSIONES: Dimensiones = {
  enlaces: [{ id: 4, nombre: "Portal de Compras", activo: true }],
  procesadores: [],
  usuarios: [{ id: 7, nombre: "Ana Quispe", area: "Peajes", activo: true, conAcceso: true }],
};

const VACIO: Conteos = { porRecurso: [], porUsuario: [], sugerencias: [] };

const leerDimensiones = vi.fn(async () => DIMENSIONES);
const agregar = vi.fn(async (_periodo: Periodo): Promise<Conteos> => VACIO);

function consulta(overrides: Partial<Consulta> = {}): Consulta {
  return { rango: "7d", desde: null, hasta: null, comparar: false, ...overrides };
}

beforeEach(() => {
  leerDimensiones.mockClear();
  agregar.mockClear().mockResolvedValue(VACIO);
});

describe("periodoDe", () => {
  it("resuelve un preset contra el reloj", () => {
    const periodo = periodoDe(consulta({ rango: "hoy" }), AHORA);

    expect(periodo.desde.toISOString()).toBe("2026-08-21T00:00:00.000Z");
  });

  /** El rango personalizado no mira el reloj: lo definen las dos fechas. */
  it("usa las fechas pedidas en el rango personalizado", () => {
    const periodo = periodoDe(
      consulta({
        rango: "personalizado",
        desde: { anio: 2026, mes: 3, dia: 1 },
        hasta: { anio: 2026, mes: 3, dia: 3 },
      }),
      AHORA,
    );

    expect(periodo.desde.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(periodo.hasta.toISOString()).toBe("2026-03-04T00:00:00.000Z");
  });
});

describe("calcularAnalitica", () => {
  it("describe el periodo en días de calendario", async () => {
    const respuesta = await calcularAnalitica(consulta(), AHORA, { leerDimensiones, agregar });

    expect(respuesta.periodo).toEqual({ desde: "2026-08-15", hasta: "2026-08-21", dias: 7 });
  });

  it("agrega una sola vez cuando no se pide comparación", async () => {
    await calcularAnalitica(consulta(), AHORA, { leerDimensiones, agregar });

    expect(agregar).toHaveBeenCalledTimes(1);
  });

  /**
   * The default view is the one an administrator opens every morning. Reading
   * the previous period always and letting the caller drop it would double its
   * cost to serve a number nobody put on screen.
   */
  it("no calcula el periodo anterior si nadie lo pidió", async () => {
    const respuesta = await calcularAnalitica(consulta(), AHORA, { leerDimensiones, agregar });

    expect(respuesta.comparacion).toBeNull();
  });

  it("agrega dos veces cuando se pide comparación", async () => {
    await calcularAnalitica(consulta({ comparar: true }), AHORA, { leerDimensiones, agregar });

    expect(agregar).toHaveBeenCalledTimes(2);
  });

  it("compara contra los siete días justo anteriores", async () => {
    const respuesta = await calcularAnalitica(consulta({ comparar: true }), AHORA, {
      leerDimensiones,
      agregar,
    });

    expect(respuesta.comparacion?.periodo).toEqual({
      desde: "2026-08-08",
      hasta: "2026-08-14",
      dias: 7,
    });
  });

  it("le pasa a la agregación los dos rangos, en orden", async () => {
    await calcularAnalitica(consulta({ comparar: true }), AHORA, { leerDimensiones, agregar });

    expect(agregar.mock.calls[0][0].desde.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    expect(agregar.mock.calls[1][0].desde.toISOString()).toBe("2026-08-08T00:00:00.000Z");
  });

  /**
   * The catalogue and the roster are not questions about a period. Reading them
   * twice would spend a round trip on an identical answer — and would let the
   * two halves of a comparison disagree about somebody's area if a login landed
   * between them.
   */
  it("lee los nombres una sola vez, aunque compare dos periodos", async () => {
    await calcularAnalitica(consulta({ comparar: true }), AHORA, { leerDimensiones, agregar });

    expect(leerDimensiones).toHaveBeenCalledTimes(1);
  });

  it("viste las dos mitades con las mismas dimensiones", async () => {
    agregar.mockImplementation(async (periodo: Periodo) => ({
      ...VACIO,
      porRecurso: [
        {
          tipoRecurso: "enlace",
          idRecurso: 4,
          tipoEvento: "apertura" as const,
          total: periodo.desde.getUTCDate(),
        },
      ],
    }));

    const respuesta = await calcularAnalitica(consulta({ comparar: true }), AHORA, {
      leerDimensiones,
      agregar,
    });

    expect(respuesta.metricas.recursos[0].nombre).toBe("Portal de Compras");
    expect(respuesta.comparacion?.metricas.recursos[0].nombre).toBe("Portal de Compras");
    /* Y cada mitad lleva sus propios números, no los de la otra. */
    expect(respuesta.metricas.recursos[0].usos).toBe(15);
    expect(respuesta.comparacion?.metricas.recursos[0].usos).toBe(8);
  });

  it("responde con las métricas del periodo pedido", async () => {
    agregar.mockResolvedValue({
      ...VACIO,
      porUsuario: [{ usuarioId: 7, tipoEvento: "apertura", total: 3 }],
    });

    const respuesta = await calcularAnalitica(consulta(), AHORA, { leerDimensiones, agregar });

    expect(respuesta.metricas.usuarios[0]).toMatchObject({ nombre: "Ana Quispe", usos: 3 });
    expect(respuesta.metricas.adopcion).toEqual({ conAcceso: 1, activos: 1 });
  });

  /** Un fallo de lectura no se traga: la ruta lo convierte en 500. */
  it("deja pasar el fallo de la base", async () => {
    agregar.mockRejectedValue(new Error("SQL Server no responde"));

    await expect(
      calcularAnalitica(consulta(), AHORA, { leerDimensiones, agregar }),
    ).rejects.toThrow("SQL Server no responde");
  });
});
