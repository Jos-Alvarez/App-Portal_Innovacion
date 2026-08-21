// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/sugerencias/todas` — el listado completo del ítem #15.
 *
 * The point of this suite is the SCOPE. Item #13 left a written warning that the
 * one way to break the collaborator's box from outside is to widen its GET by
 * role, so these tests pin the other half of that promise: this route is the
 * only widened read, it is behind the admin guard, and it never reaches the
 * author-scoped function.
 */

const { guardRouteAdmin, sugerencia } = vi.hoisted(() => ({
  guardRouteAdmin: vi.fn(),
  sugerencia: { findMany: vi.fn() },
}));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: { sugerencia } }));

import { NextResponse } from "next/server";

import { GET, dynamic } from "./route";

const CREADA = new Date("2026-08-21T14:30:00.000Z");

const FILA = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
  estado: "pendiente",
  fechaCreacion: CREADA,
  autor: { nombre: "Ana Quispe", area: "Peajes" },
  grupo: null,
  historial: [
    {
      id: 90,
      estadoAnterior: null,
      estadoNuevo: "pendiente",
      fechaCambio: CREADA,
      autor: { nombre: "Ana Quispe" },
    },
  ],
};

const ADMINISTRADORA = {
  allowed: true as const,
  usuario: { id: 3, correo: "rosa@limaexpresa.pe", nombre: "Rosa Díaz", esAdmin: true },
};

/** What the guard hands back when it refuses — built by the real guard's shape. */
function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  guardRouteAdmin.mockResolvedValue(ADMINISTRADORA);
  sugerencia.findMany.mockResolvedValue([FILA]);
});

describe("GET /api/sugerencias/todas", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  EL GUARD ES EL DE ADMIN, Y CORRE ANTES DE CUALQUIER LECTURA
   * ══════════════════════════════════════════════════════════════════════════
   */
  it("responde 403 a un colaborador y no consulta la base", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "sin_permiso"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(sugerencia.findMany).not.toHaveBeenCalled();
  });

  it("responde 401 sin sesión y no consulta la base", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sin_sesion"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(sugerencia.findMany).not.toHaveBeenCalled();
  });

  it("devuelve todas las sugerencias a un administrador", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sugerencias: [{ id: 31, autor: { nombre: "Ana Quispe", area: "Peajes" } }],
    });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  ESTA ES LA LECTURA ENSANCHADA, Y SE NOTA EN QUE NO TIENE `where`
   * ══════════════════════════════════════════════════════════════════════════
   *
   * The administrator's own id is never used to filter. That is the whole
   * difference from `GET /api/sugerencias`, which answers "mine" for everyone
   * including administrators — and the reason the two are different paths rather
   * than one handler with a branch.
   */
  it("no filtra por el id de quien pregunta", async () => {
    await GET();

    expect(sugerencia.findMany.mock.calls[0]?.[0]).not.toHaveProperty("where");
    expect(JSON.stringify(sugerencia.findMany.mock.calls[0]?.[0])).not.toContain('"3"');
  });

  it("no mira `esAdmin` por su cuenta: la decisión ya la tomó el guard", async () => {
    guardRouteAdmin.mockResolvedValue({
      ...ADMINISTRADORA,
      usuario: { ...ADMINISTRADORA.usuario, esAdmin: false },
    });

    const response = await GET();

    /* El guard dijo que sí; la ruta no le hace una segunda pregunta al objeto. */
    expect(response.status).toBe(200);
  });

  it("convierte las fechas a ISO antes de mandarlas al navegador", async () => {
    const cuerpo = (await (await GET()).json()) as {
      sugerencias: { fechaCreacion: unknown; historial: { fechaCambio: unknown }[] }[];
    };

    expect(cuerpo.sugerencias[0]?.fechaCreacion).toBe(CREADA.toISOString());
    expect(cuerpo.sugerencias[0]?.historial[0]?.fechaCambio).toBe(CREADA.toISOString());
  });

  it("responde una lista vacía cuando todavía no llegó ninguna idea", async () => {
    sugerencia.findMany.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sugerencias: [] });
  });

  /* ── La falla ─────────────────────────────────────────────────────────── */

  it("responde 500 con la copia del listado, que no promete nada sobre escrituras", async () => {
    sugerencia.findMany.mockRejectedValue(new Error("connection reset"));

    const response = await GET();
    const cuerpo = (await response.json()) as { codigo: string; mensaje: string };

    expect(response.status).toBe(500);
    expect(cuerpo.codigo).toBe("error_interno");
    expect(cuerpo.mensaje).toMatch(/cargar/i);
    expect(cuerpo.mensaje).not.toMatch(/guard/i);
  });

  it("no reenvía el mensaje de la base al navegador", async () => {
    sugerencia.findMany.mockRejectedValue(new Error("Login failed for user 'portal_app'."));

    const cuerpo = (await (await GET()).json()) as { mensaje: string };

    expect(cuerpo.mensaje).not.toMatch(/portal_app|Login failed/);
  });
});
