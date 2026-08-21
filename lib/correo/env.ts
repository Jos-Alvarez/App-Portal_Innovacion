/**
 * The single validated accessor for the mail environment — backlog item #14.
 *
 * Same shape as `lib/auth/env.ts` and `lib/procesadores/servicio.ts`: a missing
 * or blank required variable throws an Error that names every offender, rather
 * than defaulting to something that half-works.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS THROW IS NOT A FAILURE OF THE PORTAL, AND THAT IS THE WHOLE POINT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The other two env modules are read on a path that MUST NOT continue without
 * them: a sign-in with no `AUTH_SECRET`, an execution with no service token.
 * This one is read on a path that must continue REGARDLESS — the notification is
 * best-effort (ADR 0008 rejected, PRD "casos borde"), so the suggestion is
 * already committed by the time anyone asks for these values.
 *
 * So the throw is deliberate and its catcher is deliberate too: `notificar.ts`
 * turns it into one `console.warn` and returns. A portal deployed before TI
 * hands over the mail credentials registers suggestions perfectly well and says
 * so once per send in the log. What it must never do is refuse the suggestion,
 * and it cannot, because nothing on the write path reads this file.
 */

/** The variables a notification cannot be sent without. */
const REQUIRED = [
  "MAIL_API_BASE_URL",
  "MAIL_API_KEY",
  "MAIL_FROM_ADDRESS",
  "MAIL_INNOVACION_ADDRESS",
] as const;

export interface CorreoEnv {
  /** Origin of the mail API, without a trailing slash. */
  baseUrl: string;
  /** The API credential, sent as a bearer token. Never logged, never in an error. */
  apiKey: string;
  /** The `from` the Área de Innovación sees. Lowercased. */
  remitente: string;
  /** The Área de Innovación's inbox — the only recipient item #14 has. Lowercased. */
  destinatario: string;
}

export type EnvSource = Record<string, string | undefined>;

/**
 * Reads and validates the mail configuration.
 *
 * @throws Error naming every missing or blank required variable. The values
 *         themselves never appear in the message — the key least of all, since
 *         this error is caught and written to a log.
 */
export function readCorreoEnv(source: EnvSource = process.env): CorreoEnv {
  const missing = REQUIRED.filter((name) => (source[name] ?? "").trim() === "");

  if (missing.length > 0) {
    throw new Error(
      `Missing required mail environment variable(s): ${missing.join(", ")}. ` +
        "Set them in .env.local to enable the best-effort suggestion notification.",
    );
  }

  return {
    /* A trailing slash would produce `//messages`, which some gateways
       normalise and others answer 404 to. */
    baseUrl: (source.MAIL_API_BASE_URL as string).trim().replace(/\/+$/, ""),
    apiKey: (source.MAIL_API_KEY as string).trim(),
    /* Addresses are lowercased for the same reason `lib/auth/identity.ts`
       lowercases them: a mailbox is not case-sensitive, and two spellings of one
       inbox is a difference that only ever shows up in a log nobody can grep. */
    remitente: (source.MAIL_FROM_ADDRESS as string).trim().toLowerCase(),
    destinatario: (source.MAIL_INNOVACION_ADDRESS as string).trim().toLowerCase(),
  };
}
