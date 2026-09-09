import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_INTERNO } from "@/lib/personas/errors";

import { ERROR_DE_RED, buscarColaboradores, registrarPersona } from "./personas-client";

/**
 * The browser half of `/api/personas`: what the type-ahead sends, and what the
 * dialog is handed back.
 *
 * The API's own rules are not re-tested here — `app/api/personas/route.test.ts`
 * covers the status codes and the domain rule. What this file pins is the
 * contract in between: the path and the verb, that a failure arrives as a
 * sentence the screen can show unchanged, and that a CANCELLED search is told
 * apart from a failed one — because the type-ahead aborts on every keystroke
 * and must not paint an error for a request it replaced itself.
 */

const SHEYLA = {
  correo: "sheyla.paz@limaexpresa.pe",
  nombre: "Sheyla Paz",
  area: "Operaciones",
  enElPortal: null,
};

const fetchMock = vi.fn();

/** A `Response` reduced to the three members the client reads. */
function respondeCon(ok: boolean, body: unknown) {
  fetchMock.mockResolvedValue({ ok, json: async () => body });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buscarColaboradores", () => {
  it("pide GET /api/personas con el término escapado en la query", async () => {
    respondeCon(true, { origen: "directorio", personas: [] });

    await buscarColaboradores("sheyla paz");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("/api/personas?q=sheyla%20paz");
  });

  it("devuelve el origen junto a las personas: la pantalla necesita ambos", async () => {
    respondeCon(true, { origen: "portal", personas: [SHEYLA] });

    const resultado = await buscarColaboradores("sheyla");

    expect(resultado).toEqual({ ok: true, origen: "portal", personas: [SHEYLA] });
  });

  it("reenvía el mensaje del API tal como llegó", async () => {
    respondeCon(false, { codigo: "termino_invalido", mensaje: "Escribe al menos 2 letras." });

    expect(await buscarColaboradores("a")).toEqual({
      ok: false,
      mensaje: "Escribe al menos 2 letras.",
    });
  });

  it("un 2xx con un origen que no reconoce es un fallo, no una lista vacía", async () => {
    respondeCon(true, { origen: "inventado", personas: [] });

    expect(await buscarColaboradores("sheyla")).toEqual({
      ok: false,
      mensaje: ERROR_INTERNO.error.mensaje,
    });
  });

  it("distingue una búsqueda cancelada de una que falló", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));

    const resultado = await buscarColaboradores("she");

    /* La pantalla la descarta en silencio: es una petición que ella misma
       reemplazó al seguir escribiendo, no algo que el lector deba ver. */
    expect(resultado).toMatchObject({ ok: false, cancelada: true });
  });

  it("un fallo de red sí es una frase, porque el servidor nunca contestó", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await buscarColaboradores("sheyla")).toEqual({ ok: false, mensaje: ERROR_DE_RED });
  });
});

describe("registrarPersona", () => {
  it("manda POST con el correo en el cuerpo", async () => {
    respondeCon(true, { usuario: { id: 42 } });

    await registrarPersona({ correo: SHEYLA.correo, nombre: "Sheyla Paz", area: "Operaciones" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/personas");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      correo: SHEYLA.correo,
      nombre: "Sheyla Paz",
      area: "Operaciones",
    });
  });

  it("devuelve la cuenta, que es de donde sale el id de la asignación", async () => {
    respondeCon(true, { usuario: { id: 42, correo: SHEYLA.correo } });

    expect(await registrarPersona({ correo: SHEYLA.correo })).toMatchObject({
      ok: true,
      usuario: { id: 42 },
    });
  });

  it("reenvía la negativa del API tal como llegó", async () => {
    respondeCon(false, {
      codigo: "dominio_no_corporativo",
      mensaje: "Esa dirección no es del dominio corporativo.",
    });

    expect(await registrarPersona({ correo: "ajena@otra.com" })).toEqual({
      ok: false,
      mensaje: "Esa dirección no es del dominio corporativo.",
    });
  });

  it("un 2xx sin cuenta adentro es un fallo: no hay id del que colgar el acceso", async () => {
    respondeCon(true, { usuario: null });

    expect(await registrarPersona({ correo: SHEYLA.correo })).toEqual({
      ok: false,
      mensaje: ERROR_INTERNO.error.mensaje,
    });
  });

  it("un fallo de red llega como la frase que este módulo sí posee", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await registrarPersona({ correo: SHEYLA.correo })).toEqual({
      ok: false,
      mensaje: ERROR_DE_RED,
    });
  });
});
