import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_INTERNO } from "@/lib/asignaciones/errors";

import { ERROR_DE_RED, asignarRecurso, revocarRecurso } from "./asignaciones-client";

/**
 * The browser half of the assignment API committed in part 1: what a toggle
 * sends, and what the screen is handed back.
 *
 * The API's own rules are not re-tested here — `lib/asignaciones` owns the
 * idempotency, the baja asymmetry and the status codes, with 125 tests of its
 * own. What this file pins is the contract in between: the verb, the path, that
 * nothing travels in a body, and above all that the ANSWER is read from the
 * response rather than assumed from the request.
 */

const fetchMock = vi.fn();

/** A `Response` reduced to the two members the client reads. */
function respondeCon(ok: boolean, body: unknown) {
  fetchMock.mockResolvedValue({ ok, json: async () => body });
}

function llamada() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, method: init.method, body: init.body };
}

describe("asignaciones-client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("grants an enlace with a PUT on that user's own assignment route", async () => {
    respondeCon(true, { asignacion: { usuarioId: 7, tipo: "enlace", recursoId: 4, asignado: true } });

    const resultado = await asignarRecurso(7, "enlace", 4);

    expect(llamada()).toEqual({
      url: "/api/usuarios/7/asignaciones/enlaces/4",
      method: "PUT",
      body: undefined,
    });
    expect(resultado).toEqual({ ok: true, asignado: true });
  });

  it("grants a procesador on the plural segment of its own catalogue", async () => {
    respondeCon(true, {
      asignacion: { usuarioId: 7, tipo: "procesador", recursoId: 9, asignado: true },
    });

    await asignarRecurso(7, "procesador", 9);

    /* The type is singular everywhere in the code and plural in the URL; this
       is the one place that mapping happens. */
    expect(llamada().url).toBe("/api/usuarios/7/asignaciones/procesadores/9");
  });

  it("revokes with a DELETE on the very same route", async () => {
    respondeCon(true, {
      asignacion: { usuarioId: 7, tipo: "enlace", recursoId: 4, asignado: false },
    });

    const resultado = await revocarRecurso(7, "enlace", 4);

    expect(llamada()).toEqual({
      url: "/api/usuarios/7/asignaciones/enlaces/4",
      method: "DELETE",
      body: undefined,
    });
    expect(resultado).toEqual({ ok: true, asignado: false });
  });

  it("reports the state the server confirmed, never the one that was asked for", async () => {
    /* A grant answered with `asignado: false` would be a server that did not do
       what was asked. The screen must show what the row IS, so the answer is
       read out of the body and not inferred from the verb that was sent. */
    respondeCon(true, {
      asignacion: { usuarioId: 7, tipo: "enlace", recursoId: 4, asignado: false },
    });

    await expect(asignarRecurso(7, "enlace", 4)).resolves.toEqual({ ok: true, asignado: false });
  });

  it("hands the API's own Spanish refusal to the screen, word for word", async () => {
    respondeCon(false, {
      codigo: "enlace_dado_de_baja",
      mensaje:
        "Ese enlace está dado de baja, así que no puedes darlo de alta a nadie. Puedes quitar accesos antiguos; para concederlos, reactívalo primero.",
    });

    await expect(asignarRecurso(7, "enlace", 4)).resolves.toEqual({
      ok: false,
      mensaje:
        "Ese enlace está dado de baja, así que no puedes darlo de alta a nadie. Puedes quitar accesos antiguos; para concederlos, reactívalo primero.",
    });
  });

  it("explains an unreachable server, which the API never got to answer for", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(revocarRecurso(7, "procesador", 9)).resolves.toEqual({
      ok: false,
      mensaje: ERROR_DE_RED,
    });
  });

  it("treats a 2xx that carries no assignment as a failure, not as a confirmed grant", async () => {
    respondeCon(true, { asignacion: { usuarioId: 7, tipo: "enlace", recursoId: 4 } });

    await expect(asignarRecurso(7, "enlace", 4)).resolves.toEqual({
      ok: false,
      mensaje: ERROR_INTERNO.error.mensaje,
    });
  });

  it("falls back to the internal-error sentence when a refusal is not the envelope", async () => {
    /* A proxy timing out, a gateway page: a failing response whose body is not
       ADR 0003's envelope still has to say something a person can act on. */
    respondeCon(false, "<html>504</html>");

    await expect(asignarRecurso(7, "enlace", 4)).resolves.toEqual({
      ok: false,
      mensaje: ERROR_INTERNO.error.mensaje,
    });
  });
});
