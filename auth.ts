import NextAuth, { customFetch } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import { readAuthEnv } from "@/lib/auth/env";
import { fetchSinCache } from "@/lib/auth/fetch";
import { mapToSessionUser } from "@/lib/auth/identity";
import { fetchDepartment } from "@/lib/auth/graph";
import { authorizeAndSyncUsuario } from "@/lib/auth/sign-in";
import { upsertUsuario } from "@/lib/auth/usuario-repository";
import { AUTH_ERROR_PATH, SIGN_IN_PATH } from "@/lib/auth-gate";
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

/**
 * Read once, into a name of its own, because TWO things need it and only one of
 * them can reach it afterwards: the provider gets it as configuration, and the
 * fetch below needs it to substitute the tenant. `entraId.issuer` is NOT that
 * value — `@auth/core` normalises providers by spreading them into a new object
 * and merging the options into THAT, so the object built here never receives
 * the merged `issuer` and reading it back would silently yield `undefined`.
 */
const ISSUER = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;

const entraId = MicrosoftEntraID({
  clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
  clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
  issuer: ISSUER,

  /*
   * REPLACES the provider's own mapping, which reads `profile.email` and
   * nothing else. `lib/auth/identity.ts` explains why that is not enough here
   * and why the session has to be built from the same claims the sign-in
   * decision reads. A string key, so `@auth/core`'s merge does apply it —
   * unlike the symbol below.
   */
  profile: (profile) => mapToSessionUser(profile),
});

/**
 * Every request of the OAuth flow, off Next's fetch cache.
 *
 * WHY IT IS ASSIGNED HERE AND NOT PASSED IN THE CONFIG ABOVE: `customFetch` is
 * a SYMBOL, and `@auth/core` merges provider options with a `for...in` loop,
 * which enumerates string keys only. A symbol handed to the factory is dropped
 * without a word — this assignment is the only way to be sure it takes effect.
 *
 * `lib/auth/fetch.ts` explains what the global fetch breaks and why an OAuth
 * exchange never belonged in a cache to begin with. This REPLACES the
 * provider's own `customFetch`, so the one thing that one did has to be done
 * here too: Microsoft's discovery document announces its issuer with a literal
 * `{tenantid}` placeholder, and `oauth4webapi` rejects the mismatch unless it
 * is substituted for the tenant this application is registered in.
 */
entraId[customFetch] = async (...args) => {
  const pedir = fetchSinCache();
  const url = new URL(args[0] instanceof Request ? args[0].url : String(args[0]));

  if (!url.pathname.endsWith(".well-known/openid-configuration")) {
    return pedir(...args);
  }

  const response = await pedir(...args);

  /* Not `clone()`: the body is read once and a fresh Response is built from it,
     so nothing downstream can inherit a half-consumed one. */
  const documento = (await response.json()) as { issuer: string };
  const tenantId = ISSUER?.match(/microsoftonline\.com\/(\w+)\/v2\.0/)?.[1] ?? "common";

  return Response.json({
    ...documento,
    issuer: documento.issuer.replace("{tenantid}", tenantId),
  });
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [entraId],

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

  /**
   * The portal's own screens replace the default Auth.js pages.
   *
   * Both live under `/login`, which is also the one prefix the authentication
   * gate keeps public: a redirect can therefore only ever land somewhere that
   * is reachable without a session, which is what keeps the gate from looping.
   *
   * `error` is where a rejected sign-in arrives with `?error=AccessDenied` —
   * the outcome of the `signIn` callback below returning `false`.
   */
  pages: {
    signIn: SIGN_IN_PATH,
    error: AUTH_ERROR_PATH,
  },

  callbacks: {
    /**
     * The only place the portal decides who gets in.
     *
     * Returning `false` aborts the flow before any session cookie exists and,
     * because the domain check runs before the database call, before anything
     * is written — a rejected user leaves no `usuario` row behind.
     *
     * Auth.js sends a rejected sign-in to `pages.error` with
     * `error=AccessDenied`, which the portal's own screen turns into an
     * explanation that the account is not a corporate one — without naming the
     * configured domain or the provider's error code.
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
