// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/analitica` — ADR 0003's endpoint, and the whole of item #18 seen
 * from outside.
 *
 * Two collaborators are replaced and nothing else: the guard, because the real
 * one needs an Auth.js session and a live tenant, and Prisma, because the suite
 * never opens a connection. The schema, the period arithmetic, the metrics and
 * the error mapping in between are the real code — so what this file asserts is
 * the endpoint's actual contract, not a description of it.
 */

const { guardRouteAdmin, eventoUso, sugerencia, enlace, procesador, usuario } = vi.hoisted(() => ({
  guardRouteAdmin: vi.fn(),
  eventoUso: { groupBy: vi.fn() },
  sugerencia: { groupBy: vi.fn() },
  enlace: { findMany: vi.fn() },
  procesador: { findMany: vi.fn() },
  usuario: { findMany: vi.fn() },
}));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({
  prisma: { eventoUso, sugerencia, enlace, procesador, usuario },
}));

import { NextResponse } from "next/server";

import { GET, dynamic } from "./route";

const ADMINISTRADORA = {
  allowed: true as const,
  usuario: { id: 3, correo: "rosa@corp.com", nombre: "Rosa Díaz", esAdmin: true },
};

/** 21/08/2026, 10:00 in Lima — pinned so "hoy" means the same thing every run. */
const AHORA = new Date("2026-08-21T15:00:00.000Z");

function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

function pedido(query: string): Request {
  return new Request(`http://localhost/api/analitica?${query}`);
}

/** The `where` each `evento_uso` aggregation was called with, in call order. */
function rangosConsultados() {
  return eventoUso.groupBy.mock.calls.map(
    (call) => (call[0] as { where: { fecha: { gte: Date; lt: Date } } }).where.fecha,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  vi.spyOn(console, "error").mockImplementation(() => {});

  guardRouteAdmin.mockResolvedValue(ADMINISTRADORA);
  eventoUso.groupBy.mockResolvedValue([]);
  sugerencia.groupBy.mockResolvedValue([]);
  enlace.findMany.mockResolvedValue([{ id: 4, nombre: "Portal de Compras", activo: true }]);
  procesador.findMany.mockResolvedValue([{ id: 1, nombre: "Maestro de Excel", activo: true }]);
  usuario.findMany.mockResolvedValue([
    {
      id: 7,
      nombre: "Ana Quispe",
      area: "Peajes",
      activo: true,
      _count: { asignacionesEnlace: 1, asignacionesProcesador: 0 },
    },
  ]);
});

afterEach(() => {
  /* El reloj vuelve a ser el real: un temporizador falso que sobrevive al
     archivo cuelga cualquier espera asíncrona que venga después. */
  vi.useRealTimers();
});

describe("GET /api/analitica", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("responde 403 a un colaborador y no consulta nada", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const respuesta = await GET(pedido("rango=hoy"));

    expect(respuesta.status).toBe(403);
    expect(eventoUso.groupBy).not.toHaveBeenCalled();
  });

  it("responde 401 sin sesión", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sesion_requerida"));

    expect((await GET(pedido("rango=hoy"))).status).toBe(401);
  });

  it("corre el guard antes de mirar la consulta", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    expect((await GET(pedido("rango=inventado"))).status).toBe(403);
  });

  it.each([
    "",
    "rango=anual",
    "rango=personalizado",
    "rango=personalizado&desde=2026-08-01",
    "rango=personalizado&desde=2026-08-07&hasta=2026-08-01",
    "rango=personalizado&desde=2026-02-31&hasta=2026-03-01",
    "rango=7d&desde=2026-08-01&hasta=2026-08-07",
    "rango=hoy&comparar=si",
  ])("responde 400 a %o y no consulta nada", async (query) => {
    const respuesta = await GET(pedido(query));

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: "consulta_invalida" });
    expect(eventoUso.groupBy).not.toHaveBeenCalled();
  });

  it("responde el periodo en días de calendario, sin marcas de tiempo", async () => {
    const respuesta = await GET(pedido("rango=7d"));

    expect(respuesta.status).toBe(200);
    expect((await respuesta.json()).periodo).toEqual({
      desde: "2026-08-15",
      hasta: "2026-08-21",
      dias: 7,
    });
  });

  /**
   * The boundary the column is actually compared against. A −05:00 correction
   * here would move five hours of events into the neighbouring period, and
   * nothing on the screen would show it.
   */
  it("consulta la medianoche limeña sin desplazarla", async () => {
    await GET(pedido("rango=hoy"));

    expect(rangosConsultados()[0]).toEqual({
      gte: new Date("2026-08-21T00:00:00.000Z"),
      lt: new Date("2026-08-22T00:00:00.000Z"),
    });
  });

  it("resuelve «hoy» contra la noche limeña, no contra la fecha UTC", async () => {
    /* 22:00 del 21 en Lima; en UTC ya es el 22. */
    vi.setSystemTime(new Date("2026-08-22T03:00:00.000Z"));

    const respuesta = await GET(pedido("rango=hoy"));

    expect((await respuesta.json()).periodo.desde).toBe("2026-08-21");
  });

  it("acepta un rango personalizado con su día final incluido", async () => {
    const respuesta = await GET(pedido("rango=personalizado&desde=2026-03-01&hasta=2026-03-03"));

    expect((await respuesta.json()).periodo).toEqual({
      desde: "2026-03-01",
      hasta: "2026-03-03",
      dias: 3,
    });
    expect(rangosConsultados()[0].lt).toEqual(new Date("2026-03-04T00:00:00.000Z"));
  });

  it("no compara si no se lo piden", async () => {
    const respuesta = await GET(pedido("rango=7d"));

    expect((await respuesta.json()).comparacion).toBeNull();
    /* Dos agregaciones sobre evento_uso para UN periodo: recursos y usuarios. */
    expect(eventoUso.groupBy).toHaveBeenCalledTimes(2);
    expect(sugerencia.groupBy).toHaveBeenCalledTimes(1);
  });

  it("compara contra el periodo anterior equivalente", async () => {
    const respuesta = await GET(pedido("rango=7d&comparar=true"));

    expect((await respuesta.json()).comparacion.periodo).toEqual({
      desde: "2026-08-08",
      hasta: "2026-08-14",
      dias: 7,
    });
    expect(eventoUso.groupBy).toHaveBeenCalledTimes(4);
  });

  it("lee los catálogos una sola vez aunque compare", async () => {
    await GET(pedido("rango=7d&comparar=true"));

    expect(enlace.findMany).toHaveBeenCalledTimes(1);
    expect(usuario.findMany).toHaveBeenCalledTimes(1);
  });

  it("arma las métricas con los conteos que devolvió la base", async () => {
    eventoUso.groupBy.mockImplementation(async (args: { by: string[] }) =>
      args.by.includes("usuarioId")
        ? [{ usuarioId: 7, tipoEvento: "apertura", _count: { _all: 3 } }]
        : [
            { tipoRecurso: "enlace", idRecurso: 4, tipoEvento: "apertura", _count: { _all: 3 } },
            {
              tipoRecurso: "procesador",
              idRecurso: 1,
              tipoEvento: "error_formato",
              _count: { _all: 2 },
            },
          ],
    );
    sugerencia.groupBy.mockResolvedValue([
      { autorId: 7, estado: "pendiente", _count: { _all: 1 } },
    ]);

    const { metricas } = await (await GET(pedido("rango=hoy"))).json();

    expect(metricas.recursos[0]).toMatchObject({ nombre: "Portal de Compras", usos: 3 });
    expect(metricas.usuarios[0]).toMatchObject({ nombre: "Ana Quispe", usos: 3 });
    expect(metricas.areas).toEqual([{ area: "Peajes", personas: 1, usos: 3 }]);
    expect(metricas.adopcion).toEqual({ conAcceso: 1, activos: 1 });
    expect(metricas.errores[0]).toMatchObject({ nombre: "Maestro de Excel", total: 2 });
    expect(metricas.sugerencias.total).toBe(1);
  });

  /**
   * The empty answer is a real answer and has to be legible: a zero is a finding
   * an administrator may act on, so it must not arrive as an absence.
   */
  it("un periodo sin actividad responde 200 con ceros, no un error", async () => {
    const { metricas } = await (await GET(pedido("rango=hoy"))).json();

    expect(metricas.recursos).toEqual([]);
    expect(metricas.adopcion).toEqual({ conAcceso: 1, activos: 0 });
    expect(metricas.sugerencias.porEstado.pendiente).toBe(0);
  });

  it("responde 500 cuando la base no contesta", async () => {
    eventoUso.groupBy.mockRejectedValue(new Error("SQL Server no responde"));

    const respuesta = await GET(pedido("rango=hoy"));

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toMatchObject({ codigo: "error_interno" });
  });

  /** El mensaje distingue «no hay datos» de «no pudimos leerlos». */
  it("dice que las métricas faltan, no que sean cero", async () => {
    eventoUso.groupBy.mockRejectedValue(new Error("boom"));

    const { mensaje } = await (await GET(pedido("rango=hoy"))).json();

    expect(mensaje).toMatch(/no pudimos leerlos/i);
  });
});
