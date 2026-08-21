import { type CorreoEnv, readCorreoEnv } from "@/lib/correo/env";
import type { MensajeDeCorreo } from "@/lib/correo/mensaje";

/**
 * The wire contract with the mail API — the transport half of backlog item #14.
 *
 * The PRD settles one thing about this integration and leaves the rest open:
 * "El envío de correos se hará mediante una **API de correo** (no SMTP
 * directo)." Which API is a decision that belongs to TI, and `.env.example` says
 * so in as many words — the three `MAIL_*` variables are listed as "BLOQUEADAS
 * POR TI / Área de Innovación".
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SO THIS MODULE IS THE SEAM, AND IT IS DELIBERATELY THIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Two things below are assumptions rather than verified facts, and they are the
 * only two in the item. They are here, together, in a file of forty lines,
 * because that is the difference between "swap the provider" being an edit and
 * being an investigation:
 *
 *   1. `RUTA_ENVIO` — the path appended to `MAIL_API_BASE_URL`.
 *   2. `cuerpoDe` — the JSON shape: `from`, `to[]`, `subject`, `text`.
 *
 * Both are the common shape of the JSON mail APIs in this class, and neither was
 * verified against the provider, because there is no provider yet. When TI names
 * one, THESE TWO DEFINITIONS ARE THE CHANGE. Nothing else in the portal knows
 * that mail has a body shape at all — `mensaje.ts` produces a subject and a
 * text, and `notificar.ts` only knows whether it worked.
 *
 * `lib/procesadores/servicio.ts` made the same bet against FastAPI and it paid
 * off: when the real service turned out to mount `/interno/procesadores/{clave}`
 * without the `/ejecutar` the ADR promised, the correction was one constant.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NOTHING IS INTERPRETED HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The response comes back exactly as the API produced it and a rejection
 * propagates untouched. `notificar.ts` decides what any of it means — which,
 * this being best-effort, is always the same thing. Keeping transport and
 * judgement apart is what lets both be tested without mocking the other.
 */

/**
 * The one path this module appends to the configured origin.
 *
 * See the header: an assumption, isolated on purpose. `MAIL_API_BASE_URL` is the
 * origin (`https://api.correo.corp`), not the endpoint, so that the same
 * variable can serve a second call the day one exists.
 */
export const RUTA_ENVIO = "/messages";

/**
 * The portal's deadline for one send.
 *
 * Ten seconds, and it is not about the user: `notificar.ts` runs this after the
 * response has already been flushed, so nobody is waiting on it. It is about the
 * server — an unbounded `fetch` against a hanging gateway holds a socket and a
 * serverless invocation open for as long as the gateway feels like it, and the
 * portal has no retry that would make the wait worth anything.
 */
export const TIMEOUT_MS = 10_000;

/** The JSON body. See the header — this shape is the second assumption. */
function cuerpoDe(mensaje: MensajeDeCorreo, env: CorreoEnv) {
  return {
    from: env.remitente,
    /*
     * An array with exactly one address. Item #14 notifies the Área de
     * Innovación and nobody else — not the author, who already got the toast and
     * has the suggestion in their own list, and not an administrator's personal
     * inbox, which would turn a role into a person.
     */
    to: [env.destinatario],
    subject: mensaje.asunto,
    text: mensaje.texto,
  };
}

/**
 * Sends one message and returns the API's raw answer.
 *
 * @throws whatever `fetch` throws — a refused connection, a DNS failure, the
 *         abort from `TIMEOUT_MS`. The caller is `notificar.ts` and it catches
 *         all of them; wrapping them here would only hide which one happened
 *         from the log line that is the entire point of catching them.
 */
export async function enviarCorreo(
  mensaje: MensajeDeCorreo,
  env: CorreoEnv = readCorreoEnv(),
): Promise<Response> {
  return fetch(`${env.baseUrl}${RUTA_ENVIO}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpoDe(mensaje, env)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}
