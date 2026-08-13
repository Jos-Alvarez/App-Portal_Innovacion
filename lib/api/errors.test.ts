// @vitest-environment node
import { describe, expect, it } from "vitest";

import { type ApiError, apiFailure, failureResponse } from "@/lib/api/errors";
import { errorForDenial } from "@/lib/authz/decisions";

/**
 * The single error envelope of ADR 0003.
 *
 * The point of these tests is not that JSON serialisation works — it is that
 * ONE shape exists. The guard already answered 401 and 403 with
 * `{ codigo, mensaje }` before any of this API was written; if a validation
 * failure invented a second shape, the browser's fetch layer would have to
 * guess which one it got from the status code alone. Node environment, like
 * `route-guard.test.ts`, because this is server code built on `Response`.
 */

async function body(response: Response): Promise<ApiError> {
  return response.json();
}

describe("apiFailure", () => {
  it("pairs a status code with the code and Spanish message the reader sees", () => {
    const failure = apiFailure(404, "enlace_no_encontrado", "Ese enlace ya no existe.");

    expect(failure).toEqual({
      status: 404,
      error: { codigo: "enlace_no_encontrado", mensaje: "Ese enlace ya no existe." },
    });
  });
});

describe("failureResponse", () => {
  it("answers with the failure's own status rather than a blanket 400", async () => {
    const response = failureResponse(apiFailure(409, "nombre_duplicado", "Ese nombre ya está en uso."));

    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({
      codigo: "nombre_duplicado",
      mensaje: "Ese nombre ya está en uso.",
    });
  });

  it("serves JSON, since the browser's fetch layer never renders this answer", () => {
    const response = failureResponse(apiFailure(500, "error_interno", "Algo falló."));

    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("sends the error object itself, with no wrapper key around it", async () => {
    const response = failureResponse(apiFailure(400, "url_invalida", "Revisa la dirección."));

    expect(Object.keys(await body(response)).sort()).toEqual(["codigo", "mensaje"]);
  });
});

describe("the envelope the whole API shares", () => {
  /**
   * The regression this file exists for. `errorForDenial` is the guard's own
   * 401/403 body and predates this module; both must serialise to the same two
   * keys, or a client handling a 403 and a client handling a 409 are reading
   * two different contracts from one endpoint.
   */
  it("matches the shape the authorization guard already answers denials with", async () => {
    const denial = errorForDenial("not-admin");
    const validation = apiFailure(400, "tipo_invalido", "Elige una opción válida.");

    expect(Object.keys(validation.error).sort()).toEqual(Object.keys(denial).sort());
  });

  it("types the guard's denial body as the very same ApiError", () => {
    /* A compile-time assertion: if the two ever diverge, this stops building. */
    const denial: ApiError = errorForDenial("no-session");

    expect(denial.codigo).toBe("sesion_requerida");
    expect(denial.mensaje).toEqual(expect.stringMatching(/sesión/i));
  });
});
