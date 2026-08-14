// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two handlers behind all four assignment endpoints.
 *
 * They are tested HERE, once, parameterised over both resource types, rather
 * than four times over in the route files. The route files carry nothing but
 * Next's plumbing — reading the params and naming the type — so that is all
 * their own tests check.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT IS ACTUALLY NEW HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The envelope, the guard wiring and the general Prisma mapping were settled by
 * items #5 and #6 and are not re-litigated. What this file pins down is:
 *
 *   · idempotency — the same call twice answers the same thing, twice;
 *   · the asymmetry of the baja — a deactivated resource cannot be GRANTED but
 *     must remain REVOCABLE, which is the whole reason the picker can clean up
 *     after a resource is taken down;
 *   · the same asymmetry applied to an inactive account;
 *   · that the two resource types reach two different tables.
 */

const { guardRouteAdmin, usuario, enlace, procesador, asignacionEnlace, asignacionProcesador } =
  vi.hoisted(() => ({
    guardRouteAdmin: vi.fn(),
    usuario: { findUnique: vi.fn() },
    enlace: { findUnique: vi.fn() },
    procesador: { findUnique: vi.fn() },
    asignacionEnlace: { create: vi.fn(), delete: vi.fn() },
    asignacionProcesador: { create: vi.fn(), delete: vi.fn() },
  }));

vi.mock("@/lib/authz", () => ({ guardRouteAdmin }));
vi.mock("@/lib/prisma", () => ({
  prisma: { usuario, enlace, procesador, asignacionEnlace, asignacionProcesador },
}));

import { NextResponse } from "next/server";

import { asignarRecursoAUsuario, revocarRecursoDeUsuario } from "@/lib/asignaciones/handlers";

const ADMIN = {
  allowed: true as const,
  usuario: { id: 1, correo: "admin@corp.com", nombre: "Admin", esAdmin: true },
};

function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

const TIPOS = ["enlace", "procesador"] as const;

/** The catalogue table and the assignment table each type lands in. */
function tablas(tipo: (typeof TIPOS)[number]) {
  return tipo === "enlace"
    ? { recurso: enlace, asignacion: asignacionEnlace, otra: asignacionProcesador }
    : { recurso: procesador, asignacion: asignacionProcesador, otra: asignacionEnlace };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  guardRouteAdmin.mockResolvedValue(ADMIN);
  usuario.findUnique.mockResolvedValue({ activo: true });
  enlace.findUnique.mockResolvedValue({ activo: true });
  procesador.findUnique.mockResolvedValue({ activo: true });
  asignacionEnlace.create.mockResolvedValue({});
  asignacionEnlace.delete.mockResolvedValue({});
  asignacionProcesador.create.mockResolvedValue({});
  asignacionProcesador.delete.mockResolvedValue({});
});

describe("granting a resource", () => {
  it.each(TIPOS)("answers 200 and writes the %s grant", async (tipo) => {
    const { asignacion, otra } = tablas(tipo);

    const response = await asignarRecursoAUsuario(tipo, "4", "7");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      asignacion: { usuarioId: 4, tipo, recursoId: 7, asignado: true },
    });
    expect(asignacion.create).toHaveBeenCalledTimes(1);
    expect(otra.create).not.toHaveBeenCalled();
  });

  it.each(TIPOS)("asks the guard before touching anything, for a %s", async (tipo) => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));
    const { asignacion } = tablas(tipo);

    const response = await asignarRecursoAUsuario(tipo, "4", "7");

    expect(response.status).toBe(403);
    expect(usuario.findUnique).not.toHaveBeenCalled();
    expect(asignacion.create).not.toHaveBeenCalled();
  });

  it("passes an unauthenticated denial through untouched", async () => {
    guardRouteAdmin.mockResolvedValue(denegado(401, "sesion_requerida"));

    expect((await asignarRecursoAUsuario("enlace", "4", "7")).status).toBe(401);
  });
});

describe("granting is idempotent — the property the whole feature turns on", () => {
  it.each(TIPOS)("answers the same 200 when the %s grant already exists", async (tipo) => {
    const { asignacion } = tablas(tipo);
    asignacion.create.mockRejectedValue({ code: "P2002" });

    const response = await asignarRecursoAUsuario(tipo, "4", "7");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      asignacion: { usuarioId: 4, tipo, recursoId: 7, asignado: true },
    });
  });

  it("answers a double-click identically both times, body included", async () => {
    const primera = await asignarRecursoAUsuario("enlace", "4", "7");
    asignacionEnlace.create.mockRejectedValue({ code: "P2002" });
    const segunda = await asignarRecursoAUsuario("enlace", "4", "7");

    expect(segunda.status).toBe(primera.status);
    expect(await segunda.json()).toEqual(await primera.json());
  });

  /**
   * 200 on both calls and never 201. A 201 on the first would make the two
   * answers differ, and the first thing a client does with a status that varies
   * is branch on it — which is precisely the double-click bug coming back.
   */
  it("never answers 201, so the first grant and the second are indistinguishable", async () => {
    expect((await asignarRecursoAUsuario("procesador", "4", "7")).status).toBe(200);
  });
});

describe("revoking a resource", () => {
  it.each(TIPOS)("answers 200 and deletes the %s grant", async (tipo) => {
    const { asignacion, otra } = tablas(tipo);

    const response = await revocarRecursoDeUsuario(tipo, "4", "7");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      asignacion: { usuarioId: 4, tipo, recursoId: 7, asignado: false },
    });
    expect(asignacion.delete).toHaveBeenCalledTimes(1);
    expect(otra.delete).not.toHaveBeenCalled();
  });

  it.each(TIPOS)("asks the guard first, for a %s", async (tipo) => {
    guardRouteAdmin.mockResolvedValue(denegado(403, "acceso_denegado"));
    const { asignacion } = tablas(tipo);

    expect((await revocarRecursoDeUsuario(tipo, "4", "7")).status).toBe(403);
    expect(asignacion.delete).not.toHaveBeenCalled();
  });
});

describe("revoking is idempotent", () => {
  it.each(TIPOS)("answers the same 200 when the %s grant is already gone", async (tipo) => {
    const { asignacion } = tablas(tipo);
    asignacion.delete.mockRejectedValue({ code: "P2025" });

    const response = await revocarRecursoDeUsuario(tipo, "4", "7");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      asignacion: { usuarioId: 4, tipo, recursoId: 7, asignado: false },
    });
  });

  it("answers a double-click identically both times, body included", async () => {
    const primera = await revocarRecursoDeUsuario("procesador", "4", "7");
    asignacionProcesador.delete.mockRejectedValue({ code: "P2025" });
    const segunda = await revocarRecursoDeUsuario("procesador", "4", "7");

    expect(segunda.status).toBe(primera.status);
    expect(await segunda.json()).toEqual(await primera.json());
  });
});

describe("a resource dada de baja — grantable no, revocable yes", () => {
  it.each(TIPOS)("refuses to grant a %s that is dado de baja", async (tipo) => {
    const { recurso, asignacion } = tablas(tipo);
    recurso.findUnique.mockResolvedValue({ activo: false });

    const response = await asignarRecursoAUsuario(tipo, "4", "7");

    expect(response.status).toBe(409);
    expect((await response.json()).codigo).toBe(`${tipo}_dado_de_baja`);
    expect(asignacion.create).not.toHaveBeenCalled();
  });

  /**
   * The clean-up the assignment screen is being designed to allow: a grant left
   * over from before the resource was taken down must still be removable, or it
   * is stranded in the database forever.
   */
  it.each(TIPOS)("still revokes a %s that is dado de baja", async (tipo) => {
    const { recurso, asignacion } = tablas(tipo);
    recurso.findUnique.mockResolvedValue({ activo: false });

    expect((await revocarRecursoDeUsuario(tipo, "4", "7")).status).toBe(200);
    expect(asignacion.delete).toHaveBeenCalledTimes(1);
  });
});

describe("an account dada de baja — the same asymmetry, deliberately", () => {
  it("refuses to grant to an inactive account", async () => {
    usuario.findUnique.mockResolvedValue({ activo: false });

    const response = await asignarRecursoAUsuario("enlace", "4", "7");

    expect(response.status).toBe(409);
    expect((await response.json()).codigo).toBe("usuario_dado_de_baja");
    expect(asignacionEnlace.create).not.toHaveBeenCalled();
  });

  it("checks the account before the resource, since it is the plainer answer", async () => {
    usuario.findUnique.mockResolvedValue({ activo: false });
    enlace.findUnique.mockResolvedValue({ activo: false });

    expect((await asignarRecursoAUsuario("enlace", "4", "7")).json()).resolves.toMatchObject({
      codigo: "usuario_dado_de_baja",
    });
  });

  it("still revokes from an inactive account", async () => {
    usuario.findUnique.mockResolvedValue({ activo: false });

    expect((await revocarRecursoDeUsuario("enlace", "4", "7")).status).toBe(200);
    expect(asignacionEnlace.delete).toHaveBeenCalledTimes(1);
  });
});

describe("identifiers that cannot be used", () => {
  it.each([
    ["letters", "abc"],
    ["zero", "0"],
    ["a number past the INT column", "99999999999"],
  ])("answers 400 for a usuario id that is %s", async (_caso, crudo) => {
    const response = await asignarRecursoAUsuario("enlace", crudo, "7");

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe("usuario_id_invalido");
    expect(usuario.findUnique).not.toHaveBeenCalled();
  });

  it.each(TIPOS)("answers 400 for a %s id past the INT column", async (tipo) => {
    const response = await asignarRecursoAUsuario(tipo, "4", "99999999999");

    expect(response.status).toBe(400);
    expect((await response.json()).codigo).toBe(`${tipo}_id_invalido`);
  });

  it("refuses a bad identifier on the revoke path too", async () => {
    const response = await revocarRecursoDeUsuario("procesador", "4", "abc");

    expect(response.status).toBe(400);
    expect(asignacionProcesador.delete).not.toHaveBeenCalled();
  });
});

describe("identifiers that do not exist", () => {
  it("answers 404 when there is no such account", async () => {
    usuario.findUnique.mockResolvedValue(null);

    const response = await asignarRecursoAUsuario("enlace", "4", "7");

    expect(response.status).toBe(404);
    expect((await response.json()).codigo).toBe("usuario_no_encontrado");
  });

  it.each(TIPOS)("answers 404 when there is no such %s", async (tipo) => {
    const { recurso } = tablas(tipo);
    recurso.findUnique.mockResolvedValue(null);

    const response = await asignarRecursoAUsuario(tipo, "4", "7");

    expect(response.status).toBe(404);
    expect((await response.json()).codigo).toBe(`${tipo}_no_encontrado`);
  });

  /**
   * The revoke path checks existence too, and this is a deliberate line drawn
   * against idempotency-as-blanket-200. "Already revoked" is a grant that is
   * gone from a user and a resource that both exist. A revoke aimed at a user
   * who never existed is a stale or malformed request, and answering "done" to
   * it would hide a real bug behind a green toast.
   */
  it("answers 404 on the revoke path when the account does not exist", async () => {
    usuario.findUnique.mockResolvedValue(null);

    const response = await revocarRecursoDeUsuario("enlace", "4", "7");

    expect(response.status).toBe(404);
    expect(asignacionEnlace.delete).not.toHaveBeenCalled();
  });

  it("answers 404 on the revoke path when the resource does not exist", async () => {
    procesador.findUnique.mockResolvedValue(null);

    const response = await revocarRecursoDeUsuario("procesador", "4", "7");

    expect(response.status).toBe(404);
    expect(asignacionProcesador.delete).not.toHaveBeenCalled();
  });
});

describe("failures that are nobody's fault", () => {
  it("answers 500 when the write fails for an unrecognised reason", async () => {
    asignacionEnlace.create.mockRejectedValue({ code: "P1001" });

    const response = await asignarRecursoAUsuario("enlace", "4", "7");

    expect(response.status).toBe(500);
    expect((await response.json()).codigo).toBe("error_interno");
  });

  it("answers 404 when a referenced row vanished between the check and the write", async () => {
    asignacionEnlace.create.mockRejectedValue({ code: "P2003" });

    expect((await asignarRecursoAUsuario("enlace", "4", "7")).status).toBe(404);
  });

  it("answers 500 when the existence check itself fails, instead of writing blind", async () => {
    usuario.findUnique.mockRejectedValue(new Error("connection reset"));

    const response = await asignarRecursoAUsuario("enlace", "4", "7");

    expect(response.status).toBe(500);
    expect(asignacionEnlace.create).not.toHaveBeenCalled();
  });

  it("answers 500 when the revoke's existence check fails", async () => {
    procesador.findUnique.mockRejectedValue(new Error("connection reset"));

    expect((await revocarRecursoDeUsuario("procesador", "4", "7")).status).toBe(500);
    expect(asignacionProcesador.delete).not.toHaveBeenCalled();
  });
});
