// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `DELETE /api/admins/{usuarioId}` — the revocation, and the hard rule of the
 * PRD: the portal never reaches zero administrators.
 *
 * Two collaborators are replaced and nothing else: the guard, because the real
 * one needs an Auth.js session and a live tenant, and Prisma, because the suite
 * never opens a connection. The schema, the transaction and the error mapping in
 * between are the real code.
 */

const { guardRouteAdmin, usuario, transaction } = vi.hoisted(() => ({
  guardRouteAdmin: vi.fn(),
  usuario: { findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: { usuario, $transaction: transaction } }));

import { NextResponse } from "next/server";

import { DELETE, dynamic } from "./route";

const ADMINISTRADORA = {
  allowed: true as const,
  usuario: { id: 3, correo: "rosa@corp.com", nombre: "Rosa Díaz", esAdmin: true },
};

const FILA = {
  id: 7,
  nombre: "Ana Quispe",
  correo: "ana@corp.com",
  area: "TI",
  activo: true,
  esAdmin: true,
};

function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

function contexto(usuarioId: string) {
  return { params: Promise.resolve({ usuarioId }) };
}

function pedido(usuarioId: string): Request {
  return new Request(`http://localhost/api/admins/${usuarioId}`, { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});

  guardRouteAdmin.mockResolvedValue(ADMINISTRADORA);
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({ usuario }));
  usuario.findUnique.mockResolvedValue(FILA);
  usuario.updateMany.mockResolvedValue({ count: 1 });
  usuario.count.mockResolvedValue(2);
});

describe("DELETE /api/admins/[usuarioId]", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("responde 403 a un colaborador y no abre ninguna transacción", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    const respuesta = await DELETE(pedido("7"), contexto("7"));

    expect(respuesta.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("responde 401 sin sesión", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sesion_requerida"));

    expect((await DELETE(pedido("7"), contexto("7"))).status).toBe(401);
  });

  it("corre el guard antes de mirar el identificador", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));

    expect((await DELETE(pedido("x"), contexto("x"))).status).toBe(403);
  });

  it.each(["x", "", "-1", "0", "1.5"])("responde 400 ante el identificador %o", async (crudo) => {
    const respuesta = await DELETE(pedido(crudo), contexto(crudo));

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: "identificador_invalido" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("quita el rol y devuelve la fila ya sin él", async () => {
    const respuesta = await DELETE(pedido("7"), contexto("7"));

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

  /** The account survives with `es_admin = 0`; only the membership is deleted. */
  it("no borra la cuenta: solo escribe el rol", async () => {
    await DELETE(pedido("7"), contexto("7"));

    expect(usuario.updateMany.mock.calls[0][0]).toMatchObject({ data: { esAdmin: false } });
  });

  it("rechaza dejar el portal sin administradores", async () => {
    usuario.count.mockResolvedValue(0);

    const respuesta = await DELETE(pedido("7"), contexto("7"));

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: "ultimo_administrador" });
  });

  /**
   * Self-revocation is an ordinary revocation — nothing in the handler asks who
   * is calling, so the rule applies identically whoever is on the other end.
   */
  it("deja que una administradora se quite el rol a sí misma si queda alguien más", async () => {
    usuario.findUnique.mockResolvedValue({ ...FILA, id: 3, correo: "rosa@corp.com" });

    expect((await DELETE(pedido("3"), contexto("3"))).status).toBe(200);
  });

  it("rechaza la auto-revocación cuando es la última administradora", async () => {
    usuario.findUnique.mockResolvedValue({ ...FILA, id: 3, correo: "rosa@corp.com" });
    usuario.count.mockResolvedValue(0);

    const respuesta = await DELETE(pedido("3"), contexto("3"));

    expect(await respuesta.json()).toMatchObject({ codigo: "ultimo_administrador" });
  });

  it("responde 404 a quien ya no existe", async () => {
    usuario.findUnique.mockResolvedValue(null);

    const respuesta = await DELETE(pedido("7"), contexto("7"));

    expect(respuesta.status).toBe(404);
    expect(await respuesta.json()).toMatchObject({ codigo: "usuario_no_encontrado" });
  });

  it("responde 409 a quien ya no tiene el rol", async () => {
    usuario.findUnique.mockResolvedValue({ ...FILA, esAdmin: false });

    const respuesta = await DELETE(pedido("7"), contexto("7"));

    expect(await respuesta.json()).toMatchObject({ codigo: "no_es_administrador" });
  });

  /**
   * `lib/auth/usuario-repository.ts` re-promotes this account on every sign-in,
   * so the revocation would silently undo itself. Refusing is the honest answer.
   */
  it("rechaza revocar la cuenta de respaldo del entorno", async () => {
    vi.stubEnv("ADMIN_EMAIL", "ANA@corp.com");

    const respuesta = await DELETE(pedido("7"), contexto("7"));

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: "cuenta_fijada" });
    expect(usuario.updateMany).not.toHaveBeenCalled();
  });

  it("no fija a nadie cuando ADMIN_EMAIL no está configurado", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");

    expect((await DELETE(pedido("7"), contexto("7"))).status).toBe(200);
  });

  /** Serializable is what makes the minimum-one rule hold under two revocations. */
  it("traduce el conflicto de escritura de Prisma a algo que se reintenta", async () => {
    transaction.mockRejectedValue({ code: "P2034" });

    const respuesta = await DELETE(pedido("7"), contexto("7"));

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: "conflicto_de_roles" });
  });

  it("responde 500 ante un fallo que no supo explicar", async () => {
    transaction.mockRejectedValue(new Error("SQL Server no responde"));

    const respuesta = await DELETE(pedido("7"), contexto("7"));

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toMatchObject({ codigo: "error_interno" });
  });
});
