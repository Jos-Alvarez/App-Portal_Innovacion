import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_INTERNO } from "@/lib/enlaces/errors";

import {
  ERROR_DE_RED,
  crearEnlace,
  darDeBajaEnlace,
  editarEnlace,
  restaurarEnlace,
} from "./enlaces-client";

/**
 * The browser half of the catalogue: what each administrative action sends to
 * the API committed in part 1, and what the screen is handed back.
 *
 * The API's own rules are not re-tested here — `app/api/enlaces` already covers
 * the status codes, and `lib/enlaces` covers the validation. What this file
 * pins is the contract in between: the verb and the path each action uses, and
 * the fact that a failure arrives as a sentence the screen can show unchanged.
 */

const ENLACE = {
  id: 7,
  nombre: "Facturación electrónica",
  descripcion: null,
  url: "https://facturacion.limaexpresa.pe",
  tipo: "app",
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

describe("enlaces-client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers a new enlace on the collection route", async () => {
    respondeCon(true, { enlace: ENLACE });
    const datos = {
      nombre: "Facturación electrónica",
      descripcion: null,
      url: "https://facturacion.limaexpresa.pe",
      tipo: "app",
    } as const;

    const resultado = await crearEnlace(datos);

    expect(llamada()).toEqual({ url: "/api/enlaces", method: "POST", body: datos });
    expect(resultado).toEqual({ ok: true, enlace: ENLACE });
  });

  it("edits one enlace on its own route, sending only what the form collected", async () => {
    respondeCon(true, { enlace: ENLACE });

    await editarEnlace(7, { nombre: "Facturación", tipo: "agente" });

    expect(llamada()).toEqual({
      url: "/api/enlaces/7",
      method: "PATCH",
      body: { nombre: "Facturación", tipo: "agente" },
    });
  });

  it("takes an enlace down with the item route's DELETE", async () => {
    respondeCon(true, { enlace: { ...ENLACE, activo: false } });

    const resultado = await darDeBajaEnlace(7);

    expect(llamada()).toEqual({ url: "/api/enlaces/7", method: "DELETE", body: undefined });
    expect(resultado).toEqual({ ok: true, enlace: { ...ENLACE, activo: false } });
  });

  it("puts a deactivated enlace back by setting the flag the baja cleared", async () => {
    respondeCon(true, { enlace: ENLACE });

    await restaurarEnlace(7);

    expect(llamada()).toEqual({ url: "/api/enlaces/7", method: "PATCH", body: { activo: true } });
  });

  it("hands the API's own Spanish message to the screen, word for word", async () => {
    respondeCon(false, {
      codigo: "nombre_duplicado",
      mensaje: "Ya existe un enlace con ese nombre. Elige otro para que se distingan en el portal.",
    });

    const resultado = await crearEnlace({
      nombre: "Facturación electrónica",
      descripcion: null,
      url: "https://facturacion.limaexpresa.pe",
      tipo: "app",
    });

    expect(resultado).toEqual({
      ok: false,
      mensaje: "Ya existe un enlace con ese nombre. Elige otro para que se distingan en el portal.",
    });
  });

  it("explains an unreachable server, which the API never got to answer for", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(darDeBajaEnlace(7)).resolves.toEqual({ ok: false, mensaje: ERROR_DE_RED });
  });

  it("refuses to invent a message when the body carries none", async () => {
    respondeCon(false, undefined);

    await expect(darDeBajaEnlace(7)).resolves.toEqual({
      ok: false,
      mensaje: ERROR_INTERNO.error.mensaje,
    });
  });

  it("treats a success that carries no enlace as a failure, not as a saved row", async () => {
    respondeCon(true, { enlace: null });

    await expect(darDeBajaEnlace(7)).resolves.toEqual({
      ok: false,
      mensaje: ERROR_INTERNO.error.mensaje,
    });
  });
});
