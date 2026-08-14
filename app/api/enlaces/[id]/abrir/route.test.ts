// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/enlaces/{id}/abrir` — the one route in this API that does not
 * answer JSON when it succeeds, and the first consumer `guardRouteResource` has
 * ever had.
 *
 * The order the handler works in is the whole point of the route existing, and
 * most of these tests are about that order rather than about any single
 * outcome: authorise, re-validate the destination, record the apertura, and
 * only then redirect. A test that only checked the 302 would pass against a
 * handler that redirected first and recorded afterwards — which is the design
 * ADR 0003 rejected.
 */

const { guardRouteResource, enlace, eventoUso } = vi.hoisted(() => ({
  guardRouteResource: vi.fn(),
  enlace: { findUnique: vi.fn() },
  eventoUso: { create: vi.fn() },
}));

vi.mock("@/lib/authz", () => ({ guardRouteResource }));
vi.mock("@/lib/prisma", () => ({ prisma: { enlace, eventoUso } }));

import { NextResponse } from "next/server";

import { GET, dynamic } from "./route";

const COLABORADORA = {
  allowed: true as const,
  usuario: { id: 4, correo: "ana@corp.com", nombre: "Ana", esAdmin: false },
};

const DESTINO = "https://facturacion.ejemplo.com/inicio";

/** What the guard hands back when it refuses — built by the real guard. */
function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

function peticion(id: string) {
  return {
    request: new Request(`https://portal.test/api/enlaces/${id}/abrir`),
    contexto: { params: Promise.resolve({ id }) },
  };
}

function abrir(id = "7") {
  const { request, contexto } = peticion(id);
  return GET(request, contexto);
}

beforeEach(() => {
  vi.clearAllMocks();
  guardRouteResource.mockResolvedValue(COLABORADORA);
  enlace.findUnique.mockResolvedValue({ url: DESTINO });
  eventoUso.create.mockResolvedValue({ id: 1 });
});

describe("the route's own contract", () => {
  it("is always dynamic, so the guard runs on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("the happy path", () => {
  it("answers 302 to the enlace's own address", async () => {
    const response = await abrir();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(DESTINO);
  });

  /**
   * A cached 302 would be a redirect the portal never saw: the browser would
   * jump straight to the destination on the next click, skipping the guard and
   * the apertura record — the two things this route exists to perform.
   */
  it("forbids caching the redirect, which would skip the portal next time", async () => {
    const response = await abrir();

    expect(response.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("sends nothing else with the redirect", async () => {
    const response = await abrir();

    expect(await response.text()).toBe("");
  });
});

describe("authorisation", () => {
  /**
   * `guardRouteResource` had no caller anywhere in this codebase before this
   * route. It answers 403 for a missing grant AND for a grant over a resource
   * given de baja, so both are settled here before anything is read or written.
   */
  it("asks about this exact enlace, by type and id", async () => {
    await abrir("7");

    expect(guardRouteResource).toHaveBeenCalledWith({ tipo: "enlace", id: 7 });
  });

  it("returns the guard's own denial untouched, and redirects to nothing", async () => {
    guardRouteResource.mockResolvedValue(denegado(403, "acceso_denegado"));

    const response = await abrir();

    expect(response.status).toBe(403);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toEqual({
      codigo: "acceso_denegado",
      mensaje: "Mensaje del guard.",
    });
  });

  it("neither reads the destination nor records anything when access is refused", async () => {
    guardRouteResource.mockResolvedValue(denegado(401, "sesion_requerida"));

    await abrir();

    expect(enlace.findUnique).not.toHaveBeenCalled();
    expect(eventoUso.create).not.toHaveBeenCalled();
  });

  it.each(["cero", "1.5", "-3", "", "7a", "99999999999"])(
    "refuses %j as an identifier before it asks the guard about it",
    async (id) => {
      const response = await abrir(id);

      expect(response.status).toBe(400);
      expect((await response.json()).codigo).toBe("id_invalido");
      expect(guardRouteResource).not.toHaveBeenCalled();
      expect(eventoUso.create).not.toHaveBeenCalled();
    },
  );

  it("answers 404 when the row is gone, rather than redirecting nowhere", async () => {
    enlace.findUnique.mockResolvedValue(null);

    const response = await abrir();

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(eventoUso.create).not.toHaveBeenCalled();
  });
});

describe("re-validating the stored destination", () => {
  /**
   * THE SECURITY ASSERTION OF THIS FILE. The URL was validated when it was
   * written, but the database is not a trusted input: a row can predate the
   * validation or arrive by another path, and redirecting from the portal's own
   * domain to whatever the column happens to hold is an open redirect — it lends
   * the portal's name and its reader's trust to a destination nobody approved.
   */
  it.each([
    ["javascript:alert(1)", "runs as script in the reader's browser"],
    ["data:text/html,<script>alert(1)</script>", "serves attacker HTML from the redirect"],
    ["file:///c:/windows/win.ini", "is not a web address at all"],
    ["//ejemplo.com/ruta", "inherits the portal's own scheme"],
    ["no soy una url", "is not a URL"],
  ])("refuses to redirect to %j — it %s", async (url) => {
    enlace.findUnique.mockResolvedValue({ url });

    const response = await abrir();

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(500);
    expect((await response.json()).codigo).toBe("destino_no_permitido");
  });

  it("records no apertura for a destination it refused to open", async () => {
    enlace.findUnique.mockResolvedValue({ url: "javascript:alert(1)" });

    await abrir();

    expect(eventoUso.create).not.toHaveBeenCalled();
  });

  /**
   * The check reads the same normalisation the write side applies, so a stored
   * `java\tscript:` — which the URL parser reads as `javascript:` and a naive
   * string check does not — fails here too.
   */
  it("sees through control characters the URL parser would strip", async () => {
    enlace.findUnique.mockResolvedValue({ url: "java\tscript:alert(1)" });

    const response = await abrir();

    expect(response.status).toBe(500);
    expect(response.headers.get("location")).toBeNull();
  });

  /**
   * What is redirected to is the value that PASSED the check, not the raw
   * column. Sending the reader to a string the validator never judged would make
   * the check decorative.
   */
  it("redirects to the value the check approved, not to the raw column", async () => {
    enlace.findUnique.mockResolvedValue({ url: `  ${DESTINO}  ` });

    const response = await abrir();

    expect(response.headers.get("location")).toBe(DESTINO);
  });
});

describe("recording the apertura", () => {
  /**
   * `evento_uso`'s first row in the life of this project. The reference is
   * polymorphic (ADR 0002): no foreign key protects it, so writing the wrong
   * type or the wrong id produces a row the database accepts and the analytics
   * of items #18 and #19 silently misreport.
   */
  it("writes the event naming the user, the enlace and what happened", async () => {
    await abrir("7");

    expect(eventoUso.create.mock.calls[0][0]).toEqual({
      data: { usuarioId: 4, tipoRecurso: "enlace", idRecurso: 7, tipoEvento: "apertura" },
    });
  });

  it("attributes the apertura to the session user, never to the request", async () => {
    guardRouteResource.mockResolvedValue({
      allowed: true as const,
      usuario: { id: 99, correo: "otro@corp.com", nombre: "Otro", esAdmin: false },
    });

    await abrir();

    expect(eventoUso.create.mock.calls[0][0]).toMatchObject({ data: { usuarioId: 99 } });
  });

  /**
   * The record is a PRECONDITION of the redirect and not a side effect of it.
   * If it were best-effort, this route would be an expensive plain anchor: the
   * apertura is the only reason the click comes through the portal at all, and a
   * silently missing row shows up in item #19 as a resource nobody uses, which
   * is a conclusion an administrator would act on.
   */
  it("does not redirect when the apertura could not be recorded", async () => {
    eventoUso.create.mockRejectedValue(new Error("Timeout expired"));

    const response = await abrir();

    expect(response.status).toBe(500);
    expect(response.headers.get("location")).toBeNull();
    expect((await response.json()).codigo).toBe("apertura_no_registrada");
  });

  it("says nothing about the database when the record fails", async () => {
    eventoUso.create.mockRejectedValue(
      new Error("Cannot insert duplicate key in object 'dbo.evento_uso', error 2627"),
    );

    const response = await abrir();

    expect((await response.json()).mensaje).not.toMatch(/dbo|2627|duplicate|key/i);
  });

  it("every failure it can produce carries the one envelope", async () => {
    const fallos = [
      async () => {
        guardRouteResource.mockResolvedValue(denegado(403, "acceso_denegado"));
      },
      async () => {
        enlace.findUnique.mockResolvedValue(null);
      },
      async () => {
        enlace.findUnique.mockResolvedValue({ url: "javascript:alert(1)" });
      },
      async () => {
        eventoUso.create.mockRejectedValue(new Error("boom"));
      },
    ];

    for (const preparar of fallos) {
      vi.clearAllMocks();
      guardRouteResource.mockResolvedValue(COLABORADORA);
      enlace.findUnique.mockResolvedValue({ url: DESTINO });
      eventoUso.create.mockResolvedValue({ id: 1 });
      await preparar();

      const body = await (await abrir()).json();
      expect(Object.keys(body).sort()).toEqual(["codigo", "mensaje"]);
    }
  });
});
