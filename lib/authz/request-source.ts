import { cache } from "react";

import { auth } from "@/auth";
import type { AuthorizationSource } from "@/lib/authz/authorize";
import { type Authorization, type RecursoTipo, authorizeAccount, deny } from "@/lib/authz/decisions";
import { readGrant, readUsuarioByCorreo } from "@/lib/authz/repository";
import { prisma } from "@/lib/prisma";

/**
 * The production source of truth: Auth.js for identity, SQL Server for
 * everything else. This module is only wiring — every rule it feeds lives in
 * `decisions.ts` and every read in `repository.ts`, both unit-tested, because
 * the session round trip this depends on cannot be run without a live tenant.
 *
 * PER-REQUEST DEDUPLICATION, AND NOTHING MORE. Both reads are wrapped in
 * React's `cache()`, which memoizes for the duration of a single server render
 * pass and is invalidated for every new server request. Three components on one
 * page each asking "who is this" therefore produce one query, not three, while
 * a second request — the one right after an administrator revoked something —
 * always reads the database again. That immediacy is the entire point of ADR
 * 0007, so nothing here may ever be promoted to a cross-request cache.
 *
 * Outside a render pass (a Route Handler, for instance) `cache()` has no
 * request context to key on and simply calls through: correct either way, since
 * a handler runs its guard once per request anyway.
 */

/**
 * The signed-in collaborator, re-read from the database on every request.
 *
 * The session only ever carries an identity — `auth.ts` deliberately defines no
 * `jwt`/`session` callback — so the role and the account's own state are facts
 * this read establishes, never facts the cookie asserts.
 */
const currentAccount = cache(async (): Promise<Authorization> => {
  const session = await auth();
  const correo = session?.user?.email;

  if (!correo) {
    return deny("no-session");
  }

  return authorizeAccount(await readUsuarioByCorreo(prisma, correo));
});

/**
 * Arguments are flattened to scalars on purpose: `cache()` keys on argument
 * identity, so passing the `RecursoRef` object straight through would build a
 * fresh key on every call and quietly never deduplicate anything.
 */
const currentGrant = cache(async (tipo: RecursoTipo, id: number, usuarioId: number) =>
  readGrant(prisma, { tipo, id }, usuarioId),
);

export const requestSource: AuthorizationSource = {
  account: currentAccount,
  grant: (recurso, usuarioId) => currentGrant(recurso.tipo, recurso.id, usuarioId),
};
