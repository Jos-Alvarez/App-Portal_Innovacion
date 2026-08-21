// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `PATCH /api/sugerencias/{id}/estado` — el cambio de estado del ítem #15, y la
 * ruta que ADR 0003 nombra tal cual.
 *
 * Two collaborators are replaced and nothing else: the guard, because the real
 * one needs an Auth.js session and a live tenant, and Prisma, because the suite
 * never opens a connection to the shared corporate instance. The schema, the
 * repository and the error mapping in between are the real code — so a change to
 * the conditional update or to the asiento shows up here.
 */

const { guardRouteAdmin, sugerencia, historialSugerencia, transaction } = vi.hoisted(() => ({
  guardRouteAdmin: vi.fn(),
  sugerencia: { findUnique: vi.fn(), updateMany: vi.fn() },
  historialSugerencia: { create: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({
  prisma: { sugerencia, historialSugerencia, $transaction: transaction },
}));

import { NextResponse } from "next/server";

import { PATCH, dynamic } from "./route";

const CREADA = new Date("2026-08-21T14:30:00.000Z");
const REVISADA = new Date("2026-08-22T09:15:00.000Z");

const FILA = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
  estado: "en_revision",
  fechaCreacion: CREADA,
  autor: { nombre: "Ana Quispe", area: "Peajes" },
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
      fechaCambio: REVISADA,
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

function pedido(cuerpo: unknown, crudo?: string): Request {
  return new Request("http://localhost/api/sugerencias/31/estado", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: crudo ?? JSON.stringify(cuerpo),
  });
}

function contexto(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Cómo está la fila antes del cambio, y cuántas filas matcheó el update. */
function estadoDeLaBase({
  actual = "pendiente" as string | null,
  count = 1,
} = {}) {
  sugerencia.findUnique
    .mockReset()
    .mockImplementationOnce(async () => (actual === null ? null : { estado: actual }))
    .mockImplementation(async () => FILA);
  sugerencia.updateMany.mockResolvedValue({ count });
  historialSugerencia.create.mockResolvedValue({ id: 92 });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  guardRouteAdmin.mockResolvedValue(ADMINISTRADORA);
  /* El doble ejecuta el callback en el acto y deja pasar lo que tire, igual que
     la transacción interactiva real. */
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ sugerencia, historialSugerencia }),
  );
  estadoDeLaBase();
});

describe("PATCH /api/sugerencias/[id]/estado", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  /* ── El guard ─────────────────────────────────────────────────────────── */

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  REVISAR ES DEL ÁREA DE INNOVACIÓN, NUNCA DEL AUTOR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El PRD le da la revisión al Área de Innovación y a nadie más. Nada en el
   * handler pregunta de quién es la sugerencia, porque la respuesta no cambiaría
   * la decisión.
   */
  it("responde 403 a un colaborador y no abre ninguna transacción", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "sin_permiso"));

    const response = await PATCH(pedido({ estado: "aprobada" }), contexto("31"));

    expect(response.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("responde 401 sin sesión y no abre ninguna transacción", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sin_sesion"));

    const response = await PATCH(pedido({ estado: "aprobada" }), contexto("31"));

    expect(response.status).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("corre el guard antes de mirar el id o el cuerpo", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "sin_permiso"));

    /* Un id inválido Y un cuerpo inválido: igual gana el 403. */
    const response = await PATCH(pedido({ estado: "archivada" }), contexto("nope"));

    expect(response.status).toBe(403);
  });

  /* ── El id ────────────────────────────────────────────────────────────── */

  it.each(["abc", "", "1.5", "-3", "2147483648", "todas"])(
    "responde 400 ante el id %o sin tocar la base",
    async (id) => {
      const response = await PATCH(pedido({ estado: "aprobada" }), contexto(id));
      const cuerpo = (await response.json()) as { codigo: string };

      expect(response.status).toBe(400);
      expect(cuerpo.codigo).toBe("identificador_invalido");
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  /* ── El cuerpo ────────────────────────────────────────────────────────── */

  it("responde 400 ante un estado que no existe", async () => {
    const response = await PATCH(pedido({ estado: "archivada" }), contexto("31"));
    const cuerpo = (await response.json()) as { codigo: string };

    expect(response.status).toBe(400);
    expect(cuerpo.codigo).toBe("estado_invalido");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("responde 400 ante un cuerpo que no es JSON, sin explotar", async () => {
    const response = await PATCH(pedido(undefined, "{no soy json"), contexto("31"));

    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("responde 400 ante un cuerpo sin estado", async () => {
    const response = await PATCH(pedido({}), contexto("31"));

    expect(response.status).toBe(400);
  });

  /* ── El camino feliz ──────────────────────────────────────────────────── */

  it("aplica el cambio y responde 200 con la sugerencia releída", async () => {
    const response = await PATCH(pedido({ estado: "en_revision" }), contexto("31"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sugerencia: { id: 31, estado: "en_revision" },
    });
  });

  it("condiciona el update al estado leído, no sólo al id", async () => {
    await PATCH(pedido({ estado: "aprobada" }), contexto("31"));

    expect(sugerencia.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: 31, estado: "pendiente" },
      data: { estado: "aprobada" },
    });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  QUIÉN FIRMA EL ASIENTO SALE DE LA SESIÓN, NUNCA DEL CUERPO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Un libro inmutable cuya columna de autor la puede llenar quien llama no es
   * una traza de auditoría. El schema ni siquiera deja pasar la clave.
   */
  it("firma el asiento con el administrador de la sesión", async () => {
    await PATCH(pedido({ estado: "aprobada" }), contexto("31"));

    expect(historialSugerencia.create.mock.calls[0]?.[0]).toEqual({
      data: {
        sugerenciaId: 31,
        estadoAnterior: "pendiente",
        estadoNuevo: "aprobada",
        cambiadoPor: 3,
      },
    });
  });

  it("ignora un `cambiadoPor` mandado en el cuerpo", async () => {
    await PATCH(pedido({ estado: "aprobada", cambiadoPor: 99 }), contexto("31"));

    expect(historialSugerencia.create.mock.calls[0]?.[0]).toMatchObject({
      data: { cambiadoPor: 3 },
    });
  });

  /** Las palabras que escribió el colaborador no son direccionables por ningún endpoint. */
  it("no reescribe el título ni la descripción aunque vengan en el cuerpo", async () => {
    await PATCH(
      pedido({ estado: "aprobada", titulo: "Secuestrado", descripcion: "Tampoco" }),
      contexto("31"),
    );

    expect(sugerencia.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: 31, estado: "pendiente" },
      data: { estado: "aprobada" },
    });
  });

  it("escribe la fila y el asiento dentro de una sola transacción", async () => {
    await PATCH(pedido({ estado: "aprobada" }), contexto("31"));

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(sugerencia.updateMany).toHaveBeenCalledTimes(1);
    expect(historialSugerencia.create).toHaveBeenCalledTimes(1);
  });

  it("responde el historial completo, no sólo el asiento nuevo", async () => {
    const cuerpo = (await (await PATCH(pedido({ estado: "en_revision" }), contexto("31"))).json()) as {
      sugerencia: { historial: unknown[] };
    };

    expect(cuerpo.sugerencia.historial).toHaveLength(2);
  });

  /* ── Los tres rechazos ─────────────────────────────────────────────────── */

  it("responde 404 si la sugerencia ya no existe, sin escribir nada", async () => {
    estadoDeLaBase({ actual: null });

    const response = await PATCH(pedido({ estado: "aprobada" }), contexto("31"));
    const cuerpo = (await response.json()) as { codigo: string };

    expect(response.status).toBe(404);
    expect(cuerpo.codigo).toBe("sugerencia_no_encontrada");
    expect(historialSugerencia.create).not.toHaveBeenCalled();
  });

  it("responde 409 al doble clic, y no ensucia el libro con un no-evento", async () => {
    estadoDeLaBase({ actual: "aprobada" });

    const response = await PATCH(pedido({ estado: "aprobada" }), contexto("31"));
    const cuerpo = (await response.json()) as { codigo: string };

    expect(response.status).toBe(409);
    expect(cuerpo.codigo).toBe("estado_sin_cambio");
    expect(sugerencia.updateMany).not.toHaveBeenCalled();
    expect(historialSugerencia.create).not.toHaveBeenCalled();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  DOS REVISORES SOBRE LA MISMA FILA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El segundo tomó su decisión contra un estado que ya no existe. Sin el update
   * condicionado, su asiento diría que la fila estaba en `pendiente` cuando la
   * cambió — una traza internamente imposible que, peor, miente sobre la primera
   * decisión.
   */
  it("responde 409 si otro revisor movió la fila primero, y no escribe el asiento", async () => {
    estadoDeLaBase({ count: 0 });

    const response = await PATCH(pedido({ estado: "rechazada" }), contexto("31"));
    const cuerpo = (await response.json()) as { codigo: string; mensaje: string };

    expect(response.status).toBe(409);
    expect(cuerpo.codigo).toBe("estado_en_conflicto");
    expect(cuerpo.mensaje).toMatch(/actualiza/i);
    expect(historialSugerencia.create).not.toHaveBeenCalled();
  });

  /* ── La falla ─────────────────────────────────────────────────────────── */

  it("responde 500 sin reenviar lo que dijo la base", async () => {
    transaction.mockRejectedValue(new Error("Violation of CHECK constraint sugerencia_estado_check"));

    const response = await PATCH(pedido({ estado: "aprobada" }), contexto("31"));
    const cuerpo = (await response.json()) as { codigo: string; mensaje: string };

    expect(response.status).toBe(500);
    expect(cuerpo.codigo).toBe("error_interno");
    expect(cuerpo.mensaje).not.toMatch(/CHECK|constraint|sugerencia_estado_check/i);
  });

  /** No es el 500 del buzón: acá la sugerencia existe y quedó como estaba. */
  it("no le dice al revisor que la sugerencia no se guardó", async () => {
    transaction.mockRejectedValue(new Error("connection reset"));

    const cuerpo = (await (await PATCH(pedido({ estado: "aprobada" }), contexto("31"))).json()) as {
      mensaje: string;
    };

    expect(cuerpo.mensaje).not.toMatch(/no se guardó/i);
    expect(cuerpo.mensaje).toMatch(/quedó como estaba/i);
  });

  /* ── Lo que esta ruta deliberadamente no hace ─────────────────────────── */

  /**
   * El aviso del ítem #14 existe para que el Área de Innovación se entere de algo
   * que no sabía. Un cambio de estado lo hace esa misma área, así que mandarle un
   * correo por su propio clic es ruido. El autor se entera por su pantalla, que
   * revalida al foco y cada minuto (ADR 0007).
   */
  it("no manda ningún correo", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await PATCH(pedido({ estado: "aprobada" }), contexto("31"));

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
