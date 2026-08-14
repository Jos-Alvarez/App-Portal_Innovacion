import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OPCIONES_MIS_RECURSOS,
  RUTA_MIS_RECURSOS,
  obtenerMisRecursos,
} from "./mis-recursos-client";

/**
 * The browser's half of `GET /api/mis-recursos`, and the revalidation policy
 * ADR 0007 asks for.
 *
 * The ENDPOINT's rules are not re-tested here — part 1 owns its guard, its
 * merged list and its status codes. What this file pins down is the one thing
 * the endpoint cannot decide for itself: what the fetcher does when the answer
 * is not a list of resources.
 *
 * IT THROWS. That is the whole contract, and it is not a style choice. SWR
 * keeps the last value it successfully resolved whenever the fetcher rejects,
 * and replaces it whenever the fetcher resolves. A fetcher that answered `[]`
 * on a 500 would therefore tell SWR "this collaborator now has nothing", and a
 * dashboard full of working resources would empty itself because a proxy
 * hiccuped for one second.
 */

const respuesta = (cuerpo: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const RECURSOS = [
  { tipo: "app", id: 3, nombre: "Portal de Compras", descripcion: null },
  { tipo: "procesador", id: 3, nombre: "Maestro de Excel", descripcion: "Consolida hojas" },
];

describe("obtenerMisRecursos", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pide la ruta que ADR 0003 define para el dashboard", async () => {
    fetchMock.mockResolvedValue(respuesta({ recursos: [] }));

    await obtenerMisRecursos(RUTA_MIS_RECURSOS);

    expect(RUTA_MIS_RECURSOS).toBe("/api/mis-recursos");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/mis-recursos");
  });

  it("devuelve la lista que trae el cuerpo", async () => {
    fetchMock.mockResolvedValue(respuesta({ recursos: RECURSOS }));

    await expect(obtenerMisRecursos(RUTA_MIS_RECURSOS)).resolves.toEqual(RECURSOS);
  });

  it("acepta la lista vacía como respuesta válida, porque lo es", async () => {
    fetchMock.mockResolvedValue(respuesta({ recursos: [] }));

    await expect(obtenerMisRecursos(RUTA_MIS_RECURSOS)).resolves.toEqual([]);
  });

  it("falla ante un error del servidor en vez de devolver una lista vacía", async () => {
    fetchMock.mockResolvedValue(
      respuesta({ error: { mensaje: "Algo salió mal." } }, { status: 500 }),
    );

    await expect(obtenerMisRecursos(RUTA_MIS_RECURSOS)).rejects.toThrow();
  });

  it("falla ante un 401, para que la sesión caída no vacíe la pantalla", async () => {
    fetchMock.mockResolvedValue(respuesta({ error: { mensaje: "Inicia sesión." } }, { status: 401 }));

    await expect(obtenerMisRecursos(RUTA_MIS_RECURSOS)).rejects.toThrow();
  });

  it("falla ante un 200 cuyo cuerpo no es la lista esperada", async () => {
    /* A gateway page, a truncated stream, a rewritten body: a 200 is not proof. */
    fetchMock.mockResolvedValue(respuesta({ recursos: "todos" }));

    await expect(obtenerMisRecursos(RUTA_MIS_RECURSOS)).rejects.toThrow();
  });

  it("falla ante un 200 que no es JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>mantenimiento</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(obtenerMisRecursos(RUTA_MIS_RECURSOS)).rejects.toThrow();
  });

  it("deja pasar el fallo de red, no lo convierte en una lista", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(obtenerMisRecursos(RUTA_MIS_RECURSOS)).rejects.toThrow();
  });
});

describe("la política de revalidación del ADR 0007", () => {
  it("revalida por intervalo cada minuto", () => {
    expect(OPCIONES_MIS_RECURSOS.refreshInterval).toBe(60_000);
  });

  it("revalida al recuperar el foco", () => {
    /* SWR's own default, restated on purpose: it is the half of the policy that
       covers the case that actually matters — the collaborator coming back to
       the tab — and a silent default is not a decision a reader can audit. */
    expect(OPCIONES_MIS_RECURSOS.revalidateOnFocus).toBe(true);
  });

  it("no encendió el sondeo con la pestaña oculta", () => {
    /* `refreshWhenHidden` defaults to false and stays there: a minute-by-minute
       query for a tab nobody is looking at buys nothing, because the focus
       revalidation already fires the moment it is looked at again. */
    expect(OPCIONES_MIS_RECURSOS).not.toHaveProperty("refreshWhenHidden", true);
  });
});
