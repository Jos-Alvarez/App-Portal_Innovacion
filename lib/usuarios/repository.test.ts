import { describe, expect, it, vi } from "vitest";

import { type UsuariosClient, leerUsuarioConAsignaciones, listarUsuarios } from "./repository";

/**
 * The two reads the assignment screens perform.
 *
 * Prisma is a double here, as in every other repository test: the suite never
 * reaches SQL Server. What is pinned is the shape of each query — the columns
 * asked for, the order, and the absence of a `where` — because those are what
 * decide whether an administrator can see a deactivated account at all.
 */

function clienteLista(rows: readonly unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  return { cliente: { usuario: { findMany } } as unknown as UsuariosClient, findMany };
}

function clienteDetalle(row: unknown) {
  const findUnique = vi.fn().mockResolvedValue(row);
  return { cliente: { usuario: { findUnique } } as unknown as UsuariosClient, findUnique };
}

const FILA_LISTA = {
  id: 7,
  nombre: "Ana Quispe",
  correo: "ana.quispe@limaexpresa.pe",
  area: "Operaciones",
  esAdmin: false,
  activo: true,
  _count: { asignacionesEnlace: 2, asignacionesProcesador: 1 },
};

describe("listarUsuarios", () => {
  it("reads every account by name, deactivated ones included", async () => {
    const { cliente, findMany } = clienteLista([FILA_LISTA]);

    await listarUsuarios(cliente);

    const [consulta] = findMany.mock.calls[0] as [{ where?: unknown; orderBy: unknown }];
    /* No `where`: an administrator arranging access has to see the accounts
       that were deactivated, if only to strip their old grants. */
    expect(consulta.where).toBeUndefined();
    expect(consulta.orderBy).toEqual({ nombre: "asc" });
  });

  it("asks only for the columns the picker shows and how many grants each account holds", async () => {
    const { cliente, findMany } = clienteLista([]);

    await listarUsuarios(cliente);

    const [consulta] = findMany.mock.calls[0] as [{ select: Record<string, unknown> }];
    expect(consulta.select).toEqual({
      id: true,
      nombre: true,
      correo: true,
      area: true,
      esAdmin: true,
      activo: true,
      _count: { select: { asignacionesEnlace: true, asignacionesProcesador: true } },
    });
  });

  it("flattens Prisma's count into two plain numbers the screen can render", async () => {
    const { cliente } = clienteLista([FILA_LISTA]);

    await expect(listarUsuarios(cliente)).resolves.toEqual([
      {
        id: 7,
        nombre: "Ana Quispe",
        correo: "ana.quispe@limaexpresa.pe",
        area: "Operaciones",
        esAdmin: false,
        activo: true,
        enlacesAsignados: 2,
        procesadoresAsignados: 1,
      },
    ]);
  });
});

describe("leerUsuarioConAsignaciones", () => {
  it("reads the account together with the identifiers of everything granted to it", async () => {
    const { cliente, findUnique } = clienteDetalle({
      id: 7,
      nombre: "Ana Quispe",
      correo: "ana.quispe@limaexpresa.pe",
      area: "Operaciones",
      esAdmin: false,
      activo: true,
      asignacionesEnlace: [{ enlaceId: 4 }, { enlaceId: 11 }],
      asignacionesProcesador: [{ procesadorId: 9 }],
    });

    const usuario = await leerUsuarioConAsignaciones(cliente, 7);

    expect(findUnique.mock.calls[0][0]).toMatchObject({ where: { id: 7 } });
    /* Identifiers, not rows: the catalogues arrive from their own repositories,
       and what this read adds is which of them are already granted. */
    expect(usuario).toEqual({
      id: 7,
      nombre: "Ana Quispe",
      correo: "ana.quispe@limaexpresa.pe",
      area: "Operaciones",
      esAdmin: false,
      activo: true,
      enlaces: [4, 11],
      procesadores: [9],
    });
  });

  it("answers null when there is no such account", async () => {
    const { cliente } = clienteDetalle(null);

    await expect(leerUsuarioConAsignaciones(cliente, 404)).resolves.toBeNull();
  });

  it("reports an account with no grants as two empty lists, never as null", async () => {
    const { cliente } = clienteDetalle({
      id: 8,
      nombre: "Beto Ríos",
      correo: "beto.rios@limaexpresa.pe",
      area: "",
      esAdmin: true,
      activo: false,
      asignacionesEnlace: [],
      asignacionesProcesador: [],
    });

    const usuario = await leerUsuarioConAsignaciones(cliente, 8);

    expect(usuario).toMatchObject({ activo: false, enlaces: [], procesadores: [] });
  });
});
