import { describe, expect, it, vi } from "vitest";

import {
  type UsuariosClient,
  leerUsuarioConAsignaciones,
  listarUsuarios,
  registrarUsuario,
} from "./repository";

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

describe("registrarUsuario", () => {
  function clienteAlta(row: unknown) {
    const upsert = vi.fn().mockResolvedValue(row);
    return { cliente: { usuario: { upsert } } as unknown as UsuariosClient, upsert };
  }

  const FILA = {
    id: 42,
    nombre: "Sheyla Paz",
    correo: "sheyla.paz@limaexpresa.pe",
    area: "Operaciones",
    esAdmin: false,
    activo: true,
  };

  it("keys the row on the address, which is what makes the login find it later", async () => {
    const { cliente, upsert } = clienteAlta(FILA);

    await registrarUsuario(cliente, {
      correo: "sheyla.paz@limaexpresa.pe",
      nombre: "Sheyla Paz",
      area: "Operaciones",
    });

    const [consulta] = upsert.mock.calls[0] as [{ where: unknown; create: unknown }];
    /* `lib/auth/usuario-repository.ts` upserts on this same column, so this row
       is the one the first sign-in updates instead of duplicating. */
    expect(consulta.where).toEqual({ correo: "sheyla.paz@limaexpresa.pe" });
    expect(consulta.create).toEqual({
      correo: "sheyla.paz@limaexpresa.pe",
      nombre: "Sheyla Paz",
      area: "Operaciones",
    });
  });

  it("writes neither the role nor the baja flag: it grants nothing and revives nobody", async () => {
    const { cliente, upsert } = clienteAlta(FILA);

    await registrarUsuario(cliente, { correo: FILA.correo, nombre: "X", area: "" });

    const [consulta] = upsert.mock.calls[0] as [{ create: Record<string, unknown> }];
    expect(consulta.create).not.toHaveProperty("esAdmin");
    expect(consulta.create).not.toHaveProperty("activo");
  });

  it("touches nothing when the account is already there — its login owns its identity", async () => {
    const { cliente, upsert } = clienteAlta(FILA);

    await registrarUsuario(cliente, { correo: FILA.correo, nombre: "Nombre viejo", area: "Otra" });

    const [consulta] = upsert.mock.calls[0] as [{ update: unknown }];
    expect(consulta.update).toEqual({});
  });

  it("gives back the account with its id, so a grant has something to hang on", async () => {
    const { cliente } = clienteAlta(FILA);

    expect(await registrarUsuario(cliente, { correo: FILA.correo, nombre: "S", area: "" })).toEqual(
      FILA,
    );
  });

  it("reads a NULL area as the empty bucket, like every other read here", async () => {
    const { cliente } = clienteAlta({ ...FILA, area: null });

    const usuario = await registrarUsuario(cliente, { correo: FILA.correo, nombre: "S", area: "" });

    expect(usuario.area).toBe("");
  });
});
