import { describe, expect, it, vi } from "vitest";

import { type UsuarioUpsertClient, upsertUsuario } from "@/lib/auth/usuario-repository";

/**
 * The one function in the login that touches the database. It takes its client
 * as an argument, so these tests substitute a double for the two-method slice
 * of Prisma it uses instead of mocking the singleton module — no connection is
 * ever opened, matching the rule that the suite never reaches SQL Server
 * (lib/prisma-schema.test.ts).
 */

function clientDouble(): { client: UsuarioUpsertClient; upsert: ReturnType<typeof vi.fn> } {
  const upsert = vi.fn(async () => ({}));
  return { client: { usuario: { upsert } } as unknown as UsuarioUpsertClient, upsert };
}

const row = {
  correo: "jose@corp.com",
  nombre: "José Álvarez",
  area: "Innovación",
  esAdmin: false,
};

describe("upsertUsuario", () => {
  it("keys the row on correo and creates it with every mapped column", async () => {
    const { client, upsert } = clientDouble();

    await upsertUsuario(client, row);

    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ correo: "jose@corp.com" });
    expect(args.create).toEqual(row);
  });

  it("refreshes the profile of a returning user on every login", async () => {
    const { client, upsert } = clientDouble();

    await upsertUsuario(client, row);

    expect(upsert.mock.calls[0][0].update).toEqual({
      nombre: "José Álvarez",
      area: "Innovación",
    });
  });

  it("never demotes an administrator granted through the portal UI", async () => {
    const { client, upsert } = clientDouble();

    await upsertUsuario(client, { ...row, esAdmin: false });

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty("esAdmin");
  });

  it("re-applies the ADMIN_EMAIL promotion on every login, not only at creation", async () => {
    const { client, upsert } = clientDouble();

    await upsertUsuario(client, { ...row, esAdmin: true });

    expect(upsert.mock.calls[0][0].update).toMatchObject({ esAdmin: true });
    expect(upsert.mock.calls[0][0].create).toMatchObject({ esAdmin: true });
  });

  it("leaves activo alone, since deactivating a user is an administrator's decision", async () => {
    const { client, upsert } = clientDouble();

    await upsertUsuario(client, row);

    expect(upsert.mock.calls[0][0].create).not.toHaveProperty("activo");
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty("activo");
  });
});
