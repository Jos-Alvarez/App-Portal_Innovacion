import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_INTERNO } from "@/lib/procesadores/errors";

import {
  ERROR_DE_RED,
  crearProcesador,
  darDeBajaProcesador,
  editarProcesador,
  restaurarProcesador,
} from "./procesadores-client";

/**
 * The browser half of the catalogue: what each administrative action sends to
 * the API committed in part 1, and what the screen is handed back.
 *
 * The API's own rules are not re-tested here — `app/api/procesadores` owns the
 * status codes and `lib/procesadores` owns the validation. What this file pins
 * is the contract in between: the verb and the path of each action, that a
 * removed cap travels as a present `null`, and that a failure arrives as a
 * sentence the screen can show unchanged.
 */

const PROCESADOR = {
  id: 4,
  nombre: "Maestro de Excel",
  descripcion: null,
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx,csv",
  tamanoMax: 26_214_400,
  entradasMin: 1,
  entradasMax: null,
  tamanoMaxTotal: null,
  salidaEsperada: "zip",
  activo: true,
} as const;

const fetchMock = vi.fn();

/** A `Response` reduced to the three members the client reads. */
function respondeCon(ok: boolean, body: unknown) {
  fetchMock.mockResolvedValue({ ok, json: async () => body });
}

function llamada() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
}

describe("procesadores-client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers a new procesador on the collection route", async () => {
    respondeCon(true, { procesador: PROCESADOR });
    const datos = {
      nombre: "Maestro de Excel",
      descripcion: null,
      claveProcesador: "maestro-excel",
      formatosAceptados: "xlsx,csv",
      tamanoMax: 26_214_400,
      entradasMin: 1,
      entradasMax: null,
      tamanoMaxTotal: null,
      salidaEsperada: "zip",
    } as const;

    const resultado = await crearProcesador(datos);

    expect(llamada()).toEqual({ url: "/api/procesadores", method: "POST", body: datos });
    expect(resultado).toEqual({ ok: true, procesador: PROCESADOR });
  });

  it("edits one procesador on its own route, sending only what changed", async () => {
    respondeCon(true, { procesador: PROCESADOR });

    await editarProcesador(4, { tamanoMax: 10_485_760 });

    expect(llamada()).toEqual({
      url: "/api/procesadores/4",
      method: "PATCH",
      body: { tamanoMax: 10_485_760 },
    });
  });

  it("keeps a removed cap in the body as a null the API can act on", async () => {
    respondeCon(true, { procesador: PROCESADOR });

    await editarProcesador(4, { entradasMax: null, tamanoMaxTotal: null });

    /* `JSON.stringify` drops undefined but keeps null, which is exactly the
       difference between "leave this column alone" and "remove this cap". */
    expect(llamada().body).toEqual({ entradasMax: null, tamanoMaxTotal: null });
  });

  it("takes a procesador down with the item route's DELETE", async () => {
    respondeCon(true, { procesador: { ...PROCESADOR, activo: false } });

    const resultado = await darDeBajaProcesador(4);

    expect(llamada()).toEqual({ url: "/api/procesadores/4", method: "DELETE", body: undefined });
    expect(resultado).toEqual({ ok: true, procesador: { ...PROCESADOR, activo: false } });
  });

  it("puts a deactivated procesador back by setting the flag the baja cleared", async () => {
    respondeCon(true, { procesador: PROCESADOR });

    await restaurarProcesador(4);

    expect(llamada()).toEqual({
      url: "/api/procesadores/4",
      method: "PATCH",
      body: { activo: true },
    });
  });

  it("hands the API's own Spanish message to the screen, word for word", async () => {
    respondeCon(false, {
      codigo: "clave_duplicada",
      mensaje: "Ya hay un procesador con esa clave. Cada clave apunta a un módulo distinto, así que elige otra.",
    });

    const resultado = await editarProcesador(4, { claveProcesador: "maestro-excel" });

    expect(resultado).toEqual({
      ok: false,
      mensaje:
        "Ya hay un procesador con esa clave. Cada clave apunta a un módulo distinto, así que elige otra.",
    });
  });

  it("explains an unreachable server, which the API never got to answer for", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(darDeBajaProcesador(4)).resolves.toEqual({ ok: false, mensaje: ERROR_DE_RED });
  });

  it("treats a success that carries no procesador as a failure, not as a saved row", async () => {
    respondeCon(true, { procesador: null });

    await expect(darDeBajaProcesador(4)).resolves.toEqual({
      ok: false,
      mensaje: ERROR_INTERNO.error.mensaje,
    });
  });
});
