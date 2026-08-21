// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/admins/directorio` — the one read the browser performs for item #17.
 *
 * Two collaborators are replaced and nothing else: the guard, because the real
 * one needs an Auth.js session and a live tenant, and Prisma, because the suite
 * never opens a connection. The degradation itself is NOT mocked — `buscarPersonas`
 * runs for real over a `fetch` double, because deciding when to fall back is the
 * whole behaviour this endpoint exists to wire up.
 */

const { guardRouteAdmin, usuario } = vi.hoisted(() => ({
  guardRouteAdmin: vi.fn(),
  usuario: { findMany: vi.fn() },
}));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: { usuario } }));

import { NextResponse } from "next/server";

import { GET, dynamic } from "./route";

const ADMINISTRADORA = {
  allowed: true as const,
  usuario: { id: 3, correo: "rosa@limaexpresa.pe", nombre: "Rosa Díaz", esAdmin: true },
};

const ENTORNO = {
  AUTH_MICROSOFT_ENTRA_ID_ID: "cliente",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "secreto",
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/tenant-abc/v2.0",
  ALLOWED_EMAIL_DOMAIN: "corp.com",
};

const FILA_ANA = {
  id: 7,
  nombre: "Ana Quispe",
  correo: "ana@corp.com",
  area: "TI",
  activo: true,
  esAdmin: false,
};

function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

function pedido(q: string | null): Request {
  const url = new URL("http://localhost/api/admins/directorio");
  if (q !== null) url.searchParams.set("q", q);

  return new Request(url);
}

function respuestaJson(cuerpo: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

/** Graph answers with these people; the token request always succeeds. */
function conDirectorio(personas: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | RequestInfo) => {
      const href = url instanceof URL ? url.href : String(url);

      return href.includes("oauth2")
        ? respuestaJson({ access_token: "t" })
        : respuestaJson({ value: personas });
    }),
  );
}

/** Graph is unreachable — the case ADR 0009 agreed to degrade for. */
function sinDirectorio() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => respuestaJson({}, { status: 403 })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  for (const [nombre, valor] of Object.entries(ENTORNO)) {
    vi.stubEnv(nombre, valor);
  }

  guardRouteAdmin.mockResolvedValue(ADMINISTRADORA);
  usuario.findMany.mockResolvedValue([]);
  conDirectorio([{ displayName: "Ana Quispe", mail: "ana@corp.com", department: "TI" }]);
});

describe("GET /api/admins/directorio", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("responde 403 a un colaborador y no consulta nada", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const respuesta = await GET(pedido("ana"));

    expect(respuesta.status).toBe(403);
    expect(usuario.findMany).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("responde 401 sin sesión", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sesion_requerida"));

    expect((await GET(pedido("ana"))).status).toBe(401);
  });

  it("corre el guard antes de mirar el término", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    expect((await GET(pedido(null))).status).toBe(403);
  });

  it("responde 400 a un término demasiado corto", async () => {
    const respuesta = await GET(pedido("a"));

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: "termino_invalido" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("responde 400 cuando no llega el parámetro", async () => {
    expect((await GET(pedido(null))).status).toBe(400);
  });

  it("devuelve a la gente del directorio y dice de dónde salió", async () => {
    const respuesta = await GET(pedido("ana"));

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({
      origen: "directorio",
      personas: [{ correo: "ana@corp.com", nombre: "Ana Quispe", area: "TI", enElPortal: null }],
    });
  });

  it("cuelga de cada persona lo que el portal ya sabe de ella", async () => {
    usuario.findMany.mockResolvedValue([FILA_ANA]);

    const { personas } = (await (await GET(pedido("ana"))).json()) as {
      personas: { enElPortal: unknown }[];
    };

    expect(personas[0].enElPortal).toEqual({ id: 7, esAdmin: false, activo: true });
  });

  /**
   * ADR 0009's mitigation. The endpoint must answer 200 — a 500 would leave the
   * screen with nothing to show and no way to say what happened.
   */
  it("degrada a los usuarios del portal cuando Graph no contesta", async () => {
    sinDirectorio();
    usuario.findMany.mockResolvedValue([FILA_ANA]);

    const respuesta = await GET(pedido("ana"));

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ origen: "portal" });
  });

  it("degrada igual cuando las credenciales de Entra no están configuradas", async () => {
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "");

    const respuesta = await GET(pedido("ana"));

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ origen: "portal" });
  });

  it("busca en el portal por el mismo término cuando degrada", async () => {
    sinDirectorio();

    await GET(pedido("ana"));

    expect(usuario.findMany.mock.calls[0][0]).toMatchObject({
      where: { OR: [{ nombre: { contains: "ana" } }, { correo: { contains: "ana" } }] },
    });
  });

  it("filtra a quien no es del dominio corporativo", async () => {
    conDirectorio([
      { displayName: "Ana Quispe", mail: "ana@corp.com" },
      { displayName: "Ana Externa", mail: "ana@otra.com" },
    ]);

    const { personas } = (await (await GET(pedido("ana"))).json()) as {
      personas: { correo: string }[];
    };

    expect(personas.map((persona) => persona.correo)).toEqual(["ana@corp.com"]);
  });

  /**
   * With both sources down there is nothing left to degrade to. The message the
   * browser gets says nothing was saved, because nothing was even read.
   */
  it("responde 500 cuando también falla la base", async () => {
    sinDirectorio();
    usuario.findMany.mockRejectedValue(new Error("SQL Server no responde"));

    const respuesta = await GET(pedido("ana"));

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toMatchObject({ codigo: "error_interno" });
  });
});
