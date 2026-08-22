import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONSULTA_INICIAL,
  type ConsultaUI,
  INTERVALO_MS,
  MENSAJE_RANGO_INCOMPLETO,
  MENSAJE_RANGO_INVERTIDO,
  RUTA_ANALITICA,
  obtenerAnalitica,
  opcionesDe,
  periodoEnCurso,
  problemaDeRango,
  rutaDe,
} from "./analitica-client";

/**
 * The browser's side of `GET /api/analitica`.
 *
 * Three things are asserted and they are the three this module owns: that a
 * question becomes exactly the query string the engine's schema accepts, that a
 * half-written range asks nothing at all, and that the fetcher REJECTS rather
 * than resolving something empty — because SWR keeps the last good answer on a
 * rejection and replaces it on a resolution.
 */

const HOY = "2026-08-21";

function consulta(parcial: Partial<ConsultaUI> = {}): ConsultaUI {
  return { ...CONSULTA_INICIAL, ...parcial };
}

const REPORTE = {
  periodo: { desde: HOY, hasta: HOY, dias: 1 },
  metricas: { recursos: [], usuarios: [], areas: [] },
  comparacion: null,
};

describe("rutaDe", () => {
  it("pide un preset por su nombre y nada más", () => {
    expect(rutaDe(consulta({ rango: "7d" }))).toBe(`${RUTA_ANALITICA}?rango=7d`);
  });

  /*
   * `lib/analitica/schema.ts` rechaza un preset que llega con fechas, en vez de
   * ignorarlas, justamente para que nadie crea que se aplicaron. Si la ruta
   * arrastrara lo último escrito en los campos, volver a «Hoy» sería un 400.
   */
  it("no arrastra las fechas del rango personalizado al volver a un preset", () => {
    const ruta = rutaDe(consulta({ rango: "hoy", desde: "2026-07-01", hasta: "2026-07-31" }));

    expect(ruta).toBe(`${RUTA_ANALITICA}?rango=hoy`);
  });

  it("manda los dos extremos de un rango personalizado", () => {
    const ruta = rutaDe(consulta({ rango: "personalizado", desde: "2026-07-01", hasta: "2026-07-31" }));

    expect(ruta).toBe(`${RUTA_ANALITICA}?rango=personalizado&desde=2026-07-01&hasta=2026-07-31`);
  });

  /* El schema lee la ausencia como "no". Mandar `comparar=false` sería ruido. */
  it("escribe la comparación por omisión cuando está apagada", () => {
    expect(rutaDe(consulta({ comparar: false }))).not.toContain("comparar");
    expect(rutaDe(consulta({ comparar: true }))).toContain("comparar=true");
  });

  /*
   * `null` es lo que SWR lee como "no pidas nada". Un rango a medio escribir no
   * es una pregunta, y disparar en cada tecla preguntaría por medias preguntas.
   */
  it("no arma ruta mientras el rango personalizado no esté completo", () => {
    expect(rutaDe(consulta({ rango: "personalizado", desde: "2026-07-01", hasta: "" }))).toBeNull();
  });

  it("no arma ruta con un rango invertido", () => {
    expect(
      rutaDe(consulta({ rango: "personalizado", desde: "2026-07-31", hasta: "2026-07-01" })),
    ).toBeNull();
  });
});

describe("problemaDeRango", () => {
  it("no ve problema en un preset, tenga lo que tenga en los campos", () => {
    expect(problemaDeRango(consulta({ rango: "30d", desde: "2026-07-31", hasta: "" }))).toBeNull();
  });

  it("pide las dos fechas cuando falta una", () => {
    expect(problemaDeRango(consulta({ rango: "personalizado", desde: "2026-07-01", hasta: "" }))).toBe(
      MENSAJE_RANGO_INCOMPLETO,
    );
  });

  it("nombra la inversión, que describe un periodo vacío", () => {
    expect(
      problemaDeRango(consulta({ rango: "personalizado", desde: "2026-07-31", hasta: "2026-07-01" })),
    ).toBe(MENSAJE_RANGO_INVERTIDO);
  });

  it("acepta un rango de un solo día", () => {
    expect(
      problemaDeRango(consulta({ rango: "personalizado", desde: HOY, hasta: HOY })),
    ).toBeNull();
  });
});

describe("periodoEnCurso", () => {
  it("da por vivos los tres presets: todos terminan hoy", () => {
    expect(periodoEnCurso(consulta({ rango: "hoy" }), HOY)).toBe(true);
    expect(periodoEnCurso(consulta({ rango: "7d" }), HOY)).toBe(true);
    expect(periodoEnCurso(consulta({ rango: "30d" }), HOY)).toBe(true);
  });

  it("da por cerrado un rango que ya terminó", () => {
    expect(
      periodoEnCurso(consulta({ rango: "personalizado", desde: "2026-07-01", hasta: "2026-07-31" }), HOY),
    ).toBe(false);
  });

  it("da por vivo un rango personalizado que llega hasta hoy", () => {
    expect(
      periodoEnCurso(consulta({ rango: "personalizado", desde: "2026-08-01", hasta: HOY }), HOY),
    ).toBe(true);
  });
});

describe("opcionesDe", () => {
  it("consulta cada minuto un periodo que sigue ocurriendo", () => {
    expect(opcionesDe(consulta({ rango: "hoy" }), HOY).refreshInterval).toBe(INTERVALO_MS);
  });

  /*
   * Un julio cerrado no puede cambiar: sondearlo cada minuto gastaría tres
   * `GROUP BY` sobre `evento_uso` por minuto para redibujar los mismos números.
   */
  it("no sondea un periodo cerrado", () => {
    const cerrado = consulta({ rango: "personalizado", desde: "2026-07-01", hasta: "2026-07-31" });

    expect(opcionesDe(cerrado, HOY).refreshInterval).toBe(0);
  });

  /* Volver a la pestaña es el lector PREGUNTANDO, y eso vale una consulta siempre. */
  it("revalida al recuperar el foco en cualquier periodo", () => {
    const cerrado = consulta({ rango: "personalizado", desde: "2026-07-01", hasta: "2026-07-31" });

    expect(opcionesDe(cerrado, HOY).revalidateOnFocus).toBe(true);
  });

  it("conserva los datos previos mientras llega el periodo nuevo", () => {
    expect(opcionesDe(consulta(), HOY).keepPreviousData).toBe(true);
  });
});

describe("obtenerAnalitica", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve el reporte de una respuesta buena", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => REPORTE });

    await expect(obtenerAnalitica("/api/analitica?rango=hoy")).resolves.toEqual(REPORTE);
  });

  /*
   * SWR reemplaza lo cacheado con lo que el fetcher RESUELVE y conserva lo último
   * bueno cuando RECHAZA. Resolver un reporte vacío en un mal minuto dibujaría un
   * tablero de ceros — "hoy no usó nadie el portal" —, que es una afirmación
   * sobre la empresa y no sobre la red.
   */
  it("rechaza un 500 en vez de resolver algo vacío", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(obtenerAnalitica("/api/analitica?rango=hoy")).rejects.toThrow();
  });

  it("rechaza un 200 que no trae el reporte", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    await expect(obtenerAnalitica("/api/analitica?rango=hoy")).rejects.toThrow();
  });

  it("deja pasar el rechazo de la red tal cual", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(obtenerAnalitica("/api/analitica?rango=hoy")).rejects.toThrow("Failed to fetch");
  });
});
