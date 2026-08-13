import { normalizeEmail } from "@/lib/auth/identity";

/**
 * The single validated accessor for the authentication environment.
 *
 * `ALLOWED_EMAIL_DOMAIN` silently undefined would let every domain through, so
 * a missing or blank required variable is an error that names itself, never a
 * default. The three `AUTH_MICROSOFT_ENTRA_ID_*` names are the ones the Auth.js
 * Entra ID provider auto-detects; they are checked here so a misconfigured
 * deployment fails with a readable message instead of an OAuth error page.
 */

/** Variables without which the login must not run at all. */
const REQUIRED = [
  "ALLOWED_EMAIL_DOMAIN",
  "AUTH_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ID",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
] as const;

export interface AuthEnv {
  /** Corporate domain of the portal, lowercased. Never a hardcoded literal. */
  allowedEmailDomain: string;
  /** Break-glass administrator, or `""` when unset — which promotes nobody. */
  adminEmail: string;
}

export type EnvSource = Record<string, string | undefined>;

/**
 * Reads and validates the authentication environment.
 *
 * Called at the start of the sign-in flow rather than at module load: the
 * route handler module is evaluated during `next build`, where the runtime
 * secrets legitimately do not exist, and a build must not fail for that. The
 * first sign-in attempt is the first moment the values are genuinely needed,
 * and a throw there denies the login instead of allowing it.
 *
 * @throws Error naming every missing or blank required variable.
 */
export function readAuthEnv(source: EnvSource = process.env): AuthEnv {
  const missing = REQUIRED.filter((name) => (source[name] ?? "").trim() === "");

  if (missing.length > 0) {
    throw new Error(
      `Missing required authentication environment variable(s): ${missing.join(", ")}. ` +
        "Set them in .env.local before signing in.",
    );
  }

  return {
    allowedEmailDomain: normalizeEmail(source.ALLOWED_EMAIL_DOMAIN).replace(/^@/, ""),
    adminEmail: normalizeEmail(source.ADMIN_EMAIL),
  };
}
