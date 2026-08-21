/**
 * The configuration the directory search needs — backlog item #17, ADR 0009.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NO NEW ENVIRONMENT VARIABLE, AND THAT IS A DECISION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The search runs as the APPLICATION, not as the administrator who typed the
 * term (see `directorio.ts`), so it needs a tenant, a client id and a client
 * secret. All three already exist: they are the very credentials the sign-in
 * uses, `AUTH_MICROSOFT_ENTRA_ID_*`. Asking a deployment for a second copy of
 * the same secret under a different name would give it two places to rotate and
 * one place to forget, and the day they disagreed the symptom would be a
 * directory search that fails while the login works.
 *
 * The tenant is DERIVED from the issuer rather than configured, for the same
 * reason: `AUTH_MICROSOFT_ENTRA_ID_ISSUER` already names it, and `auth.ts`
 * documents at length why that URL must be tenant-specific.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS THROW IS THE FIRST STEP OF THE AGREED DEGRADATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Like `lib/correo/env.ts`, this module throws rather than defaulting — and
 * like it, the caller catches. A portal whose Entra ID credentials are not
 * usable for a directory search still manages administrators perfectly well,
 * over the people who have already signed in (ADR 0009's mitigation). What it
 * must never do is fail the search outright, and it cannot: `busqueda.ts`
 * treats this throw as "the directory is unavailable" and nothing else.
 */

/** The variables the directory search cannot run without. */
const REQUIRED = [
  "AUTH_MICROSOFT_ENTRA_ID_ID",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
] as const;

/**
 * The multi-tenant aliases Entra ID accepts in an issuer URL.
 *
 * A client-credentials token cannot be issued for any of them: the flow has no
 * user to resolve the tenant from, so the endpoint must name one. Rejecting
 * them here turns a misconfiguration into the documented degradation instead of
 * a 400 from Microsoft on every single search.
 */
const ALIAS_MULTITENANT = new Set(["common", "organizations", "consumers"]);

export interface DirectorioEnv {
  /** The tenant the token is issued for — a GUID or a verified domain. */
  tenantId: string;
  clientId: string;
  /** Never logged, never in an error message. */
  clientSecret: string;
}

export type EnvSource = Record<string, string | undefined>;

/**
 * The tenant segment of `https://login.microsoftonline.com/<tenant>/v2.0`.
 *
 * Parsed with `URL` rather than a regex so a trailing slash, an extra path
 * segment or a different Microsoft cloud host (`login.microsoftonline.us`, for
 * instance) all read the same way.
 *
 * @throws Error when the issuer is not a URL, or names no usable tenant.
 */
export function tenantFromIssuer(issuer: string): string {
  let url: URL;

  try {
    url = new URL(issuer);
  } catch {
    throw new Error(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER is not a URL, so the directory search cannot resolve the tenant.",
    );
  }

  const segmentos = url.pathname.split("/").filter((segmento) => segmento !== "");
  const tenant = segmentos[0] ?? "";

  if (tenant === "" || ALIAS_MULTITENANT.has(tenant.toLowerCase())) {
    throw new Error(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER must name a specific tenant for the directory search; " +
        "the multi-tenant aliases cannot issue an application token.",
    );
  }

  return tenant;
}

/**
 * Reads and validates the directory-search configuration.
 *
 * Called per search rather than at module load, for the reason `lib/auth/env.ts`
 * gives: these modules are evaluated during `next build`, where the runtime
 * secrets legitimately do not exist.
 *
 * @throws Error naming every missing or blank required variable. The values
 *         themselves never appear in the message — the secret least of all,
 *         since this error is caught and written to a log.
 */
export function readDirectorioEnv(source: EnvSource = process.env): DirectorioEnv {
  const missing = REQUIRED.filter((name) => (source[name] ?? "").trim() === "");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s) for the directory search: ${missing.join(", ")}.`,
    );
  }

  return {
    tenantId: tenantFromIssuer((source.AUTH_MICROSOFT_ENTRA_ID_ISSUER as string).trim()),
    clientId: (source.AUTH_MICROSOFT_ENTRA_ID_ID as string).trim(),
    clientSecret: (source.AUTH_MICROSOFT_ENTRA_ID_SECRET as string).trim(),
  };
}
