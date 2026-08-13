import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import { readAuthEnv } from "@/lib/auth/env";
import { fetchDepartment } from "@/lib/auth/graph";
import { authorizeAndSyncUsuario } from "@/lib/auth/sign-in";
import { upsertUsuario } from "@/lib/auth/usuario-repository";
import { prisma } from "@/lib/prisma";

/**
 * Auth.js v5 configuration for the portal (ADR 0009).
 *
 * This file is only the wiring. Every rule it applies lives in `lib/auth/*` as
 * a pure, unit-tested function, because the OAuth round trip itself cannot be
 * exercised without a live Entra ID tenant.
 *
 * The provider reads `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`
 * and `AUTH_MICROSOFT_ENTRA_ID_ISSUER`. The issuer must be the tenant-specific
 * URL (`https://login.microsoftonline.com/<tenant-id>/v2.0`): omitting it makes
 * the provider fall back to `/common/`, which accepts identities from ANY
 * Microsoft tenant. The domain check would still reject them, but a single-
 * tenant corporate application should not be advertising a multi-tenant
 * endpoint in the first place.
 *
 * The provider's default scope is `openid profile email User.Read`, and that
 * `User.Read` is what authorizes the Graph department lookup — no extra
 * permission and no admin consent are needed for it.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  ],

  /**
   * JWT sessions, with no database adapter.
   *
   * ADR 0007 forbids caching permissions or `es_admin` in the session token
   * under any strategy: the session identifies the user and nothing else, and
   * every request re-reads the role and the assignments from SQL Server so a
   * revocation applies immediately. That makes the usual "a JWT can hold a
   * stale role" objection moot by construction — there is no role in it to go
   * stale. A database strategy would add the Account/Session/VerificationToken
   * tables of `@auth/prisma-adapter`, which ADR 0002's nine-entity model does
   * not define and which would buy nothing here.
   *
   * There is deliberately no `jwt` or `session` callback: adding one to copy
   * `es_admin` into the token is exactly what ADR 0007 prohibits.
   */
  session: { strategy: "jwt" },

  callbacks: {
    /**
     * The only place the portal decides who gets in.
     *
     * Returning `false` aborts the flow before any session cookie exists and,
     * because the domain check runs before the database call, before anything
     * is written — a rejected user leaves no `usuario` row behind.
     *
     * Auth.js sends a rejected sign-in to its error page with
     * `error=AccessDenied`. Part 2 points `pages.error` (and `pages.signIn`) at
     * the portal's own screens; until those exist, the default Auth.js pages
     * are used so that no route in this item can 404.
     */
    async signIn({ profile, account }) {
      return authorizeAndSyncUsuario(profile ?? {}, account?.access_token, {
        // Read per sign-in, not at module load: this module is evaluated during
        // `next build`, where the runtime secrets legitimately do not exist.
        env: readAuthEnv(),
        fetchDepartment: (accessToken) => fetchDepartment(accessToken),
        upsertUsuario: (input) => upsertUsuario(prisma, input),
      });
    },
  },
});
