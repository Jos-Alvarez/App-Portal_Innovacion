// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/sugerencias` — el buzón, ADR 0003's collection route.
 *
 * Two collaborators are replaced and nothing else: the guard, because the real
 * one needs an Auth.js session and a live tenant, and Prisma, because the suite
 * never opens a connection to the shared corporate instance. The schema, the
 * repository and the error mapping in between are the real code.
 */

const { guardRoute, sugerencia, usuario, programarNotificacion } = vi.hoisted(() => ({
  guardRoute: vi.fn(),
  sugerencia: { create: vi.fn(), findMany: vi.fn() },
  usuario: { findUnique: vi.fn() },
  programarNotificacion: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({ guardRoute }));
vi.mock("@/lib/prisma", () => ({ prisma: { sugerencia, usuario } }));
/*
 * The notification of item #14 is replaced for the same reason the guard is: the
 * real one calls `after`, which throws outside a request scope, and what this
 * suite is about is WHEN the route asks for it and whether the answer survives
 * it. What the notification then does with the ask is `lib/correo`'s own suite.
 */
vi.mock("@/lib/correo/notificar", () => ({ programarNotificacion }));

import { NextResponse } from "next/server";

import { GET, POST, dynamic } from "./route";

const CREADA = new Date("2026-08-21T14:30:00.000Z");

const FILA = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
  estado: "pendiente",
  fechaCreacion: CREADA,
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

const COLABORADORA = {
  allowed: true as const,
  usuario: { id: 12, correo: "ana@limaexpresa.pe", nombre: "Ana Quispe", esAdmin: false },
};

const ADMINISTRADORA = {
  allowed: true as const,
  usuario: { id: 3, correo: "rosa@limaexpresa.pe", nombre: "Rosa Díaz", esAdmin: true },
};

const CUERPO = {
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
};

/** What the guard hands back when it refuses — built by the real guard's shape. */
function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

function pedido(cuerpo: unknown, crudo?: string): Request {
  return new Request("http://localhost/api/sugerencias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: crudo ?? JSON.stringify(cuerpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  guardRoute.mockResolvedValue(COLABORADORA);
  sugerencia.create.mockResolvedValue(FILA);
  sugerencia.findMany.mockResolvedValue([FILA]);
});

describe("el contrato de la ruta", () => {
  it("es siempre dinámica, así que el guard corre en cada petición", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/sugerencias", () => {
  it("contesta 200 con la lista bajo una clave con nombre", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sugerencias: [
        {
          id: 31,
          titulo: "Tablero de peajes",
          descripcion: "Ver el flujo por caseta sin exportar a Excel.",
          areaDestino: "Operaciones",
          estado: "pendiente",
          fechaCreacion: "2026-08-21T14:30:00.000Z",
          historial: [
            {
              id: 90,
              estadoAnterior: null,
              estadoNuevo: "pendiente",
              fechaCambio: "2026-08-21T14:30:00.000Z",
              autor: "Ana Quispe",
            },
          ],
        },
      ],
    });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  ACCESO GENERAL: NO REQUIERE ASIGNACIÓN
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El backlog cierra el ítem #13 con esa frase, y el PRD la sostiene: "el buzón
   * de ideas de innovación es de acceso general ... la asignación individual del
   * administrador se limita a decidir quién accede a cada app/agente/procesador".
   */
  it("pide solo sesión activa: ni asignación ni rol de administrador", async () => {
    await GET();

    expect(guardRoute).toHaveBeenCalledTimes(1);
  });

  it("no lee nada cuando el guard rechaza al lector", async () => {
    guardRoute.mockResolvedValue(denegado(401, "no_autenticado"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(sugerencia.findMany).not.toHaveBeenCalled();
  });

  it("lee las sugerencias del usuario que el guard identificó", async () => {
    await GET();

    expect(sugerencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { autorId: 12 } }),
    );
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  EL ALCANCE NO SE ENSANCHA POR SER ADMINISTRADOR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Una administradora también es colaboradora, y esta ruta le contesta con SUS
   * sugerencias. El ítem #15 necesita la lista completa: tiene que agregar una
   * lectura explícitamente ensanchada y protegida por `guardRouteAdmin`, nunca
   * hacer que este valor por defecto dependa del rol de quien pregunta. Un
   * alcance que se ensancha solo es un alcance que algún día se ensancha para el
   * lector equivocado, y el síntoma es la pantalla de una colaboradora llenándose
   * de ideas ajenas sin un solo error a la vista.
   */
  it("le contesta a una administradora con sus propias sugerencias, no con todas", async () => {
    guardRoute.mockResolvedValue(ADMINISTRADORA);

    await GET();

    expect(sugerencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { autorId: 3 } }),
    );
  });

  it("contesta 500 con una frase en español si la base falla", async () => {
    sugerencia.findMany.mockRejectedValue(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    const cuerpo = await response.json();

    expect(response.status).toBe(500);
    expect(cuerpo.codigo).toBe("error_interno");
    expect(cuerpo.mensaje).not.toContain("connection reset");
  });
});

describe("POST /api/sugerencias", () => {
  it("contesta 201 con la sugerencia registrada", async () => {
    const response = await POST(pedido(CUERPO));

    expect(response.status).toBe(201);
    expect((await response.json()).sugerencia).toMatchObject({ id: 31, estado: "pendiente" });
  });

  it("no escribe nada cuando el guard rechaza al remitente", async () => {
    guardRoute.mockResolvedValue(denegado(403, "sin_permiso"));

    const response = await POST(pedido(CUERPO));

    expect(response.status).toBe(403);
    expect(sugerencia.create).not.toHaveBeenCalled();
  });

  it("guarda en estado pendiente y abre el historial, sin importar el cuerpo", async () => {
    await POST(pedido(CUERPO));

    expect(sugerencia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: "pendiente",
          historial: { create: { estadoNuevo: "pendiente", cambiadoPor: 12 } },
        }),
      }),
    );
  });

  /**
   * La sesión es lo único que dice quién escribe. El cuerpo parseado ni siquiera
   * lleva una clave `autorId` que un cliente pueda intentar, así que escribir una
   * sugerencia a nombre de otro no es algo a lo que se pueda convencer a esta
   * ruta.
   */
  it("firma la sugerencia con el usuario de la sesión, no con el del cuerpo", async () => {
    await POST(pedido({ ...CUERPO, autorId: 999, estado: "aprobada", id: 1, grupoId: 5 }));

    const data = sugerencia.create.mock.calls[0][0].data;

    expect(data.autorId).toBe(12);
    expect(data.estado).toBe("pendiente");
    expect(data).not.toHaveProperty("id");
    expect(data).not.toHaveProperty("grupoId");
  });

  it.each([
    ["titulo", "titulo_invalido"],
    ["descripcion", "descripcion_invalida"],
    ["areaDestino", "area_destino_invalida"],
  ] as const)("rechaza «%s» vacío con 400 y su código", async (campo, codigo) => {
    const response = await POST(pedido({ ...CUERPO, [campo]: "" }));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe(codigo);
    expect(sugerencia.create).not.toHaveBeenCalled();
  });

  /** Un cuerpo que no es JSON es un 400 que el cliente puede arreglar, no un 500. */
  it("contesta 400 a un cuerpo que no es JSON, sin culpar al servidor", async () => {
    const response = await POST(pedido(undefined, "{no es json"));

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("datos_invalidos");
  });

  it("traduce la clave foránea del autor a un 409 con arreglo posible", async () => {
    sugerencia.create.mockRejectedValue({ code: "P2003" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(pedido(CUERPO));
    const cuerpo = await response.json();

    expect(response.status).toBe(409);
    expect(cuerpo.codigo).toBe("autor_no_encontrado");
  });

  it("contesta 500 sin filtrar el error de la base", async () => {
    sugerencia.create.mockRejectedValue(new Error("Violation of CHECK constraint sugerencia_estado_check"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(pedido(CUERPO));
    const cuerpo = await response.json();

    expect(response.status).toBe(500);
    expect(cuerpo.mensaje).not.toMatch(/CHECK|constraint|sugerencia_/i);
    expect(cuerpo.mensaje).toMatch(/no se guardó nada/i);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  EL AVISO POR CORREO — ÍTEM #14
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El PRD cerró su forma: best-effort, y su fallo "se ignora silenciosamente.
   * La sugerencia no se pierde porque ya está garantizada en la base de datos".
   * Estas cuatro pruebas son esa frase, en orden: se avisa con lo que se guardó,
   * solo si se guardó, sin esperarlo y sin que pueda romper la respuesta.
   */
  it("programa el aviso con la sugerencia creada y con el autor de la sesión", async () => {
    await POST(pedido(CUERPO));

    expect(programarNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({ id: 31, titulo: "Tablero de peajes" }),
      expect.objectContaining({ nombre: "Ana Quispe", correo: "ana@limaexpresa.pe" }),
    );
  });

  it("no avisa de nada cuando el insert falló: no hay sugerencia de la que avisar", async () => {
    sugerencia.create.mockRejectedValue({ code: "P2003" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(pedido(CUERPO));

    expect(programarNotificacion).not.toHaveBeenCalled();
  });

  it("no manda el correo dentro de la petición: la respuesta no espera a la API de correo", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await POST(pedido(CUERPO));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * El Área de Innovación y el autor tienen que estar leyendo lo mismo. Si el
   * correo se armara con otra cosa que lo devuelto —el cuerpo del pedido, por
   * ejemplo, en vez de la fila guardada— el aviso podría llevar un id que no
   * existe o un estado que la fila no tiene, y nadie lo notaría hasta que un
   * administrador buscara esa sugerencia en el panel y no estuviera.
   */
  it("avisa con exactamente la misma sugerencia que le devuelve al autor", async () => {
    const response = await POST(pedido(CUERPO));
    const { sugerencia: devuelta } = await response.json();

    expect(programarNotificacion).toHaveBeenCalledWith(devuelta, expect.anything());
  });
});
