// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/enlaces` and `POST /api/enlaces`.
 *
 * Two collaborators are replaced here and nothing else. The guard is a double
 * because the real one needs an Auth.js session and a live tenant; Prisma is a
 * double because the suite never opens a connection to the shared corporate
 * instance. Everything between them — the schema, the error mapping, the
 * repository — is the real code, so these tests exercise the actual path a
 * request takes rather than a rehearsal of it.
 */

const { guardRouteAdmin, enlace } = vi.hoisted(() => ({
  guardRouteAdmin: vi.fn(),
  enlace: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: { enlace } }));

import { NextResponse } from "next/server";

import { GET, POST, dynamic } from "./route";

const ADMIN = {
  allowed: true as const,
  usuario: { id: 1, correo: "admin@corp.com", nombre: "Admin", esAdmin: true },
};

/** What `guardRouteAdmin` hands back when it refuses — built by the real guard. */
function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

const FILA = {
  id: 7,
  nombre: "Portal de facturación",
  descripcion: null,
  url: "https://facturacion.ejemplo.com",
  tipo: "app",
  activo: true,
};

const CUERPO_VALIDO = {
  nombre: "Portal de facturación",
  url: "https://facturacion.ejemplo.com",
  tipo: "app",
};

function peticion(body: unknown, { crudo }: { crudo?: string } = {}) {
  return new Request("https://portal.test/api/enlaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: crudo ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  guardRouteAdmin.mockResolvedValue(ADMIN);
});

describe("the route's own contract", () => {
  /**
   * `lib/authz/index.ts` requires this export on every protected route: calling
   * `auth()` happens to force dynamic rendering today, but a refactor that
   * moves the guard behind an early return would hand the route back to static
   * rendering, where the guard runs once at build time and never again.
   */
  it("is always dynamic, so the guard runs on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/enlaces", () => {
  it("answers 200 with the whole catalogue under a named key", async () => {
    enlace.findMany.mockResolvedValue([FILA]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enlaces: [FILA] });
  });

  it("asks the guard before it asks the database", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(enlace.findMany).not.toHaveBeenCalled();
  });

  it("returns the guard's own denial body untouched", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sesion_requerida"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      codigo: "sesion_requerida",
      mensaje: "Mensaje del guard.",
    });
  });

  it("answers a generic 500 when the database fails, saying nothing about it", async () => {
    enlace.findMany.mockRejectedValue(new Error("Login failed for user 'portal' on 10.20.30.40"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.codigo).toBe("error_interno");
    expect(body.mensaje).not.toMatch(/login|10\.20\.30\.40|portal'/i);
  });
});

describe("POST /api/enlaces", () => {
  it("answers 201 with the row it created", async () => {
    enlace.create.mockResolvedValue(FILA);

    const response = await POST(peticion(CUERPO_VALIDO));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ enlace: FILA });
  });

  it("asks the guard before it reads the body at all", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const response = await POST(peticion(CUERPO_VALIDO));

    expect(response.status).toBe(403);
    expect(enlace.create).not.toHaveBeenCalled();
  });

  /**
   * The security assertion of this file. A rejected URL must never reach the
   * database — not stored-and-filtered-later, not stored at all — because the
   * dashboard of item #8 renders whatever is in the column.
   */
  it("refuses a javascript: URL without touching the database", async () => {
    const response = await POST(peticion({ ...CUERPO_VALIDO, url: "javascript:alert(1)" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.codigo).toBe("url_invalida");
    expect(enlace.create).not.toHaveBeenCalled();
  });

  it.each([
    ["data:text/html,<script>alert(1)</script>", "data URLs serve attacker HTML"],
    ["//ejemplo.com/ruta", "scheme-relative inherits the page's scheme"],
    ["file:///c:/windows/win.ini", "not a web link"],
  ])("refuses %j — %s", async (url) => {
    const response = await POST(peticion({ ...CUERPO_VALIDO, url }));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("url_invalida");
    expect(enlace.create).not.toHaveBeenCalled();
  });

  it("names the offending field so the form can highlight it", async () => {
    const response = await POST(peticion({ ...CUERPO_VALIDO, tipo: "otro" }));

    expect((await response.json()).codigo).toBe("tipo_invalido");
  });

  it("answers 400 rather than 500 when the body is not JSON at all", async () => {
    const response = await POST(peticion(null, { crudo: "{no soy json" }));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("datos_invalidos");
    expect(enlace.create).not.toHaveBeenCalled();
  });

  /**
   * `enlace.nombre` is unique, so this is the ordinary outcome of an
   * administrator registering something twice — it has to read as a conflict
   * they can resolve, never as a database failure.
   */
  it("turns a duplicate name into a 409 the administrator can act on", async () => {
    enlace.create.mockRejectedValue({ code: "P2002", meta: { target: ["nombre"] } });

    const response = await POST(peticion(CUERPO_VALIDO));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.codigo).toBe("nombre_duplicado");
    expect(body.mensaje).toMatch(/nombre/i);
  });

  it("answers a generic 500 for an unexpected database failure, leaking nothing", async () => {
    enlace.create.mockRejectedValue(
      new Error("Violation of CHECK constraint 'enlace_tipo_check' on 'dbo.enlace', error 547"),
    );

    const response = await POST(peticion(CUERPO_VALIDO));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.codigo).toBe("error_interno");
    expect(body.mensaje).not.toMatch(/check|constraint|547|dbo/i);
  });

  it("writes the normalised value, not the raw one the client sent", async () => {
    enlace.create.mockResolvedValue(FILA);

    await POST(
      peticion({ nombre: "  Facturación  ", url: "  https://ejemplo.com/x  ", tipo: "app" }),
    );

    expect(enlace.create.mock.calls[0][0].data).toEqual({
      nombre: "Facturación",
      descripcion: null,
      url: "https://ejemplo.com/x",
      tipo: "app",
    });
  });

  it("every failure it can produce carries the one envelope", async () => {
    enlace.create.mockRejectedValue({ code: "P2002" });

    const cuerpos = [
      { ...CUERPO_VALIDO, url: "javascript:alert(1)" },
      { ...CUERPO_VALIDO, nombre: "" },
      CUERPO_VALIDO,
    ];

    for (const cuerpo of cuerpos) {
      const body = await (await POST(peticion(cuerpo))).json();
      expect(Object.keys(body).sort()).toEqual(["codigo", "mensaje"]);
    }
  });
});
