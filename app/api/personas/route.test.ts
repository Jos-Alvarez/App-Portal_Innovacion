// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/personas` — the type-ahead behind the catalogue's "Asignar" dialog and
 * the pre-registration it needs.
 *
 * Two collaborators are replaced and nothing else: the guard, because the real
 * one needs an Auth.js session and a live tenant, and Prisma, because the suite
 * never opens a connection. The degradation itself is NOT mocked —
 * `buscarPersonas` runs for real over a `fetch` double, because deciding when to
 * fall back to the portal is the whole behaviour the GET exists to wire up.
 *
 * THE POST IS THE ONE THAT MATTERS MOST. It is the only writer of `usuario`
 * outside the sign-in (ADR 0009), so what it must prove is that it fails closed
 * on a non-corporate address and that it keys the row on the SAME normalized
 * form the login uses — a row written in another case would be orphaned in
 * silence and the grants on it lost.
 */

const { guardRouteAdmin, usuario } = vi.hoisted(() => ({
  guardRouteAdmin: vi.fn(),
  usuario: { findMany: vi.fn(), upsert: vi.fn() },
}));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: { usuario } }));

import { NextResponse } from "next/server";

import { GET, POST, dynamic } from "./route";

const ADMINISTRADORA = {
  allowed: true as const,
  usuario: { id: 3, correo: "rosa@corp.com", nombre: "Rosa Díaz", esAdmin: true },
};

const ENTORNO = {
  AUTH_MICROSOFT_ENTRA_ID_ID: "cliente",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "secreto",
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/tenant-abc/v2.0",
  ALLOWED_EMAIL_DOMAIN: "corp.com",
};

const FILA_SHEYLA = {
  id: 42,
  nombre: "Sheyla Paz",
  correo: "sheyla.paz@corp.com",
  area: "Operaciones",
  activo: true,
  esAdmin: false,
};

function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

function busqueda(q: string | null): Request {
  const url = new URL("http://localhost/api/personas");
  if (q !== null) url.searchParams.set("q", q);

  return new Request(url);
}

function alta(cuerpo: unknown): Request {
  return new Request("http://localhost/api/personas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
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
  usuario.upsert.mockResolvedValue(FILA_SHEYLA);
  conDirectorio([{ displayName: "Sheyla Paz", mail: "sheyla.paz@corp.com", department: "Operaciones" }]);
});

describe("GET /api/personas", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("responde 403 a un colaborador y no consulta nada", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const respuesta = await GET(busqueda("sheyla"));

    expect(respuesta.status).toBe(403);
    expect(usuario.findMany).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("responde 401 sin sesión", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sesion_requerida"));

    expect((await GET(busqueda("sheyla"))).status).toBe(401);
  });

  it("responde 400 a un término demasiado corto, sin salir a la red", async () => {
    const respuesta = await GET(busqueda("a"));

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: "termino_invalido" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("devuelve al directorio como origen cuando Graph contesta", async () => {
    const respuesta = await GET(busqueda("sheyla"));

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({
      origen: "directorio",
      personas: [{ correo: "sheyla.paz@corp.com", nombre: "Sheyla Paz", enElPortal: null }],
    });
  });

  it("cae al padrón del portal cuando Graph no se puede consultar, y lo dice", async () => {
    sinDirectorio();
    usuario.findMany.mockResolvedValue([FILA_SHEYLA]);

    const respuesta = await GET(busqueda("sheyla"));

    const cuerpo = (await respuesta.json()) as { origen: string; personas: unknown[] };
    /* El origen viaja hasta la pantalla: sin él, "no está" se leería como
       "esa persona no trabaja acá". */
    expect(cuerpo.origen).toBe("portal");
    expect(cuerpo.personas).toHaveLength(1);
  });

  it("no ofrece a alguien de otro dominio aunque el directorio lo devuelva", async () => {
    conDirectorio([{ displayName: "Invitada", mail: "invitada@otra.com", department: "" }]);

    const cuerpo = (await (await GET(busqueda("invitada"))).json()) as { personas: unknown[] };

    expect(cuerpo.personas).toEqual([]);
  });
});

describe("POST /api/personas", () => {
  it("responde 403 a un colaborador y no escribe nada", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const respuesta = await POST(alta({ correo: "sheyla.paz@corp.com" }));

    expect(respuesta.status).toBe(403);
    expect(usuario.upsert).not.toHaveBeenCalled();
  });

  it("crea la cuenta con el correo normalizado, que es el que usará el login", async () => {
    const respuesta = await POST(
      alta({ correo: "  Sheyla.Paz@CORP.com ", nombre: "Sheyla Paz", area: "Operaciones" }),
    );

    expect(respuesta.status).toBe(200);
    const [consulta] = usuario.upsert.mock.calls[0] as [{ where: unknown; create: unknown }];
    /* Minúsculas y sin espacios: exactamente lo que escribe
       `lib/auth/usuario-repository.ts` en el primer inicio de sesión. */
    expect(consulta.where).toEqual({ correo: "sheyla.paz@corp.com" });
    expect(consulta.create).toEqual({
      correo: "sheyla.paz@corp.com",
      nombre: "Sheyla Paz",
      area: "Operaciones",
    });
  });

  it("devuelve la cuenta con su id, que es lo que la asignación necesita", async () => {
    const respuesta = await POST(alta({ correo: "sheyla.paz@corp.com" }));

    expect(await respuesta.json()).toEqual({ usuario: FILA_SHEYLA });
  });

  it("sin nombre, usa el correo — el mismo respaldo que aplica el login", async () => {
    await POST(alta({ correo: "sheyla.paz@corp.com" }));

    const [consulta] = usuario.upsert.mock.calls[0] as [{ create: { nombre: string } }];
    expect(consulta.create.nombre).toBe("sheyla.paz@corp.com");
  });

  it("falla cerrado ante un dominio ajeno: nadie que no pueda entrar recibe cuenta", async () => {
    const respuesta = await POST(alta({ correo: "ajena@otra.com" }));

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: "dominio_no_corporativo" });
    expect(usuario.upsert).not.toHaveBeenCalled();
  });

  it("sin dominio configurado no crea a nadie, que es la dirección segura", async () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "");

    expect((await POST(alta({ correo: "sheyla.paz@corp.com" }))).status).toBe(409);
    expect(usuario.upsert).not.toHaveBeenCalled();
  });

  it("responde 400 a un cuerpo sin correo usable", async () => {
    const respuesta = await POST(alta({ correo: "no-es-un-correo" }));

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: "correo_invalido" });
    expect(usuario.upsert).not.toHaveBeenCalled();
  });

  it("responde 500 cuando la base falla, sin filtrar el detalle", async () => {
    usuario.upsert.mockRejectedValue(new Error("SQL Server: login failed for user 'portal'"));

    const respuesta = await POST(alta({ correo: "sheyla.paz@corp.com" }));

    expect(respuesta.status).toBe(500);
    expect(JSON.stringify(await respuesta.json())).not.toContain("SQL Server");
  });
});
