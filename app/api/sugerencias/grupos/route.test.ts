// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/sugerencias/grupos` — ADR 0003's route, and the write side of item
 * #16.
 *
 * Two collaborators are replaced and nothing else: the guard, because the real
 * one needs an Auth.js session and a live tenant, and Prisma, because the suite
 * never opens a connection. The schema, the repository and the error mapping in
 * between are the real code.
 */

const { guardRouteAdmin, sugerencia, grupoSugerencia, historialSugerencia, transaction } =
  vi.hoisted(() => ({
    guardRouteAdmin: vi.fn(),
    sugerencia: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    grupoSugerencia: { create: vi.fn(), delete: vi.fn() },
    historialSugerencia: { create: vi.fn() },
    transaction: vi.fn(),
  }));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({
  prisma: { sugerencia, grupoSugerencia, historialSugerencia, $transaction: transaction },
}));

import { NextResponse } from "next/server";

import { POST, dynamic } from "./route";

const CREADA = new Date("2026-08-21T14:30:00.000Z");

const FILA = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
  estado: "pendiente",
  fechaCreacion: CREADA,
  autor: { nombre: "Ana Quispe", area: "Peajes" },
  grupo: { id: 42, titulo: "Tableros de peajes" },
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

const CUERPO = { titulo: "Tableros de peajes", sugerenciaIds: [7, 12] };

function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

function pedido(cuerpo: unknown, crudo?: string): Request {
  return new Request("http://localhost/api/sugerencias/grupos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: crudo ?? JSON.stringify(cuerpo),
  });
}

/** Qué encuentra la base para la selección, y cuántos miembros deja cada grupo. */
function estadoDeLaBase({
  seleccionadas = [
    { id: 7, grupoId: null },
    { id: 12, grupoId: null },
  ] as { id: number; grupoId: number | null }[],
  miembrosPorGrupo = {} as Record<number, number>,
} = {}) {
  sugerencia.findMany
    .mockReset()
    .mockImplementation(async (args?: { where?: unknown }) =>
      args?.where === undefined ? [FILA] : seleccionadas,
    );
  sugerencia.count
    .mockReset()
    .mockImplementation(async (args: { where: { grupoId: number } }) =>
      miembrosPorGrupo[args.where.grupoId] ?? 0,
    );
  sugerencia.updateMany.mockResolvedValue({ count: seleccionadas.length });
  grupoSugerencia.create.mockResolvedValue({ id: 42 });
  grupoSugerencia.delete.mockResolvedValue({ id: 0 });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  guardRouteAdmin.mockResolvedValue(ADMINISTRADORA);
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ sugerencia, grupoSugerencia }),
  );
  estadoDeLaBase();
});

describe("POST /api/sugerencias/grupos", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  /* ── El guard ─────────────────────────────────────────────────────────── */

  it("responde 403 a un colaborador y no abre ninguna transacción", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "sin_permiso"));

    const response = await POST(pedido(CUERPO));

    expect(response.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("responde 401 sin sesión y no abre ninguna transacción", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sin_sesion"));

    const response = await POST(pedido(CUERPO));

    expect(response.status).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("corre el guard antes de mirar el cuerpo", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "sin_permiso"));

    const response = await POST(pedido({ titulo: "", sugerenciaIds: [] }));

    expect(response.status).toBe(403);
  });

  /* ── El cuerpo ────────────────────────────────────────────────────────── */

  it("responde 400 sin título", async () => {
    const response = await POST(pedido({ ...CUERPO, titulo: "  " }));
    const cuerpo = (await response.json()) as { codigo: string };

    expect(response.status).toBe(400);
    expect(cuerpo.codigo).toBe("titulo_de_grupo_invalido");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("responde 400 con una sola sugerencia elegida", async () => {
    const response = await POST(pedido({ ...CUERPO, sugerenciaIds: [7] }));
    const cuerpo = (await response.json()) as { codigo: string };

    expect(response.status).toBe(400);
    expect(cuerpo.codigo).toBe("seleccion_invalida");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("responde 400 ante un cuerpo que no es JSON, sin explotar", async () => {
    const response = await POST(pedido(undefined, "{no soy json"));

    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  /* ── El camino feliz ──────────────────────────────────────────────────── */

  it("crea el grupo y responde 201 con la lista completa", async () => {
    const response = await POST(pedido(CUERPO));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      sugerencias: [{ id: 31, grupo: { id: 42, titulo: "Tableros de peajes" } }],
    });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  QUIÉN CREÓ EL GRUPO SALE DE LA SESIÓN, NUNCA DEL CUERPO
   * ══════════════════════════════════════════════════════════════════════════
   */
  it("firma el grupo con la administradora de la sesión", async () => {
    await POST(pedido(CUERPO));

    expect(grupoSugerencia.create.mock.calls[0]?.[0]).toEqual({
      data: { titulo: "Tableros de peajes", creadoPor: 3 },
    });
  });

  it("ignora un `creadoPor` mandado en el cuerpo", async () => {
    await POST(pedido({ ...CUERPO, creadoPor: 99 }));

    expect(grupoSugerencia.create.mock.calls[0]?.[0]).toMatchObject({ data: { creadoPor: 3 } });
  });

  it("mueve exactamente las elegidas al grupo nuevo", async () => {
    await POST(pedido(CUERPO));

    expect(sugerencia.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: { in: [7, 12] } },
      data: { grupoId: 42 },
    });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  AGRUPAR NO ES UNA TRANSICIÓN, ASÍ QUE NO ESCRIBE UN ASIENTO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El ADR 0002 define `historial_sugerencia` como un asiento por cada cambio de
   * ESTADO. El autor leyendo su propia traza vería, si no, una línea sobre un
   * evento que nunca le pasó a su idea.
   */
  it("no escribe ningún asiento en el historial", async () => {
    await POST(pedido(CUERPO));

    expect(historialSugerencia.create).not.toHaveBeenCalled();
  });

  it("no escribe ningún estado", async () => {
    await POST(pedido(CUERPO));

    expect((sugerencia.updateMany.mock.calls[0]?.[0] as { data: object }).data).toEqual({
      grupoId: 42,
    });
  });

  it("disuelve el grupo anterior que quedó bajo el mínimo", async () => {
    estadoDeLaBase({
      seleccionadas: [
        { id: 7, grupoId: 5 },
        { id: 12, grupoId: null },
      ],
      miembrosPorGrupo: { 5: 1 },
    });

    await POST(pedido(CUERPO));

    expect(grupoSugerencia.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it("no manda ningún correo", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await POST(pedido(CUERPO));

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  /* ── Los rechazos ─────────────────────────────────────────────────────── */

  it("responde 409 si alguna de las elegidas ya no existe, sin crear el grupo", async () => {
    estadoDeLaBase({ seleccionadas: [{ id: 7, grupoId: null }] });

    const response = await POST(pedido(CUERPO));
    const cuerpo = (await response.json()) as { codigo: string };

    expect(response.status).toBe(409);
    expect(cuerpo.codigo).toBe("sugerencias_no_encontradas");
    expect(grupoSugerencia.create).not.toHaveBeenCalled();
  });

  it("responde 500 sin reenviar lo que dijo la base", async () => {
    transaction.mockRejectedValue(new Error("Violation of FOREIGN KEY constraint"));

    const response = await POST(pedido(CUERPO));
    const cuerpo = (await response.json()) as { codigo: string; mensaje: string };

    expect(response.status).toBe(500);
    expect(cuerpo.codigo).toBe("error_interno");
    expect(cuerpo.mensaje).not.toMatch(/FOREIGN KEY|constraint/i);
  });

  /** No es el 500 de la revisión: acá no se tocó ningún estado. */
  it("no le habla al revisor de un estado que nadie tocó", async () => {
    transaction.mockRejectedValue(new Error("deadlock"));

    const cuerpo = (await (await POST(pedido(CUERPO))).json()) as { mensaje: string };

    expect(cuerpo.mensaje).toMatch(/agrupación/i);
    expect(cuerpo.mensaje).not.toMatch(/pendiente|aprobada|rechazada/i);
  });
});
