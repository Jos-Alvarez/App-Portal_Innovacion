// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `DELETE /api/sugerencias/{id}/grupo` — la salida de un grupo, el camino de
 * corrección del ítem #16.
 *
 * The same two collaborators are replaced as everywhere else in this folder: the
 * guard and Prisma. What this suite protects is that the suggestion itself
 * survives untouched — only its membership goes.
 */

const { guardRouteAdmin, sugerencia, grupoSugerencia, historialSugerencia, transaction } =
  vi.hoisted(() => ({
    guardRouteAdmin: vi.fn(),
    sugerencia: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    grupoSugerencia: { delete: vi.fn() },
    historialSugerencia: { create: vi.fn() },
    transaction: vi.fn(),
  }));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({
  prisma: { sugerencia, grupoSugerencia, historialSugerencia, $transaction: transaction },
}));

import { NextResponse } from "next/server";

import { DELETE, dynamic } from "./route";

const CREADA = new Date("2026-08-21T14:30:00.000Z");

const FILA = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
  estado: "en_revision",
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
    {
      id: 91,
      estadoAnterior: "pendiente",
      estadoNuevo: "en_revision",
      fechaCambio: CREADA,
      autor: { nombre: "Rosa Díaz" },
    },
  ],
};

const ADMINISTRADORA = {
  allowed: true as const,
  usuario: { id: 3, correo: "rosa@limaexpresa.pe", nombre: "Rosa Díaz", esAdmin: true },
};

function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

function pedido(): Request {
  return new Request("http://localhost/api/sugerencias/31/grupo", { method: "DELETE" });
}

function contexto(id: string) {
  return { params: Promise.resolve({ id }) };
}

function estadoDeLaBase({
  grupoActual = 5 as number | null,
  existe = true,
  miembrosRestantes = 2,
} = {}) {
  sugerencia.findUnique
    .mockReset()
    .mockImplementation(async () => (existe ? { grupoId: grupoActual } : null));
  sugerencia.findMany.mockReset().mockResolvedValue([FILA]);
  sugerencia.count.mockReset().mockResolvedValue(miembrosRestantes);
  sugerencia.update.mockResolvedValue({ id: 31 });
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

describe("DELETE /api/sugerencias/[id]/grupo", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  /* ── El guard y el id ─────────────────────────────────────────────────── */

  it("responde 403 a un colaborador y no abre ninguna transacción", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "sin_permiso"));

    const response = await DELETE(pedido(), contexto("31"));

    expect(response.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("responde 401 sin sesión y no abre ninguna transacción", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sin_sesion"));

    const response = await DELETE(pedido(), contexto("31"));

    expect(response.status).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(["abc", "", "0", "-3", "2147483648"])(
    "responde 400 ante el id %o sin tocar la base",
    async (id) => {
      const response = await DELETE(pedido(), contexto(id));
      const cuerpo = (await response.json()) as { codigo: string };

      expect(response.status).toBe(400);
      expect(cuerpo.codigo).toBe("identificador_invalido");
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  /* ── El camino feliz ──────────────────────────────────────────────────── */

  it("saca la sugerencia del grupo y responde 200 con la lista completa", async () => {
    const response = await DELETE(pedido(), contexto("31"));

    expect(response.status).toBe(200);
    expect(sugerencia.update.mock.calls[0]?.[0]).toEqual({
      where: { id: 31 },
      data: { grupoId: null },
    });
    await expect(response.json()).resolves.toMatchObject({ sugerencias: [{ id: 31 }] });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  LA SUGERENCIA SOBREVIVE ENTERA: SÓLO SE VA LA PERTENENCIA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Es exactamente lo que promete "conservan su estado y autor individuales": el
   * verbo DELETE describe qué le pasa al RECURSO QUE DIRECCIONÓ QUIEN LLAMA — la
   * pertenencia a un grupo — y no a la idea que alguien escribió.
   */
  it("no toca el estado, ni el texto, ni el autor", async () => {
    await DELETE(pedido(), contexto("31"));

    expect((sugerencia.update.mock.calls[0]?.[0] as { data: object }).data).toEqual({
      grupoId: null,
    });
  });

  it("no escribe ningún asiento en el historial", async () => {
    await DELETE(pedido(), contexto("31"));

    expect(historialSugerencia.create).not.toHaveBeenCalled();
  });

  it("responde con el historial intacto de la sugerencia", async () => {
    const cuerpo = (await (await DELETE(pedido(), contexto("31"))).json()) as {
      sugerencias: { historial: unknown[]; estado: string }[];
    };

    expect(cuerpo.sugerencias[0]?.historial).toHaveLength(2);
    expect(cuerpo.sugerencias[0]?.estado).toBe("en_revision");
  });

  it("disuelve el grupo que quedó con un solo miembro", async () => {
    estadoDeLaBase({ miembrosRestantes: 1 });

    await DELETE(pedido(), contexto("31"));

    expect(grupoSugerencia.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it("deja en pie el grupo que conservó el mínimo", async () => {
    estadoDeLaBase({ miembrosRestantes: 2 });

    await DELETE(pedido(), contexto("31"));

    expect(grupoSugerencia.delete).not.toHaveBeenCalled();
  });

  /* ── Los rechazos ─────────────────────────────────────────────────────── */

  it("responde 404 si la sugerencia ya no existe, sin escribir nada", async () => {
    estadoDeLaBase({ existe: false });

    const response = await DELETE(pedido(), contexto("31"));
    const cuerpo = (await response.json()) as { codigo: string };

    expect(response.status).toBe(404);
    expect(cuerpo.codigo).toBe("sugerencia_no_encontrada");
    expect(sugerencia.update).not.toHaveBeenCalled();
  });

  /** Contestar "listo" confirmaría una suposición en vez de corregirla. */
  it("responde 409 si la sugerencia ya estaba suelta", async () => {
    estadoDeLaBase({ grupoActual: null });

    const response = await DELETE(pedido(), contexto("31"));
    const cuerpo = (await response.json()) as { codigo: string };

    expect(response.status).toBe(409);
    expect(cuerpo.codigo).toBe("sugerencia_sin_grupo");
    expect(sugerencia.update).not.toHaveBeenCalled();
  });

  it("responde 500 sin reenviar lo que dijo la base", async () => {
    transaction.mockRejectedValue(new Error("Violation of FOREIGN KEY constraint"));

    const response = await DELETE(pedido(), contexto("31"));
    const cuerpo = (await response.json()) as { codigo: string; mensaje: string };

    expect(response.status).toBe(500);
    expect(cuerpo.codigo).toBe("error_interno");
    expect(cuerpo.mensaje).not.toMatch(/FOREIGN KEY|constraint/i);
  });
});
