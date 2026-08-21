// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/procesadores/{id}/ejecutar` — the execution proxy of ADR 0006.
 *
 * Most of these tests are about ORDER and about what the route refuses to do,
 * because that is what the design is. A suite that only checked the happy path
 * would pass against a handler that forwarded the files first and authorised
 * afterwards, or one that validated the upload itself — both of which are
 * designs this route rejects.
 */

const { guardRouteResource, procesador, eventoUso, ejecutarEnServicio } = vi.hoisted(() => ({
  guardRouteResource: vi.fn(),
  procesador: { findUnique: vi.fn() },
  eventoUso: { create: vi.fn() },
  ejecutarEnServicio: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({ guardRouteResource }));
vi.mock("@/lib/prisma", () => ({ prisma: { procesador, eventoUso } }));
vi.mock("@/lib/procesadores/servicio", async (original) => ({
  ...(await original<typeof import("@/lib/procesadores/servicio")>()),
  ejecutarEnServicio,
}));

import { NextResponse } from "next/server";

import { POST, dynamic } from "./route";

const COLABORADORA = {
  allowed: true as const,
  usuario: { id: 4, correo: "ana@corp.com", nombre: "Ana", esAdmin: false },
};

const MULTIPART = "multipart/form-data; boundary=----abc";

/** What the guard hands back when it refuses — built by the real guard. */
function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

function peticion(id = "7", contentType: string | null = MULTIPART) {
  const request = new Request(`https://portal.test/api/procesadores/${id}/ejecutar`, {
    method: "POST",
    ...(contentType === null
      ? {}
      : { headers: { "content-type": contentType }, body: "cuerpo", duplex: "half" }),
  } as RequestInit);

  return { request, contexto: { params: Promise.resolve({ id }) } };
}

function ejecutar(id = "7", contentType: string | null = MULTIPART) {
  const { request, contexto } = peticion(id, contentType);
  return POST(request, contexto);
}

/** The service's success: a file, with the headers Starlette's FileResponse sets. */
function archivoDevuelto() {
  return new Response("resultado-en-bytes", {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="salida.xlsx"',
      "content-length": "18",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  guardRouteResource.mockResolvedValue(COLABORADORA);
  procesador.findUnique.mockResolvedValue({ claveProcesador: "maestro-excel" });
  eventoUso.create.mockResolvedValue({ id: 1 });
  ejecutarEnServicio.mockResolvedValue(archivoDevuelto());
});

describe("the route's own contract", () => {
  it("is always dynamic, so the guard runs on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("nothing leaves the portal before the guard has spoken", () => {
  it("refuses an unassigned procesador without touching the service", async () => {
    guardRouteResource.mockResolvedValue(denegado(403, "acceso_denegado"));

    const response = await ejecutar();

    expect(response.status).toBe(403);
    expect(ejecutarEnServicio).not.toHaveBeenCalled();
  });

  it("refuses an expired session the same way", async () => {
    guardRouteResource.mockResolvedValue(denegado(401, "sesion_requerida"));

    expect((await ejecutar()).status).toBe(401);
    expect(ejecutarEnServicio).not.toHaveBeenCalled();
  });

  /**
   * The guard is asked about a specific row, and a segment that is not an
   * identifier names none. This is not an authorization decision and discloses
   * nothing: a malformed id is malformed for everyone.
   */
  it("rejects a malformed id before asking the guard at all", async () => {
    const response = await ejecutar("siete");

    expect(response.status).toBe(400);
    expect(guardRouteResource).not.toHaveBeenCalled();
  });
});

describe("the envelope is checked before the network call", () => {
  it("refuses a body that is not multipart", async () => {
    const response = await ejecutar("7", "application/json");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ codigo: "envio_invalido" });
    expect(ejecutarEnServicio).not.toHaveBeenCalled();
  });

  it("refuses a request with no body", async () => {
    expect((await ejecutar("7", null)).status).toBe(400);
    expect(ejecutarEnServicio).not.toHaveBeenCalled();
  });
});

describe("the forwarding", () => {
  it("resolves the destination from the row's clave, never from the id", async () => {
    await ejecutar();

    expect(ejecutarEnServicio.mock.calls[0][0].clave).toBe("maestro-excel");
  });

  it("passes the browser's Content-Type through", async () => {
    await ejecutar();

    expect(ejecutarEnServicio.mock.calls[0][0].contentType).toBe(MULTIPART);
  });

  it("gives the call a signal, so the two-minute deadline is real", async () => {
    await ejecutar();

    expect(ejecutarEnServicio.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
  });

  /* The guard passed, so the grant existed a moment ago: the row went away. */
  it("answers 404 when the row disappeared between the guard and the read", async () => {
    procesador.findUnique.mockResolvedValue(null);

    const response = await ejecutar();

    expect(response.status).toBe(404);
    expect(ejecutarEnServicio).not.toHaveBeenCalled();
  });
});

describe("THE ROUTE DOES NOT VALIDATE THE FILES, AND MUST NOT START", () => {
  /**
   * ADR 0002 makes the row the only source of truth for the contract and ADR
   * 0006 puts its enforcement in the service's common pipeline — which is also
   * the only place that can inspect the uncompressed size a zip bomb hides. A
   * second copy here would drift, and the dangerous direction is the portal
   * refusing what the service accepts.
   *
   * The read is one column for exactly this reason: there is nothing else the
   * proxy is entitled to decide.
   */
  it("reads only the registry key, not the contract columns", async () => {
    await ejecutar();

    expect(procesador.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { claveProcesador: true },
    });
  });
});

describe("the file comes back", () => {
  it("answers 200 with the service's bytes", async () => {
    const response = await ejecutar();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("resultado-en-bytes");
  });

  it("repeats the headers that describe the file", async () => {
    const response = await ejecutar();

    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="salida.xlsx"');
  });

  /**
   * A processor's output came from a file somebody uploaded. Served inline from
   * the portal's own origin, an HTML-shaped output would run there.
   */
  it("forces a download even when the service named no file", async () => {
    ejecutarEnServicio.mockResolvedValue(new Response("bytes", { status: 200 }));

    const response = await ejecutar();

    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  /**
   * A cached result would be served to the next request for this URL without
   * the guard, without the service, and without the files that produced it.
   */
  it("never lets the result be cached", async () => {
    expect((await ejecutar()).headers.get("cache-control")).toBe("no-store");
  });

  it("records the execution", async () => {
    await ejecutar();

    expect(eventoUso.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 4,
        tipoRecurso: "procesador",
        idRecurso: 7,
        tipoEvento: "ejecucion",
      },
    });
  });

  /**
   * THE OPPOSITE DECISION TO THE APERTURA ROUTE, AND BOTH ARE RIGHT. ADR 0006:
   * "si la respuesta del servicio se pierde en el camino de vuelta, ese evento
   * no se registra; es analítica, no un dato transaccional, y el archivo del
   * usuario no depende de ello". Throwing away a finished execution to protect
   * an analytics row would be the wrong trade.
   */
  it("still delivers the file when the event cannot be written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    eventoUso.create.mockRejectedValue(new Error("SQL Server no responde"));

    const response = await ejecutar();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("resultado-en-bytes");
  });
});

describe("the service refuses", () => {
  function tipificado(status: number, tipo: string, contexto: unknown = {}) {
    return new Response(JSON.stringify({ tipo, contexto }), { status });
  }

  it("turns a typed error into a Spanish message the reader can act on", async () => {
    ejecutarEnServicio.mockResolvedValue(
      tipificado(422, "formato", {
        archivo: "ventas.pdf",
        formato_recibido: "pdf",
        formatos_aceptados: ["xlsx"],
      }),
    );

    const response = await ejecutar();

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      codigo: "formato_no_permitido",
      mensaje: expect.stringContaining("«ventas.pdf»"),
    });
  });

  it.each([
    ["formato", "error_formato"],
    ["tamano", "error_tamano"],
    ["contenido", "error_contenido"],
    ["cantidad", "error_cantidad"],
    ["clave_inexistente", "error_clave_inexistente"],
  ])("records %s as %s", async (tipo, evento) => {
    ejecutarEnServicio.mockResolvedValue(tipificado(422, tipo));

    await ejecutar();

    expect(eventoUso.create).toHaveBeenCalledWith({
      data: { usuarioId: 4, tipoRecurso: "procesador", idRecurso: 7, tipoEvento: evento },
    });
  });

  it("answers a refused count with the range the reader has to fit", async () => {
    ejecutarEnServicio.mockResolvedValue(
      tipificado(422, "cantidad", { minimo: 1, maximo: 1, recibido: 3 }),
    );

    const response = await ejecutar();

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      codigo: "cantidad_invalida",
      mensaje: expect.stringContaining("exactamente 1 archivo"),
    });
  });

  /**
   * The case that argued for widening the CHECK constraint. Before the
   * migration this recorded nothing, so a procesador whose `clave_procesador`
   * matches no module produced no events at all — indistinguishable, in item
   * #19, from one nobody wanted.
   */
  it("records a missing registry module instead of staying silent about it", async () => {
    ejecutarEnServicio.mockResolvedValue(tipificado(500, "clave_inexistente", {}));

    const response = await ejecutar();

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ codigo: "procesador_no_disponible" });
    expect(eventoUso.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 4,
        tipoRecurso: "procesador",
        idRecurso: 7,
        tipoEvento: "error_clave_inexistente",
      },
    });
  });

  it("passes a saturated service through as a 503 the reader can wait out", async () => {
    ejecutarEnServicio.mockResolvedValue(new Response(null, { status: 503 }));

    expect((await ejecutar()).status).toBe(503);
    expect(eventoUso.create).not.toHaveBeenCalled();
  });
});

describe("the service never answers", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("answers 504 when the clock runs out", async () => {
    const expirado = new Error("timed out");
    expirado.name = "TimeoutError";
    ejecutarEnServicio.mockRejectedValue(expirado);

    const response = await ejecutar();

    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ codigo: "procesamiento_expirado" });
  });

  it("answers 502 when the service cannot be reached", async () => {
    ejecutarEnServicio.mockRejectedValue(new TypeError("fetch failed"));

    const response = await ejecutar();

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ codigo: "servicio_inalcanzable" });
  });

  it("answers a database failure without reaching the service", async () => {
    procesador.findUnique.mockRejectedValue(new Error("SQL Server no responde"));

    expect((await ejecutar()).status).toBe(500);
    expect(ejecutarEnServicio).not.toHaveBeenCalled();
  });
});
