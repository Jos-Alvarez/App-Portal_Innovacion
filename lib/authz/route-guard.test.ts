// @vitest-environment node
import { describe, expect, it } from "vitest";

import { allow, deny } from "@/lib/authz/decisions";
import { toRouteAuthorization } from "@/lib/authz/route-guard";

/**
 * The Route Handler half of the guard: a denial has to become a status code
 * and a JSON body, because a handler has no way to render anything. Node
 * environment, like `proxy.test.ts`, since this is server code built on the
 * Web `Response`.
 */

async function body(response: Response): Promise<{ codigo: string; mensaje: string }> {
  return response.json();
}

describe("toRouteAuthorization", () => {
  it("hands the resolved user to the handler when the request is allowed", () => {
    const result = toRouteAuthorization(
      allow({ id: 4, correo: "jose@corp.com", nombre: "José", esAdmin: false }),
    );

    expect(result).toEqual({
      allowed: true,
      usuario: { id: 4, correo: "jose@corp.com", nombre: "José", esAdmin: false },
    });
  });

  it("answers 403 with the Spanish error body of ADR 0003 when access is refused", async () => {
    const result = toRouteAuthorization(deny("not-assigned"));

    expect(result.allowed).toBe(false);
    if (result.allowed) {
      throw new Error("expected a denial");
    }

    expect(result.response.status).toBe(403);
    expect(await body(result.response)).toEqual({
      codigo: "acceso_denegado",
      mensaje: expect.stringMatching(/no tienes acceso/i),
    });
  });

  it("answers 401 when the request carries no usable session at all", async () => {
    const result = toRouteAuthorization(deny("no-session"));

    if (result.allowed) {
      throw new Error("expected a denial");
    }

    expect(result.response.status).toBe(401);
    expect((await body(result.response)).codigo).toBe("sesion_requerida");
  });

  it("distinguishes a disabled account from a missing permission", async () => {
    const result = toRouteAuthorization(deny("inactive-account"));

    if (result.allowed) {
      throw new Error("expected a denial");
    }

    expect(result.response.status).toBe(403);
    expect((await body(result.response)).codigo).toBe("cuenta_no_habilitada");
  });

  it("serves JSON, since the browser's fetch layer never renders this answer", async () => {
    const result = toRouteAuthorization(deny("not-admin"));

    if (result.allowed) {
      throw new Error("expected a denial");
    }

    expect(result.response.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("never reveals which check failed to a caller that just failed one", async () => {
    const notAdmin = toRouteAuthorization(deny("not-admin"));
    const notAssigned = toRouteAuthorization(deny("not-assigned"));

    if (notAdmin.allowed || notAssigned.allowed) {
      throw new Error("expected two denials");
    }

    expect(await body(notAdmin.response)).toEqual(await body(notAssigned.response));
  });
});
