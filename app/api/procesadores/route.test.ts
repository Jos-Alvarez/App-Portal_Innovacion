// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/procesadores` and `POST /api/procesadores`.
 *
 * The guard and Prisma are doubles; the schema, the error mapping and the
 * repository between them are the real code. Item #5 already proved the
 * envelope and the guard wiring for this shape of route, so what is checked
 * here is this resource's own behaviour: the defaults ADR 0002 states reach the
 * row, an incoherent execution contract never does, and a repeated
 * `clave_procesador` comes back as something an administrator can fix.
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

import { GET, POST, dynamic } from "./route";

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
  entradasMin: 1,
  entradasMax: null,
  tamanoMaxTotal: null,
  salidaEsperada: "archivo",
  activo: true,
};

const CUERPO_VALIDO = {
  nombre: "Maestro de Excel",
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx,csv",
  tamanoMax: 5_000_000,
  salidaEsperada: "archivo",
};

function peticion(body: unknown, { crudo }: { crudo?: string } = {}) {
  return new Request("https://portal.test/api/procesadores", {
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
  it("is always dynamic, so the guard runs on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/procesadores", () => {
  it("answers 200 with the whole catalogue under a named key", async () => {
    procesador.findMany.mockResolvedValue([FILA]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ procesadores: [FILA] });
  });

  it("asks the guard before it asks the database", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ codigo: "acceso_denegado", mensaje: "Mensaje del guard." });
    expect(procesador.findMany).not.toHaveBeenCalled();
  });

  it("answers a generic 500 when the database fails, saying nothing about it", async () => {
    procesador.findMany.mockRejectedValue(new Error("Login failed for user 'portal' on 10.20.30.40"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.codigo).toBe("error_interno");
    expect(body.mensaje).not.toMatch(/login|10\.20\.30\.40/i);
  });
});

describe("POST /api/procesadores", () => {
  it("answers 201 with the row it created", async () => {
    procesador.create.mockResolvedValue(FILA);

    const response = await POST(peticion(CUERPO_VALIDO));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ procesador: FILA });
  });

  it("asks the guard before it reads the body at all", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const response = await POST(peticion(CUERPO_VALIDO));

    expect(response.status).toBe(403);
    expect(procesador.create).not.toHaveBeenCalled();
  });

  /**
   * The row is the single source of truth for the shape of an execution
   * (ADR 0002), so an incoherent one is not a cosmetic problem: the portal
   * would build an upload screen from it and the pipeline would validate
   * against it. It must never be written.
   */
  it("refuses an incoherent execution contract without touching the database", async () => {
    const response = await POST(peticion({ ...CUERPO_VALIDO, entradasMin: 5, entradasMax: 3 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.codigo).toBe("rango_entradas_incoherente");
    expect(procesador.create).not.toHaveBeenCalled();
  });

  it("writes the normalised values and ADR 0002's defaults, not the raw body", async () => {
    procesador.create.mockResolvedValue(FILA);

    await POST(
      peticion({
        nombre: "  Maestro de Excel  ",
        claveProcesador: " Maestro-Excel ",
        formatosAceptados: "xlsx, CSV, .pdf",
        tamanoMax: 5_000_000,
        salidaEsperada: "archivo",
      }),
    );

    expect(procesador.create.mock.calls[0][0].data).toEqual({
      nombre: "Maestro de Excel",
      descripcion: null,
      claveProcesador: "maestro-excel",
      formatosAceptados: "xlsx,csv,pdf",
      tamanoMax: 5_000_000,
      entradasMin: 1,
      entradasMax: null,
      tamanoMaxTotal: null,
      salidaEsperada: "archivo",
    });
  });

  /**
   * `clave_procesador` is unique in the database, so this is the ordinary
   * outcome of registering the same module twice and has to read as a conflict
   * the administrator can resolve, never as a database failure.
   */
  it("turns a repeated clave into a 409 the administrator can act on", async () => {
    procesador.create.mockRejectedValue({ code: "P2002", meta: { target: ["clave_procesador"] } });

    const response = await POST(peticion(CUERPO_VALIDO));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.codigo).toBe("clave_duplicada");
    expect(body.mensaje).toMatch(/clave/i);
  });

  it("answers 400 rather than 500 when the body is not JSON at all", async () => {
    const response = await POST(peticion(null, { crudo: "{no soy json" }));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("datos_invalidos");
    expect(procesador.create).not.toHaveBeenCalled();
  });

  it("answers a generic 500 for an unexpected database failure, leaking nothing", async () => {
    procesador.create.mockRejectedValue(
      new Error("Violation of CHECK constraint 'procesador_salida_esperada_check', error 547"),
    );

    const response = await POST(peticion(CUERPO_VALIDO));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.codigo).toBe("error_interno");
    expect(body.mensaje).not.toMatch(/check|constraint|547/i);
  });
});
