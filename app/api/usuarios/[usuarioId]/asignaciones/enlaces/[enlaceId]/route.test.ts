// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `PUT` and `DELETE /api/usuarios/{usuarioId}/asignaciones/enlaces/{enlaceId}`.
 *
 * This file is deliberately thin. Every rule an assignment obeys — the guard,
 * the identifiers, the baja asymmetry, idempotency — is tested once in
 * `lib/asignaciones/handlers.test.ts`, parameterised over both resource types.
 * What is left here is Next's plumbing, and the one thing that plumbing can get
 * wrong: naming the WRONG RESOURCE TYPE, which would quietly grant a colleague
 * a procesador when the URL said enlace.
 */

const { asignarRecursoAUsuario, revocarRecursoDeUsuario } = vi.hoisted(() => ({
  asignarRecursoAUsuario: vi.fn(),
  revocarRecursoDeUsuario: vi.fn(),
}));

vi.mock("@/lib/asignaciones/handlers", () => ({
  asignarRecursoAUsuario,
  revocarRecursoDeUsuario,
}));

import { NextResponse } from "next/server";

import { DELETE, PUT, dynamic } from "./route";

function contexto(usuarioId: string, enlaceId: string) {
  return { params: Promise.resolve({ usuarioId, enlaceId }) };
}

function peticion(method: "PUT" | "DELETE") {
  return new Request("https://portal.test/api/usuarios/4/asignaciones/enlaces/7", { method });
}

beforeEach(() => {
  vi.clearAllMocks();
  asignarRecursoAUsuario.mockResolvedValue(NextResponse.json({ ok: true }));
  revocarRecursoDeUsuario.mockResolvedValue(NextResponse.json({ ok: true }));
});

describe("the route's own contract", () => {
  it("is always dynamic, so the guard runs on every request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("PUT", () => {
  it("grants an ENLACE, with the two identifiers in the order the path gives them", async () => {
    await PUT(peticion("PUT"), contexto("4", "7"));

    expect(asignarRecursoAUsuario).toHaveBeenCalledWith("enlace", "4", "7");
  });

  it("hands the handler's answer back untouched", async () => {
    const response = await PUT(peticion("PUT"), contexto("4", "7"));

    expect(await response.json()).toEqual({ ok: true });
  });

  it("passes the identifiers through as written, leaving them for the schema to judge", async () => {
    await PUT(peticion("PUT"), contexto("abc", "99999999999"));

    expect(asignarRecursoAUsuario).toHaveBeenCalledWith("enlace", "abc", "99999999999");
  });
});

describe("DELETE", () => {
  it("revokes an ENLACE, never a procesador", async () => {
    await DELETE(peticion("DELETE"), contexto("4", "7"));

    expect(revocarRecursoDeUsuario).toHaveBeenCalledWith("enlace", "4", "7");
    expect(asignarRecursoAUsuario).not.toHaveBeenCalled();
  });

  it("hands the handler's answer back untouched", async () => {
    const response = await DELETE(peticion("DELETE"), contexto("4", "7"));

    expect(await response.json()).toEqual({ ok: true });
  });
});
