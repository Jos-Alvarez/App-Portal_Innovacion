// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { RolRechazado } from "@/lib/admins/errors";
import {
  type AdminsClient,
  buscarUsuariosDelPortal,
  leerUsuarioPorCorreo,
  leerUsuariosPorCorreos,
  listarAdministradores,
  promoverAAdministrador,
  revocarAdministrador,
} from "@/lib/admins/repository";
import { RESULTADOS_MAX } from "@/lib/admins/schema";

/**
 * The reads and writes of the role, against a double.
 *
 * The Prisma client is an argument, exactly as in `lib/authz/repository.ts`, so
 * the suite never opens a connection against the shared corporate SQL Server
 * instance (README.md's operational rules).
 *
 * What these tests protect is the SHAPE of what reaches Prisma — and, above
 * everything else, the ORDER of the statements inside the revocation. The
 * minimum-one rule is correct only if the count happens after the update, and
 * that is the kind of thing a refactor undoes without any test noticing unless a
 * test is watching the order itself.
 */

const FILA = {
  id: 7,
  nombre: "Ana Quispe",
  correo: "ana@corp.com",
  area: "Innovación",
  activo: true,
  esAdmin: true,
};

const SELECT_PERSONA = {
  id: true,
  nombre: true,
  correo: true,
  area: true,
  activo: true,
  esAdmin: true,
};

interface DobleOpciones {
  fila?: unknown;
  /** What `create` gives back — a read may legitimately find nothing and still write. */
  filaCreada?: unknown;
  filas?: unknown[];
  count?: number;
  updateCount?: number;
}

function clientDouble({
  fila = FILA,
  filaCreada = FILA,
  filas,
  count = 2,
  updateCount = 1,
}: DobleOpciones = {}) {
  /** Every Prisma call, in the order it happened — the transaction's script. */
  const orden: string[] = [];

  const findMany = vi.fn(async (_args?: unknown) => {
    orden.push("findMany");
    return filas ?? [fila];
  });
  const findUnique = vi.fn(async (_args: unknown) => {
    orden.push("findUnique");
    return fila;
  });
  const create = vi.fn(async (_args: unknown) => {
    orden.push("create");
    return filaCreada;
  });
  const update = vi.fn(async (_args: unknown) => {
    orden.push("update");
    return fila;
  });
  const updateMany = vi.fn(async (_args: unknown) => {
    orden.push("updateMany");
    return { count: updateCount };
  });
  const contar = vi.fn(async (_args: unknown) => {
    orden.push("count");
    return count;
  });

  const usuario = { findMany, findUnique, create, update, updateMany, count: contar };

  const transaction = vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>, opciones?: unknown) => {
      orden.push("$transaction");
      void opciones;
      return fn({ usuario });
    },
  );

  const client = { usuario, $transaction: transaction } as unknown as AdminsClient;

  return { client, orden, findMany, findUnique, create, update, updateMany, contar, transaction };
}

describe("listarAdministradores", () => {
  it("lee solo a quienes tienen el rol, por nombre", async () => {
    const { client, findMany } = clientDouble();

    await listarAdministradores(client);

    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { esAdmin: true },
      select: SELECT_PERSONA,
      orderBy: { nombre: "asc" },
    });
  });

  /**
   * A deactivated administrator still holds a role, and this screen is the only
   * place it can be taken away. Filtering by `activo` would strand it.
   */
  it("no filtra por activo: una cuenta de baja con rol tiene que poder verse", async () => {
    const { client, findMany } = clientDouble();

    await listarAdministradores(client);

    expect((findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({ esAdmin: true });
  });

  it("no devuelve `esAdmin`: en esta lista es constante y no dice nada", async () => {
    const { client } = clientDouble();

    const [administrador] = await listarAdministradores(client);

    expect(administrador).not.toHaveProperty("esAdmin");
    expect(administrador).toEqual({
      id: 7,
      nombre: "Ana Quispe",
      correo: "ana@corp.com",
      area: "Innovación",
      activo: true,
    });
  });

  /** `usuario.area` is NOT NULL with an empty default; the client types it loosely. */
  it("normaliza un área nula a la cadena vacía", async () => {
    const { client } = clientDouble({ fila: { ...FILA, area: null } });

    const [administrador] = await listarAdministradores(client);

    expect(administrador.area).toBe("");
  });
});

describe("buscarUsuariosDelPortal", () => {
  it("busca por nombre o por correo y acota los resultados", async () => {
    const { client, findMany } = clientDouble();

    await buscarUsuariosDelPortal(client, "ana");

    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { OR: [{ nombre: { contains: "ana" } }, { correo: { contains: "ana" } }] },
      take: RESULTADOS_MAX,
    });
  });

  /**
   * Prisma only supports `mode: "insensitive"` on PostgreSQL and MongoDB. On
   * `sqlserver` the flag does not exist and case-insensitivity comes from the
   * column collation, so passing it would not even compile.
   */
  it("no manda `mode`, que el proveedor sqlserver no soporta", async () => {
    const { client, findMany } = clientDouble();

    await buscarUsuariosDelPortal(client, "ana");

    expect(JSON.stringify(findMany.mock.calls[0][0])).not.toContain("mode");
  });

  it("devuelve `esAdmin`, que es lo que la pantalla necesita saber", async () => {
    const { client } = clientDouble();

    const [persona] = await buscarUsuariosDelPortal(client, "ana");

    expect(persona.esAdmin).toBe(true);
  });
});

describe("leerUsuariosPorCorreos", () => {
  it("consulta exactamente las direcciones que se le dieron", async () => {
    const { client, findMany } = clientDouble();

    await leerUsuariosPorCorreos(client, ["ana@corp.com", "beto@corp.com"]);

    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { correo: { in: ["ana@corp.com", "beto@corp.com"] } },
    });
  });

  it("no consulta nada cuando no hay direcciones que buscar", async () => {
    const { client, findMany } = clientDouble();

    expect(await leerUsuariosPorCorreos(client, [])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("leerUsuarioPorCorreo", () => {
  it("busca por la clave única que usa el login", async () => {
    const { client, findUnique } = clientDouble();

    await leerUsuarioPorCorreo(client, "ana@corp.com");

    expect(findUnique.mock.calls[0][0]).toMatchObject({
      where: { correo: "ana@corp.com" },
      select: SELECT_PERSONA,
    });
  });

  it("devuelve null cuando la persona nunca entró al portal", async () => {
    const { client } = clientDouble({ fila: null });

    expect(await leerUsuarioPorCorreo(client, "nadie@corp.com")).toBeNull();
  });
});

describe("promoverAAdministrador", () => {
  const PERSONA = { correo: "ana@corp.com", nombre: "Ana Quispe", area: "Innovación" };

  it("lee y escribe dentro de la misma transacción", async () => {
    const { client, orden } = clientDouble({ fila: { ...FILA, esAdmin: false } });

    await promoverAAdministrador(client, PERSONA);

    expect(orden[0]).toBe("$transaction");
    expect(orden).toEqual(["$transaction", "findUnique", "update"]);
  });

  /** ADR 0009: "al promover, se hace upsert del usuario con es_admin = 1". */
  it("crea la fila cuando la persona nunca entró al portal", async () => {
    const { client, create } = clientDouble({ fila: null });

    await promoverAAdministrador(client, PERSONA);

    expect(create.mock.calls[0][0]).toMatchObject({
      data: { correo: "ana@corp.com", nombre: "Ana Quispe", area: "Innovación", esAdmin: true },
    });
  });

  /**
   * The name and the area of somebody who has signed in belong to their own
   * login, which refreshes them from Entra ID on every visit.
   */
  it("solo escribe el rol cuando la fila ya existía", async () => {
    const { client, update } = clientDouble({ fila: { ...FILA, esAdmin: false } });

    await promoverAAdministrador(client, PERSONA);

    expect((update.mock.calls[0][0] as { data: object }).data).toEqual({ esAdmin: true });
  });

  it("rechaza promover a quien ya tiene el rol, sin escribir nada", async () => {
    const { client, update, create } = clientDouble({ fila: FILA });

    await expect(promoverAAdministrador(client, PERSONA)).rejects.toThrow(RolRechazado);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  /** A role the authorization guard refuses on every request is a role granted to nobody. */
  it("rechaza promover una cuenta dada de baja", async () => {
    const { client, update } = clientDouble({ fila: { ...FILA, esAdmin: false, activo: false } });

    await expect(promoverAAdministrador(client, PERSONA)).rejects.toMatchObject({
      motivo: "dado_de_baja",
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("revocarAdministrador", () => {
  /**
   * The heart of item #17. Counting BEFORE the update lets two simultaneous
   * revocations both see two administrators and both commit, leaving zero —
   * exactly the case TECH-DESIGN names as forbidden.
   */
  it("cuenta después de escribir, no antes", async () => {
    const { client, orden } = clientDouble();

    await revocarAdministrador(client, 7, "");

    expect(orden).toEqual(["$transaction", "findUnique", "updateMany", "count"]);
  });

  /** Range locks are what make the count mean anything across two transactions. */
  it("abre la transacción en Serializable", async () => {
    const { client, transaction } = clientDouble();

    await revocarAdministrador(client, 7, "");

    expect(transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "Serializable" });
  });

  it("condiciona la escritura al rol que leyó, para ver una actualización perdida", async () => {
    const { client, updateMany } = clientDouble();

    await revocarAdministrador(client, 7, "");

    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 7, esAdmin: true },
      data: { esAdmin: false },
    });
  });

  it("rechaza cuando quitar el rol dejaría el portal sin administradores", async () => {
    const { client } = clientDouble({ count: 0 });

    await expect(revocarAdministrador(client, 7, "")).rejects.toMatchObject({
      motivo: "ultimo_admin",
    });
  });

  /**
   * Self-revocation is an ordinary revocation: the rule does not ask who is
   * calling, so an administrator with a colleague left may step down.
   */
  it("acepta la revocación cuando queda alguien más", async () => {
    const { client } = clientDouble({ count: 1 });

    await expect(revocarAdministrador(client, 7, "")).resolves.toMatchObject({ id: 7 });
  });

  it("devuelve la fila ya sin el rol, no la que leyó", async () => {
    const { client } = clientDouble();

    const administrador = await revocarAdministrador(client, 7, "");

    expect(administrador).not.toHaveProperty("esAdmin");
    expect(administrador.nombre).toBe("Ana Quispe");
  });

  it("rechaza a quien no existe", async () => {
    const { client, updateMany } = clientDouble({ fila: null });

    await expect(revocarAdministrador(client, 7, "")).rejects.toMatchObject({
      motivo: "no_encontrado",
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rechaza a quien ya no tiene el rol", async () => {
    const { client, updateMany } = clientDouble({ fila: { ...FILA, esAdmin: false } });

    await expect(revocarAdministrador(client, 7, "")).rejects.toMatchObject({
      motivo: "no_es_admin",
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("trata el cero filas actualizadas como conflicto y no toca el contador", async () => {
    const { client, contar } = clientDouble({ updateCount: 0 });

    await expect(revocarAdministrador(client, 7, "")).rejects.toMatchObject({
      motivo: "conflicto",
    });
    expect(contar).not.toHaveBeenCalled();
  });

  /**
   * `lib/auth/usuario-repository.ts` re-promotes this account on every sign-in,
   * so accepting the revocation would mean showing a change that silently undoes
   * itself hours later.
   */
  it("rechaza revocar la cuenta fijada por el entorno, sin escribir", async () => {
    const { client, updateMany } = clientDouble();

    await expect(revocarAdministrador(client, 7, "ana@corp.com")).rejects.toMatchObject({
      motivo: "cuenta_fijada",
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("compara la cuenta fijada sin distinguir mayúsculas", async () => {
    const { client } = clientDouble({ fila: { ...FILA, correo: "Ana@Corp.com" } });

    await expect(revocarAdministrador(client, 7, "ana@corp.com")).rejects.toMatchObject({
      motivo: "cuenta_fijada",
    });
  });

  /** An unset `ADMIN_EMAIL` pins nobody — the same safe direction `isAdminEmail` takes. */
  it("no fija a nadie cuando el entorno no declara una cuenta de respaldo", async () => {
    const { client } = clientDouble();

    await expect(revocarAdministrador(client, 7, "")).resolves.toMatchObject({ id: 7 });
  });
});
