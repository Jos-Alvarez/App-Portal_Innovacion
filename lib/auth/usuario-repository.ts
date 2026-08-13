import type { PrismaClient } from "@prisma/client";

import type { UsuarioUpsertInput } from "@/lib/auth/identity";

/**
 * The single write the login performs (ADR 0009: Entra ID authenticates, the
 * portal owns the row).
 *
 * The Prisma client is a parameter rather than a module import so the callers
 * that need a real connection pass the singleton from `lib/prisma.ts` and the
 * tests pass a double. This keeps the suite away from SQL Server, which the
 * repository's operational rules require.
 */

/** The slice of Prisma this function uses. */
export type UsuarioUpsertClient = Pick<PrismaClient, "usuario">;

/**
 * Creates or refreshes the `usuario` row for the account that just signed in.
 *
 * Two deliberate asymmetries between `create` and `update`:
 *
 * 1. `esAdmin` is written on update ONLY when it is `true`. A login never
 *    demotes anyone: the role is owned by the database and governed by the
 *    promote/revoke screen of item #17 under the "at least 1 admin" rule
 *    (ADR 0009). Writing `esAdmin: false` on every login would silently revoke
 *    every administrator granted through that screen.
 *
 * 2. Because of the same line, the `ADMIN_EMAIL` account is re-promoted on
 *    EVERY login, not only when its row is created. This is the intended
 *    break-glass behaviour, and it has a consequence item #17 MUST honour:
 *    revoking that account through the UI cannot stick — the next login
 *    restores it. Item #17 therefore has to refuse the revocation outright and
 *    explain in its UI that this account is pinned by the `ADMIN_EMAIL`
 *    environment variable, instead of accepting an operation that silently
 *    undoes itself.
 *
 * `activo` is never touched: deactivating a collaborator is an administrator's
 * decision, and a login must not resurrect a deactivated account.
 */
export async function upsertUsuario(
  client: UsuarioUpsertClient,
  input: UsuarioUpsertInput,
): Promise<void> {
  await client.usuario.upsert({
    where: { correo: input.correo },
    create: {
      correo: input.correo,
      nombre: input.nombre,
      area: input.area,
      esAdmin: input.esAdmin,
    },
    update: {
      nombre: input.nombre,
      area: input.area,
      ...(input.esAdmin ? { esAdmin: true } : {}),
    },
  });
}
