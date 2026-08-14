// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/mis-recursos` — the first endpoint in this portal that serves a
 * collaborator rather than an administrator.
 *
 * Two collaborators are replaced and nothing else: the guard, because the real
 * one needs an Auth.js session and a live tenant, and Prisma, because the suite
 * never opens a connection to the shared corporate instance. The repository and
 * the error mapping in between are the real code.
 */

const { guardRoute, asignacionEnlace, asignacionProcesador } = vi.hoisted(() => ({
  guardRoute: vi.fn(),
  asignacionEnlace: { findMany: vi.fn() },
  asignacionProcesador: { findMany: vi.fn() },
}));

vi.mock("@/lib/authz", () => ({ guardRoute }));
vi.mock("@/lib/prisma", () => ({ prisma: { asignacionEnlace, asignacionProcesador } }));

import { NextResponse } from "next/server";

import { GET, dynamic } from "./route";

const COLABORADORA = {
  allowed: true as const,
  usuario: { id: 4, correo: "ana@corp.com", nombre: "Ana", esAdmin: false },
};

/** What the guard hands back when it refuses — built by the real guard. */
function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  guardRoute.mockResolvedValue(COLABORADORA);
  asignacionEnlace.findMany.mockResolvedValue([
    { enlace: { id: 7, nombre: "Portal de facturación", descripcion: null, tipo: "app" } },
  ]);
  asignacionProcesador.findMany.mockResolvedValue([
    { procesador: { id: 3, nombre: "Consolidador", descripcion: null } },
  ]);
});

describe("the route's own contract", () => {
  it("is always dynamic, so the guard runs on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/mis-recursos", () => {
  it("answers 200 with one merged list under a named key", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      recursos: [
        { tipo: "procesador", id: 3, nombre: "Consolidador", descripcion: null },
        { tipo: "app", id: 7, nombre: "Portal de facturación", descripcion: null },
      ],
    });
  });

  /**
   * ANY active collaborator, not an administrator. This is the one screen every
   * signed-in person of the company reaches, so guarding it with the admin check
   * would lock out exactly the audience it exists for.
   */
  it("asks only for an active session, not for an administrator", async () => {
    await GET();

    expect(guardRoute).toHaveBeenCalledTimes(1);
  });

  it("asks the guard before it asks the database", async () => {
    guardRoute.mockResolvedValue(denegado(403, "acceso_denegado"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(asignacionEnlace.findMany).not.toHaveBeenCalled();
    expect(asignacionProcesador.findMany).not.toHaveBeenCalled();
  });

  it("returns the guard's own denial body untouched", async () => {
    guardRoute.mockResolvedValue(denegado(401, "sesion_requerida"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      codigo: "sesion_requerida",
      mensaje: "Mensaje del guard.",
    });
  });

  /**
   * The identity comes from the guard's re-read of SQL Server and from nowhere
   * else. There is no `?usuarioId=` to honour — the request cannot name whose
   * dashboard it wants, so it cannot ask for someone else's.
   */
  it("reads the assignments of the session user, who is never named by the request", async () => {
    await GET();

    expect(asignacionEnlace.findMany.mock.calls[0][0]).toMatchObject({ where: { usuarioId: 4 } });
    expect(asignacionProcesador.findMany.mock.calls[0][0]).toMatchObject({
      where: { usuarioId: 4 },
    });
  });

  /**
   * The dashboard links to the redirect route, never to the destination, so the
   * external address has no reason to travel to the browser at all.
   */
  it("never sends the external URL of an enlace to the browser", async () => {
    const response = await GET();

    expect(JSON.stringify(await response.json())).not.toMatch(/http|url/i);
  });

  /**
   * Nothing assigned is a valid, ordinary answer and not an error: DESIGN.md's
   * empty state is a screen the dashboard renders from an empty list, so a 404
   * here would turn a normal day into a failure the client has to interpret.
   */
  it("answers 200 with an empty list when nothing is assigned", async () => {
    asignacionEnlace.findMany.mockResolvedValue([]);
    asignacionProcesador.findMany.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recursos: [] });
  });

  it("answers a generic 500 when the database fails, saying nothing about it", async () => {
    asignacionEnlace.findMany.mockRejectedValue(
      new Error("Login failed for user 'portal' on 10.20.30.40"),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.codigo).toBe("error_interno");
    expect(body.mensaje).not.toMatch(/login|10\.20\.30\.40|portal'/i);
  });
});
