// @vitest-environment node
import { describe, expect, it } from "vitest";

import { interpretarFallo, interpretarRespuesta } from "./resultado";

/**
 * Reading the processing service's answer.
 *
 * Every case below was written against the service's own source rather than
 * against an ADR, because the two disagree in places and the code is what
 * answers. The pair that matters most is 422: the service uses it BOTH for a
 * typed error the collaborator can act on and for a request the portal built
 * wrong, and the only thing separating them is whether there is a body.
 */

/** A typed error exactly as `responder_error_tipificado` builds it. */
function tipificado(status: number, tipo: string, contexto: unknown = {}) {
  return new Response(JSON.stringify({ tipo, contexto }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A bare status, as `fallos_http.py`, `seguridad.py` and `admision.py` answer. */
function desnuda(status: number) {
  return new Response(null, { status });
}

describe("a file came back", () => {
  it("is a success", async () => {
    const resultado = await interpretarRespuesta(new Response("bytes", { status: 200 }));

    expect(resultado.clase).toBe("exito");
  });

  /**
   * The body is a file of up to hundreds of megabytes and the route pipes it
   * straight to the browser. Consuming it here to "verify" it would mean
   * buffering the whole thing to prove it exists.
   */
  it("leaves the body unread so the route can stream it", async () => {
    const respuesta = new Response("bytes", { status: 200 });

    const resultado = await interpretarRespuesta(respuesta);

    expect(respuesta.bodyUsed).toBe(false);
    expect(resultado.clase === "exito" && (await resultado.respuesta.text())).toBe("bytes");
  });
});

describe("422 means two different things and the body decides which", () => {
  it("reads a typed error as the collaborator's problem", async () => {
    const resultado = await interpretarRespuesta(
      tipificado(422, "formato", { archivo: "x.pdf", formato_recibido: "pdf" }),
    );

    expect(resultado).toEqual({
      clase: "tipificado",
      tipo: "formato",
      contexto: { archivo: "x.pdf", formato_recibido: "pdf" },
    });
  });

  /**
   * `app/core/validacion_http.py` answers 422 with no body when the request's
   * SHAPE never parsed — deliberately empty so it cannot echo the rejected
   * value. Reporting that to a collaborator as a file problem would tell them
   * to fix something that is not theirs.
   */
  it("reads an empty body as the portal's problem", async () => {
    const resultado = await interpretarRespuesta(desnuda(422));

    expect(resultado).toEqual({ clase: "infraestructura", motivo: "peticion_invalida" });
  });
});

describe("500 also carries a typed body, for exactly one type", () => {
  it("recognises clave_inexistente", async () => {
    const resultado = await interpretarRespuesta(
      tipificado(500, "clave_inexistente", { clave_procesador: "maestro-excel" }),
    );

    expect(resultado.clase === "tipificado" && resultado.tipo).toBe("clave_inexistente");
  });

  /** A crashed module, a dead child, a malformed output set: all bare 500s. */
  it("reads an empty body as an internal failure", async () => {
    const resultado = await interpretarRespuesta(desnuda(500));

    expect(resultado).toEqual({ clase: "infraestructura", motivo: "fallo_interno" });
  });
});

describe("the statuses that mean one thing each", () => {
  it.each([
    [401, "no_autenticado"],
    [503, "saturado"],
    [504, "expirado"],
  ])("maps %i to %s", async (status, motivo) => {
    const resultado = await interpretarRespuesta(desnuda(status));

    expect(resultado).toEqual({ clase: "infraestructura", motivo });
  });

  it("refuses to guess at a status it has no mapping for", async () => {
    const resultado = await interpretarRespuesta(desnuda(418));

    expect(resultado).toEqual({ clase: "infraestructura", motivo: "respuesta_inesperada" });
  });
});

describe("the mirror of the service's vocabulary is deliberately narrow", () => {
  /**
   * The two repositories share no code, so this list is a copy. A service that
   * grows a sixth type must make the portal say "something went wrong" rather
   * than silently file the new error under one of the five it knows.
   */
  it("does not accept a tipo it does not recognise", async () => {
    const resultado = await interpretarRespuesta(tipificado(422, "densidad"));

    expect(resultado).toEqual({ clase: "infraestructura", motivo: "peticion_invalida" });
  });

  it("accepts a typed error with no contexto at all", async () => {
    const resultado = await interpretarRespuesta(
      new Response(JSON.stringify({ tipo: "contenido" }), { status: 422 }),
    );

    expect(resultado).toEqual({ clase: "tipificado", tipo: "contenido", contexto: {} });
  });

  it("survives a body that is not JSON", async () => {
    const resultado = await interpretarRespuesta(
      new Response("<html>gateway</html>", { status: 500 }),
    );

    expect(resultado).toEqual({ clase: "infraestructura", motivo: "fallo_interno" });
  });
});

describe("a fetch that never produced a response", () => {
  /* `AbortSignal.timeout` rejects with this name; a user abort with the other. */
  it.each(["TimeoutError", "AbortError"])("reads %s as the clock running out", (name) => {
    const error = new Error("aborted");
    error.name = name;

    expect(interpretarFallo(error)).toEqual({ clase: "infraestructura", motivo: "expirado" });
  });

  it("reads anything else as the service being unreachable", () => {
    expect(interpretarFallo(new TypeError("fetch failed"))).toEqual({
      clase: "infraestructura",
      motivo: "inalcanzable",
    });
  });

  it("survives a rejection that is not an Error", () => {
    expect(interpretarFallo("boom")).toEqual({
      clase: "infraestructura",
      motivo: "inalcanzable",
    });
  });
});
