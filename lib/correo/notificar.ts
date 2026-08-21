import { after } from "next/server";

import { readCorreoEnv } from "@/lib/correo/env";
import { type AutorDelCorreo, mensajeDeSugerencia } from "@/lib/correo/mensaje";
import { enviarCorreo } from "@/lib/correo/servicio";
import type { SugerenciaDTO } from "@/lib/sugerencias/repository";

/**
 * Backlog item #14 — "notificación por correo best-effort", and the module where
 * "best-effort" stops being an adjective and becomes a guarantee.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT "BEST-EFFORT" MEANS HERE, EXACTLY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The PRD's edge case is unambiguous: "El envío de correo de una sugerencia
 * falla: **el error se ignora silenciosamente. La sugerencia no se pierde porque
 * ya está garantizada en la base de datos y el administrador la verá en el panel
 * del portal.** El correo es solo una notificación de conveniencia; no hay
 * reintento ni cola pendiente."
 *
 * ADR 0008 — the outbox with a retry job — was REJECTED, to remove background
 * jobs from the architecture entirely. So there is no `correo_pendiente` table,
 * no scheduler, no backoff and no second attempt. A send that fails is a send
 * that never happened, and the system is designed so that this costs nothing:
 * the row is already committed and the administrator's panel is the record.
 *
 * Which turns the requirement into three rules, and this module is all three:
 *
 *   1. NOTHING HERE MAY THROW INTO THE CALLER. The row exists by the time this
 *      runs; an exception escaping would turn a saved suggestion into a 500 and
 *      tell the author their idea was lost when it was not.
 *   2. NOTHING HERE MAY DELAY THE CALLER. `after` runs the send once the
 *      response is flushed. The toast is instant even when the mail API takes
 *      ten seconds to refuse.
 *   3. SILENT TO THE USER, NEVER TO THE LOG. "Se ignora silenciosamente" is
 *      about the person who sent the suggestion, not about operations. Every
 *      failure leaves one `console.warn` naming the suggestion, so a report of
 *      "no llegó el correo" is one grep and not an investigation.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `after` IS NOT A BACKGROUND JOB, WHICH IS WHY IT IS ALLOWED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The obvious objection: ADR 0008 was rejected to eliminate "toda
 * infraestructura de jobs en segundo plano", and TECH-DESIGN repeats it —
 * "notificación directa al registrar una sugerencia; sin jobs en segundo plano".
 * Does deferring the send contradict that?
 *
 * No, and the distinction is not a technicality. What ADR 0008 rejected was a
 * SCHEDULER: a second process, running on its own clock, that has to be
 * deployed, hosted and kept alive, and that reads state written by the first —
 * the piece whose deployment assumption was the open warning A5. `after` is none
 * of that. It is the same invocation of the same request, finishing its work
 * after the bytes are on the wire. There is no clock, no queue, no state between
 * two processes and nothing extra to deploy. If the invocation dies, the send
 * dies with it — which is precisely the semantics the PRD asked for.
 *
 * The alternative was awaiting the send inside the handler. It was rejected for
 * rule 2: it makes a collaborator's form wait on a third party that the same
 * document says may fail without consequence. The success criterion is "llega en
 * menos de 1 minuto", not "llega before the toast".
 */

/**
 * Sends the notification for one registered suggestion. Resolves — always.
 *
 * @returns `true` when the mail API accepted it, `false` for every other
 *          outcome. The caller is free to ignore it; the route does. It exists
 *          so the suite can assert the outcome without reading a log.
 */
export async function notificarSugerencia(
  sugerencia: SugerenciaDTO,
  autor: AutorDelCorreo,
): Promise<boolean> {
  /*
   * Read separately from the send so that "TI has not handed over the
   * credentials yet" gets its own log line. It is the expected state of a
   * pre-production deployment, not an incident, and it should not look like one.
   */
  let env;
  try {
    env = readCorreoEnv();
  } catch (error) {
    console.warn(
      `[correo] sugerencia #${sugerencia.id} registrada, aviso omitido: el entorno de correo no está configurado.`,
      error,
    );
    return false;
  }

  try {
    const respuesta = await enviarCorreo(mensajeDeSugerencia(sugerencia, autor), env);

    if (!respuesta.ok) {
      /*
       * A 4xx or 5xx is a failure exactly like a refused connection: no retry,
       * no queue. The status is in the line because it is the one thing that
       * separates "our credentials are wrong" from "their gateway is down", and
       * whoever reads this line is deciding which.
       */
      console.warn(
        `[correo] sugerencia #${sugerencia.id} registrada, aviso no enviado: la API respondió ${respuesta.status}.`,
      );
      return false;
    }

    return true;
  } catch (error) {
    /* A refused connection, a DNS failure, the abort from `TIMEOUT_MS`. All the
       same outcome, and the `error` object keeps which one for the log. */
    console.warn(
      `[correo] sugerencia #${sugerencia.id} registrada, aviso no enviado: falló el envío.`,
      error,
    );
    return false;
  }
}

/**
 * Schedules the notification and returns immediately.
 *
 * THE RETURN TYPE IS `void` ON PURPOSE. Handing back the promise would let a
 * caller `await` it, which is the one thing this whole module exists to prevent
 * — and it would do so silently, costing a collaborator ten seconds on a bad day
 * with nothing in the code to show why.
 *
 * The `try` around `after` is not defensive noise. `after` throws when it is
 * called outside a request scope, and this function is called after the
 * suggestion is committed but before the response is returned: an exception
 * escaping here would answer 500 to a request that succeeded, and the author
 * would resend an idea that is already in the database. So the last thing that
 * can go wrong with the notification is caught too.
 */
export function programarNotificacion(sugerencia: SugerenciaDTO, autor: AutorDelCorreo): void {
  try {
    after(() => notificarSugerencia(sugerencia, autor));
  } catch (error) {
    console.warn(
      `[correo] sugerencia #${sugerencia.id} registrada, aviso no programado.`,
      error,
    );
  }
}
