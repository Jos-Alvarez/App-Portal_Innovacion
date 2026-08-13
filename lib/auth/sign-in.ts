import type { AuthEnv } from "@/lib/auth/env";
import {
  type IdentityClaims,
  type UsuarioUpsertInput,
  isAdminEmail,
  isEmailFromAllowedDomain,
  mapToUsuarioUpsert,
  selectIdentityEmail,
} from "@/lib/auth/identity";

/**
 * The sign-in decision, expressed independently of Auth.js.
 *
 * Auth.js only ever calls this through the `signIn` callback in `auth.ts`, but
 * keeping it here — with its collaborators injected — is what makes the
 * ordering guarantee testable: the domain check happens before anything that
 * could leave a trace, and a test can prove it rather than a comment claiming
 * it.
 */

export interface SignInDependencies {
  env: AuthEnv;
  fetchDepartment: (accessToken: string | null | undefined) => Promise<string>;
  upsertUsuario: (input: UsuarioUpsertInput) => Promise<void>;
}

/**
 * Decides whether this identity may enter the portal and, if so, synchronizes
 * its `usuario` row.
 *
 * The step order is the contract:
 *
 * 1. Resolve the address from the claims. No address at all is a rejection —
 *    an unidentifiable login can never be allowed through.
 * 2. Check the corporate domain. On rejection the function returns immediately,
 *    so a user from a disallowed domain reaches neither Graph nor the database
 *    and leaves no row behind (PRD.md: the login must reject them).
 * 3. Only then read the optional `department`. This call never throws, so it
 *    can never turn an authorized user away.
 * 4. Upsert the row. A failure here DOES propagate and deny the login, and that
 *    asymmetry with step 3 is deliberate: the portal cannot authorize anyone
 *    without their row, because every request re-reads permissions and the role
 *    from the database (ADR 0007). Being let in without a row would produce a
 *    session that is denied everywhere, which is worse than a clean failure.
 *
 * @returns `true` to admit the user, `false` to reject the sign-in.
 */
export async function authorizeAndSyncUsuario(
  claims: IdentityClaims,
  accessToken: string | null | undefined,
  deps: SignInDependencies,
): Promise<boolean> {
  const correo = selectIdentityEmail(claims);

  if (!isEmailFromAllowedDomain(correo, deps.env.allowedEmailDomain)) {
    return false;
  }

  const department = await deps.fetchDepartment(accessToken);

  await deps.upsertUsuario(
    mapToUsuarioUpsert({
      email: correo,
      name: claims.name,
      department,
      esAdmin: isAdminEmail(correo, deps.env.adminEmail),
    }),
  );

  return true;
}
