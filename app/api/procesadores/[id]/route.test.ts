// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `PATCH /api/procesadores/{id}` and `DELETE /api/procesadores/{id}`.
 *
 * The PATCH block is the reason this file is worth reading. ADR 0002's
 * cross-field rules are about a ROW, and a PATCH carries a fragment — so the
 * handler reads the stored contract, merges the change into it and validates
 * the result. The tests below pin down the failure that motivates all of it:
 * `entradas_min: 5` alone is valid, `entradas_max: 3` alone is valid, and
 * sending them one after the other must not leave the catalogue describing an
 * execution nobody can perform.
 */

const { guardRouteAdmin, procesador } = vi.hoisted(() => ({
  guardRouteAdmin: vi.fn(),
  procesador: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: { procesador } }));

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
  nombre: "Maestro de Excel",
  descripcion: null,
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx,csv",
  tamanoMax: 5_000_000,
  entradasMin: 5,
  entradasMax: 10,
  tamanoMaxTotal: null,
  salidaEsperada: "archivo",
  activo: true,
};

/** The stored execution contract the merge starts from: min 5, max 10. */
const CONTRATO = {
  entradasMin: FILA.entradasMin,
  entradasMax: FILA.entradasMax,
  tamanoMax: FILA.tamanoMax,
  tamanoMaxTotal: FILA.tamanoMaxTotal,
};

function contexto(id: string) {
  return { params: Promise.resolve({ id }) };
}

function peticion(body: unknown, { crudo }: { crudo?: string } = {}) {
  return new Request("https://portal.test/api/procesadores/7", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: crudo ?? JSON.stringify(body),
  });
}

function peticionBaja() {
  return new Request("https://portal.test/api/procesadores/7", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  guardRouteAdmin.mockResolvedValue(ADMIN);
  procesador.findUnique.mockResolvedValue(CONTRATO);
  procesador.update.mockResolvedValue(FILA);
});

describe("the route's own contract", () => {
  it("is always dynamic, so the guard runs on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("PATCH /api/procesadores/{id}", () => {
  it("answers 200 with the updated row", async () => {
    const response = await PATCH(peticion({ nombre: "Otro nombre" }), contexto("7"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ procesador: FILA });
    expect(procesador.update.mock.calls[0][0]).toMatchObject({
      where: { id: 7 },
      data: { nombre: "Otro nombre" },
    });
  });

  it("asks the guard before anything else", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const response = await PATCH(peticion({ nombre: "X" }), contexto("7"));

    expect(response.status).toBe(403);
    expect(procesador.findUnique).not.toHaveBeenCalled();
    expect(procesador.update).not.toHaveBeenCalled();
  });

  it("refuses an identifier that is not a positive whole number", async () => {
    const response = await PATCH(peticion({ nombre: "X" }), contexto("abc"));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("id_invalido");
    expect(procesador.update).not.toHaveBeenCalled();
  });

  it("refuses an update that carries no change", async () => {
    const response = await PATCH(peticion({}), contexto("7"));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("sin_cambios");
    expect(procesador.update).not.toHaveBeenCalled();
  });

  it("answers 400 rather than 500 when the body is not JSON", async () => {
    const response = await PATCH(peticion(null, { crudo: "{roto" }), contexto("7"));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("datos_invalidos");
  });

  /**
   * THE RULE THIS ROUTE EXISTS TO ENFORCE. The fragment is valid — item #6's
   * update schema accepts `entradas_max: 3` on its own, and must, because it is
   * a fine edit for a row whose minimum is 1. It is the MERGED row that is
   * incoherent, and only a handler that read the stored row can see it.
   */
  it("validates the merged row, not the fragment, and refuses an incoherent result", async () => {
    const response = await PATCH(peticion({ entradasMax: 3 }), contexto("7"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.codigo).toBe("rango_entradas_incoherente");
    expect(procesador.update).not.toHaveBeenCalled();
  });

  it("accepts the same fragment once the rest of the row makes it coherent", async () => {
    procesador.findUnique.mockResolvedValue({ ...CONTRATO, entradasMin: 1 });

    const response = await PATCH(peticion({ entradasMax: 3 }), contexto("7"));

    expect(response.status).toBe(200);
    expect(procesador.update.mock.calls[0][0]).toMatchObject({ data: { entradasMax: 3 } });
  });

  it("accepts an edit that repairs both halves of the pair in one request", async () => {
    const response = await PATCH(peticion({ entradasMin: 1, entradasMax: 3 }), contexto("7"));

    expect(response.status).toBe(200);
  });

  it("refuses a combined size cap that falls below the stored per-file cap", async () => {
    const response = await PATCH(peticion({ tamanoMaxTotal: 1_000 }), contexto("7"));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("topes_tamano_incoherentes");
    expect(procesador.update).not.toHaveBeenCalled();
  });

  /**
   * A stored row was already validated as a whole when it was written, so an
   * edit that moves none of the four contract columns cannot make it
   * incoherent — and the read the merge would need is a query this request does
   * not have to pay for.
   */
  it("skips the contract read entirely when the edit cannot disturb it", async () => {
    await PATCH(peticion({ nombre: "Otro", salidaEsperada: "zip" }), contexto("7"));

    expect(procesador.findUnique).not.toHaveBeenCalled();
    expect(procesador.update).toHaveBeenCalled();
  });

  it("answers 404 when the row the merge needs is not there", async () => {
    procesador.findUnique.mockResolvedValue(null);

    const response = await PATCH(peticion({ entradasMax: 20 }), contexto("7"));

    expect(response.status).toBe(404);
    expect((await response.json()).codigo).toBe("procesador_no_encontrado");
    expect(procesador.update).not.toHaveBeenCalled();
  });

  /**
   * A contract change that could not be validated must not be written.
   * Falling through to the update would store exactly the incoherent row the
   * read exists to prevent, on the one request where nobody was watching.
   */
  it("refuses to write a contract change it was unable to validate", async () => {
    procesador.findUnique.mockRejectedValue(new Error("connection reset"));

    const response = await PATCH(peticion({ entradasMax: 20 }), contexto("7"));

    expect(response.status).toBe(500);
    expect((await response.json()).codigo).toBe("error_interno");
    expect(procesador.update).not.toHaveBeenCalled();
  });

  it("answers 404 when the row disappears between the read and the write", async () => {
    procesador.update.mockRejectedValue({ code: "P2025" });

    const response = await PATCH(peticion({ nombre: "X" }), contexto("7"));

    expect(response.status).toBe(404);
    expect((await response.json()).codigo).toBe("procesador_no_encontrado");
  });

  it("answers 409 when the new clave is already taken", async () => {
    procesador.update.mockRejectedValue({ code: "P2002" });

    const response = await PATCH(peticion({ claveProcesador: "limpieza-word" }), contexto("7"));

    expect(response.status).toBe(409);
    expect((await response.json()).codigo).toBe("clave_duplicada");
  });

  it("answers a generic 500 for anything else, leaking nothing", async () => {
    procesador.update.mockRejectedValue(new Error("error 547 on dbo.procesador"));

    const response = await PATCH(peticion({ nombre: "X" }), contexto("7"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.codigo).toBe("error_interno");
    expect(body.mensaje).not.toMatch(/547|dbo/i);
  });

  it("can bring a baja back by setting activo to true", async () => {
    const response = await PATCH(peticion({ activo: true }), contexto("7"));

    expect(response.status).toBe(200);
    expect(procesador.update.mock.calls[0][0]).toMatchObject({ data: { activo: true } });
  });
});

describe("DELETE /api/procesadores/{id}", () => {
  it("answers 200 with the row as it now stands, given de baja", async () => {
    procesador.update.mockResolvedValue({ ...FILA, activo: false });

    const response = await DELETE(peticionBaja(), contexto("7"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ procesador: { ...FILA, activo: false } });
  });

  /**
   * `asignacion_procesador` rows and the analytics events of ADR 0010 both
   * reference this id, and the guard already reads `activo = false` as "no
   * access". A hard delete breaks all of that quietly.
   */
  it("deactivates the row and never deletes it", async () => {
    await DELETE(peticionBaja(), contexto("7"));

    expect(procesador.delete).not.toHaveBeenCalled();
    expect(procesador.update.mock.calls[0][0]).toMatchObject({
      where: { id: 7 },
      data: { activo: false },
    });
  });

  it("asks the guard first", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sesion_requerida"));

    const response = await DELETE(peticionBaja(), contexto("7"));

    expect(response.status).toBe(401);
    expect(procesador.update).not.toHaveBeenCalled();
    expect(procesador.delete).not.toHaveBeenCalled();
  });

  it("refuses an identifier that is not a positive whole number", async () => {
    const response = await DELETE(peticionBaja(), contexto("0"));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("id_invalido");
    expect(procesador.update).not.toHaveBeenCalled();
  });

  it("answers 404 when the procesador is already gone", async () => {
    procesador.update.mockRejectedValue({ code: "P2025" });

    const response = await DELETE(peticionBaja(), contexto("7"));

    expect(response.status).toBe(404);
    expect((await response.json()).codigo).toBe("procesador_no_encontrado");
  });

  it("answers a generic 500 for anything unexpected", async () => {
    procesador.update.mockRejectedValue(new Error("boom at 10.20.30.40:1433"));

    const response = await DELETE(peticionBaja(), contexto("7"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.codigo).toBe("error_interno");
    expect(body.mensaje).not.toMatch(/10\.20\.30\.40|1433/);
  });
});
