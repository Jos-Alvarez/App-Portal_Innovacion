// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/admins` — the promotion, and ADR 0009's upsert.
 *
 * Two collaborators are replaced and nothing else: the guard, because the real
 * one needs an Auth.js session and a live tenant, and Prisma, because the suite
 * never opens a connection. The schema, the repository, the domain rule and the
 * error mapping in between are the real code, and Microsoft Graph is a `fetch`
 * double so the degradation can be exercised rather than described.
 */

const { guardRouteAdmin, usuario, transaction } = vi.hoisted(() => ({
  guardRouteAdmin: vi.fn(),
  usuario: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: { usuario, $transaction: transaction } }));

import { NextResponse } from "next/server";

import { POST, dynamic } from "./route";

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

const FILA = {
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

function pedido(cuerpo: unknown, crudo?: string): Request {
  return new Request("http://localhost/api/admins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: crudo ?? JSON.stringify(cuerpo),
  });
}

function respuestaJson(cuerpo: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

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
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({ usuario }));
  usuario.findUnique.mockResolvedValue(FILA);
  usuario.update.mockResolvedValue({ ...FILA, esAdmin: true });
  usuario.create.mockResolvedValue({ ...FILA, esAdmin: true });
  conDirectorio([{ displayName: "Ana Quispe", mail: "ana@corp.com", department: "TI" }]);
});

describe("POST /api/admins", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("responde 403 a un colaborador y no escribe nada", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const respuesta = await POST(pedido({ correo: "ana@corp.com" }));

    expect(respuesta.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("responde 401 sin sesión", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sesion_requerida"));

    expect((await POST(pedido({ correo: "ana@corp.com" }))).status).toBe(401);
  });

  it("corre el guard antes de mirar el cuerpo", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    expect((await POST(pedido({}))).status).toBe(403);
  });

  it("responde 400 ante un cuerpo que no es JSON, sin explotar", async () => {
    const respuesta = await POST(pedido(null, "{no es json"));

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: "correo_invalido" });
  });

  it("responde 400 sin correo", async () => {
    expect((await POST(pedido({}))).status).toBe(400);
  });

  it("promueve a quien ya entró al portal, con su propia identidad", async () => {
    const respuesta = await POST(pedido({ correo: "ana@corp.com" }));

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({
      administrador: {
        id: 7,
        nombre: "Ana Quispe",
        correo: "ana@corp.com",
        area: "TI",
        activo: true,
      },
    });
  });

  /** The row exists, so the directory has nothing to add — and is not asked. */
  it("no consulta el directorio cuando la persona ya tiene fila", async () => {
    await POST(pedido({ correo: "ana@corp.com" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  /** ADR 0009: the PRD promotes people found in the DIRECTORY, not in the portal. */
  it("crea la fila con lo que dice el directorio cuando la persona nunca entró", async () => {
    usuario.findUnique.mockResolvedValue(null);

    const respuesta = await POST(pedido({ correo: "ana@corp.com" }));

    expect(respuesta.status).toBe(200);
    expect(usuario.create.mock.calls[0][0]).toMatchObject({
      data: { correo: "ana@corp.com", nombre: "Ana Quispe", area: "TI", esAdmin: true },
    });
  });

  /**
   * The filter is a `startswith`, so `ana@corp.com` can legitimately bring back
   * `ana@corp.com.pe`. Promoting the wrong person because their address shares a
   * prefix is not a mistake anybody would find by reading the screen afterwards.
   */
  it("exige coincidencia exacta de correo en el directorio", async () => {
    usuario.findUnique.mockResolvedValue(null);
    conDirectorio([{ displayName: "Ana Otra", mail: "ana@corp.com.pe" }]);

    const respuesta = await POST(pedido({ correo: "ana@corp.com" }));

    expect(respuesta.status).toBe(404);
    expect(await respuesta.json()).toMatchObject({ codigo: "persona_no_encontrada" });
    expect(usuario.create).not.toHaveBeenCalled();
  });

  /** The write-side face of ADR 0009's degradation, with a fix in the sentence. */
  it("rechaza con un mensaje accionable si el directorio no responde y no hay fila", async () => {
    usuario.findUnique.mockResolvedValue(null);
    sinDirectorio();

    const respuesta = await POST(pedido({ correo: "ana@corp.com" }));

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: "directorio_no_disponible" });
    expect(usuario.create).not.toHaveBeenCalled();
  });

  it("sigue promoviendo a quien ya entró aunque el directorio esté caído", async () => {
    sinDirectorio();

    expect((await POST(pedido({ correo: "ana@corp.com" }))).status).toBe(200);
  });

  it("normaliza el correo antes de buscar la fila", async () => {
    await POST(pedido({ correo: "  Ana@Corp.COM " }));

    expect(usuario.findUnique.mock.calls[0][0]).toMatchObject({
      where: { correo: "ana@corp.com" },
    });
  });

  /**
   * A role granted under an address the login itself would reject is a role
   * granted to nobody — and the row would sit in the list forever.
   */
  it("rechaza una dirección fuera del dominio corporativo", async () => {
    const respuesta = await POST(pedido({ correo: "ana@otra.com" }));

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: "dominio_no_corporativo" });
    expect(usuario.findUnique).not.toHaveBeenCalled();
  });

  /** The absence of a rule is never read as permission. */
  it("no promueve a nadie si el dominio corporativo no está configurado", async () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "");

    expect((await POST(pedido({ correo: "ana@corp.com" }))).status).toBe(409);
  });

  it("rechaza a quien ya es administradora, sin escribir", async () => {
    usuario.findUnique.mockResolvedValue({ ...FILA, esAdmin: true });

    const respuesta = await POST(pedido({ correo: "ana@corp.com" }));

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: "ya_es_administrador" });
    expect(usuario.update).not.toHaveBeenCalled();
  });

  it("rechaza dar el rol a una cuenta dada de baja", async () => {
    usuario.findUnique.mockResolvedValue({ ...FILA, activo: false });

    const respuesta = await POST(pedido({ correo: "ana@corp.com" }));

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: "cuenta_dada_de_baja" });
  });

  /** P2002: the row appeared between the read and the create. A retry fixes it. */
  it("traduce la colisión de correo a un conflicto que se reintenta", async () => {
    usuario.findUnique.mockResolvedValue(null);
    usuario.create.mockRejectedValue({ code: "P2002" });

    const respuesta = await POST(pedido({ correo: "ana@corp.com" }));

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: "conflicto_de_roles" });
  });

  it("responde 500 ante un fallo que no supo explicar", async () => {
    usuario.findUnique.mockRejectedValue(new Error("SQL Server no responde"));

    const respuesta = await POST(pedido({ correo: "ana@corp.com" }));

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toMatchObject({ codigo: "error_interno" });
  });

  /** The whole write is one transaction — the read the rule was decided on included. */
  it("lee y escribe dentro de la misma transacción", async () => {
    await POST(pedido({ correo: "ana@corp.com" }));

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
