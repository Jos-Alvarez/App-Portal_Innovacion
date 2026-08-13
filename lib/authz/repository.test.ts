import { describe, expect, it, vi } from "vitest";

import type { AuthzClient } from "@/lib/authz/repository";
import { readGrant, readUsuarioByCorreo } from "@/lib/authz/repository";

/**
 * The two reads the guard performs on every request. Like the login's
 * repository, they take the Prisma client as an argument so the suite can pass
 * a double: no connection is ever opened against the shared SQL Server
 * instance (lib/prisma-schema.test.ts states the rule).
 *
 * What these tests are really protecting is the shape of the arguments. The
 * composite primary keys of ADR 0002 reach Prisma under generated names
 * (`usuarioId_enlaceId`), and getting one wrong is the kind of mistake that
 * turns "not assigned" into a silent grant or an exception at runtime.
 */

function clientDouble(results: {
  usuario?: unknown;
  asignacionEnlace?: unknown;
  asignacionProcesador?: unknown;
}) {
  /* The argument is typed so `mock.calls[0][0]` stays inspectable under `strict`. */
  const findUsuario = vi.fn(async (_args: unknown) => results.usuario ?? null);
  const findEnlace = vi.fn(async (_args: unknown) => results.asignacionEnlace ?? null);
  const findProcesador = vi.fn(async (_args: unknown) => results.asignacionProcesador ?? null);

  const client = {
    usuario: { findUnique: findUsuario },
    asignacionEnlace: { findUnique: findEnlace },
    asignacionProcesador: { findUnique: findProcesador },
  } as unknown as AuthzClient;

  return { client, findUsuario, findEnlace, findProcesador };
}

describe("readUsuarioByCorreo", () => {
  it("keys the lookup on correo and reads only the columns authorization needs", async () => {
    const { client, findUsuario } = clientDouble({
      usuario: { id: 4, correo: "jose@corp.com", nombre: "José", esAdmin: true, activo: true },
    });

    const row = await readUsuarioByCorreo(client, "jose@corp.com");

    expect(findUsuario).toHaveBeenCalledTimes(1);
    expect(findUsuario.mock.calls[0][0]).toEqual({
      where: { correo: "jose@corp.com" },
      select: { id: true, correo: true, nombre: true, esAdmin: true, activo: true },
    });
    expect(row).toEqual({
      id: 4,
      correo: "jose@corp.com",
      nombre: "José",
      esAdmin: true,
      activo: true,
    });
  });

  it("returns null when the session's account no longer has a row", async () => {
    const { client } = clientDouble({});

    expect(await readUsuarioByCorreo(client, "fantasma@corp.com")).toBeNull();
  });
});

describe("readGrant", () => {
  it("reads asignacion_enlace by its composite key and reports the enlace's state", async () => {
    const { client, findEnlace, findProcesador } = clientDouble({
      asignacionEnlace: { enlace: { activo: true } },
    });

    const grant = await readGrant(client, { tipo: "enlace", id: 12 }, 4);

    expect(findEnlace.mock.calls[0][0]).toEqual({
      where: { usuarioId_enlaceId: { usuarioId: 4, enlaceId: 12 } },
      select: { enlace: { select: { activo: true } } },
    });
    expect(findProcesador).not.toHaveBeenCalled();
    expect(grant).toEqual({ recursoActivo: true });
  });

  it("reads asignacion_procesador by its own composite key for the other table", async () => {
    const { client, findEnlace, findProcesador } = clientDouble({
      asignacionProcesador: { procesador: { activo: false } },
    });

    const grant = await readGrant(client, { tipo: "procesador", id: 31 }, 4);

    expect(findProcesador.mock.calls[0][0]).toEqual({
      where: { usuarioId_procesadorId: { usuarioId: 4, procesadorId: 31 } },
      select: { procesador: { select: { activo: true } } },
    });
    expect(findEnlace).not.toHaveBeenCalled();
    expect(grant).toEqual({ recursoActivo: false });
  });

  it("returns null when there is no assignment row for that pair", async () => {
    const { client } = clientDouble({});

    expect(await readGrant(client, { tipo: "enlace", id: 12 }, 4)).toBeNull();
    expect(await readGrant(client, { tipo: "procesador", id: 12 }, 4)).toBeNull();
  });
});
