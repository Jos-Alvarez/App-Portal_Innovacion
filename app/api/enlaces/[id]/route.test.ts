// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `PATCH /api/enlaces/{id}` and `DELETE /api/enlaces/{id}`.
 *
 * The baja is the reason this file is worth reading. `DELETE` is the verb the
 * client uses, because from the catalogue's point of view the enlace leaves it;
 * what happens in the database is an `UPDATE` that sets `activo = false`, and
 * the tests below pin that down in both directions — the flag moves, and the
 * row is never removed.
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

import { DELETE, PATCH, dynamic } from "./route";

const ADMIN = {
  allowed: true as const,
  usuario: { id: 1, correo: "admin@corp.com", nombre: "Admin", esAdmin: true },
};

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

/** A DELETE carries no body; Next still hands the handler a request. */
function peticionBaja() {
  return new Request("https://portal.test/api/enlaces/7", { method: "DELETE" });
}

/** Next 16 hands route params as a promise the handler awaits. */
function contexto(id: string) {
  return { params: Promise.resolve({ id }) };
}

function peticion(body: unknown, { crudo }: { crudo?: string } = {}) {
  return new Request("https://portal.test/api/enlaces/7", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: crudo ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  guardRouteAdmin.mockResolvedValue(ADMIN);
});

describe("the route's own contract", () => {
  it("is always dynamic, so the guard runs on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("PATCH /api/enlaces/{id}", () => {
  it("answers 200 with the updated row", async () => {
    enlace.update.mockResolvedValue({ ...FILA, nombre: "Otro nombre" });

    const response = await PATCH(peticion({ nombre: "Otro nombre" }), contexto("7"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enlace: { ...FILA, nombre: "Otro nombre" } });
    expect(enlace.update.mock.calls[0][0]).toMatchObject({
      where: { id: 7 },
      data: { nombre: "Otro nombre" },
    });
  });

  it("asks the guard before anything else", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const response = await PATCH(peticion({ nombre: "X" }), contexto("7"));

    expect(response.status).toBe(403);
    expect(enlace.update).not.toHaveBeenCalled();
  });

  it.each(["abc", "", "1.5", "-3", "0", "7; DROP TABLE enlace", "٧"])(
    "refuses %j as an identifier without querying anything",
    async (id) => {
      const response = await PATCH(peticion({ nombre: "X" }), contexto(id));

      expect(response.status).toBe(400);
      expect((await response.json()).codigo).toBe("id_invalido");
      expect(enlace.update).not.toHaveBeenCalled();
    },
  );

  it("refuses an update that carries no change", async () => {
    const response = await PATCH(peticion({}), contexto("7"));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("sin_cambios");
    expect(enlace.update).not.toHaveBeenCalled();
  });

  it("answers 400 rather than 500 when the body is not JSON", async () => {
    const response = await PATCH(peticion(null, { crudo: "{roto" }), contexto("7"));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("datos_invalidos");
  });

  it("applies the same URL allowlist the creation does", async () => {
    const response = await PATCH(peticion({ url: "javascript:alert(1)" }), contexto("7"));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("url_invalida");
    expect(enlace.update).not.toHaveBeenCalled();
  });

  it("answers 404 when the row is gone, which Prisma reports as P2025", async () => {
    enlace.update.mockRejectedValue({ code: "P2025" });

    const response = await PATCH(peticion({ nombre: "X" }), contexto("7"));

    expect(response.status).toBe(404);
    expect((await response.json()).codigo).toBe("enlace_no_encontrado");
  });

  it("answers 409 when the new name is already taken", async () => {
    enlace.update.mockRejectedValue({ code: "P2002", meta: { target: ["nombre"] } });

    const response = await PATCH(peticion({ nombre: "Repetido" }), contexto("7"));

    expect(response.status).toBe(409);
    expect((await response.json()).codigo).toBe("nombre_duplicado");
  });

  it("answers a generic 500 for anything else, leaking nothing", async () => {
    enlace.update.mockRejectedValue(new Error("error 547 on dbo.enlace"));

    const response = await PATCH(peticion({ nombre: "X" }), contexto("7"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.codigo).toBe("error_interno");
    expect(body.mensaje).not.toMatch(/547|dbo/i);
  });

  /**
   * The baja is logical, so the row is still there to be brought back. Nothing
   * else in the product can set the flag; without this the first mistaken baja
   * would be permanent.
   */
  it("can bring a baja back by setting activo to true", async () => {
    enlace.update.mockResolvedValue({ ...FILA, activo: true });

    const response = await PATCH(peticion({ activo: true }), contexto("7"));

    expect(response.status).toBe(200);
    expect(enlace.update.mock.calls[0][0]).toMatchObject({ data: { activo: true } });
  });
});

describe("DELETE /api/enlaces/{id}", () => {
  it("answers 200 with the row as it now stands, given de baja", async () => {
    enlace.update.mockResolvedValue({ ...FILA, activo: false });

    const response = await DELETE(peticionBaja(), contexto("7"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enlace: { ...FILA, activo: false } });
  });

  /**
   * The rule the feature rests on. `asignacion_enlace` rows and the analytics
   * events of ADR 0010 both reference this id, and the authorization guard
   * already reads `activo = false` as "no access" — a hard delete breaks all of
   * that quietly.
   */
  it("deactivates the row and never deletes it", async () => {
    enlace.update.mockResolvedValue({ ...FILA, activo: false });

    await DELETE(peticionBaja(), contexto("7"));

    expect(enlace.delete).not.toHaveBeenCalled();
    expect(enlace.update.mock.calls[0][0]).toMatchObject({
      where: { id: 7 },
      data: { activo: false },
    });
  });

  it("asks the guard first", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sesion_requerida"));

    const response = await DELETE(peticionBaja(), contexto("7"));

    expect(response.status).toBe(401);
    expect(enlace.update).not.toHaveBeenCalled();
    expect(enlace.delete).not.toHaveBeenCalled();
  });

  it("refuses an identifier that is not a positive whole number", async () => {
    const response = await DELETE(peticionBaja(), contexto("abc"));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("id_invalido");
    expect(enlace.update).not.toHaveBeenCalled();
  });

  it("answers 404 when the enlace is already gone", async () => {
    enlace.update.mockRejectedValue({ code: "P2025" });

    const response = await DELETE(peticionBaja(), contexto("7"));

    expect(response.status).toBe(404);
    expect((await response.json()).codigo).toBe("enlace_no_encontrado");
  });

  it("answers a generic 500 for anything unexpected", async () => {
    enlace.update.mockRejectedValue(new Error("boom at 10.20.30.40:1433"));

    const response = await DELETE(peticionBaja(), contexto("7"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.codigo).toBe("error_interno");
    expect(body.mensaje).not.toMatch(/10\.20\.30\.40|1433/);
  });
});
