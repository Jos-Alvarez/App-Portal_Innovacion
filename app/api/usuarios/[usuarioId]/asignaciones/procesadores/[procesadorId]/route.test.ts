// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `PUT` and `DELETE
 * /api/usuarios/{usuarioId}/asignaciones/procesadores/{procesadorId}`.
 *
 * The sibling of the enlaces route, and thin for the same reason: the rules are
 * tested once in `lib/asignaciones/handlers.test.ts`. What is checked here is
 * that this path names `"procesador"` — the one mistake the plumbing can make
 * that no other test would catch.
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

function contexto(usuarioId: string, procesadorId: string) {
  return { params: Promise.resolve({ usuarioId, procesadorId }) };
}

function peticion(method: "PUT" | "DELETE") {
  return new Request("https://portal.test/api/usuarios/4/asignaciones/procesadores/7", { method });
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
  it("grants a PROCESADOR, with the two identifiers in the order the path gives them", async () => {
    await PUT(peticion("PUT"), contexto("4", "7"));

    expect(asignarRecursoAUsuario).toHaveBeenCalledWith("procesador", "4", "7");
  });

  it("hands the handler's answer back untouched", async () => {
    const response = await PUT(peticion("PUT"), contexto("4", "7"));

    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("DELETE", () => {
  it("revokes a PROCESADOR, never an enlace", async () => {
    await DELETE(peticion("DELETE"), contexto("4", "7"));

    expect(revocarRecursoDeUsuario).toHaveBeenCalledWith("procesador", "4", "7");
    expect(asignarRecursoAUsuario).not.toHaveBeenCalled();
  });

  it("hands the handler's answer back untouched", async () => {
    const response = await DELETE(peticion("DELETE"), contexto("4", "7"));

    expect(await response.json()).toEqual({ ok: true });
  });
});
