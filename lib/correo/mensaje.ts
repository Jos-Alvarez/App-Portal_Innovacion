import type { SugerenciaDTO } from "@/lib/sugerencias/repository";

/**
 * The notification the Área de Innovación receives when a suggestion is
 * registered — backlog item #14, and the only message this portal sends.
 *
 * A PURE FUNCTION OVER A DTO, on purpose. Nothing here reads the environment,
 * opens a socket or knows what a mail API is; `servicio.ts` does the sending and
 * `notificar.ts` decides that a failure is nobody's problem. That split is why
 * every sentence below can be asserted without a network, and why the day the
 * mail provider changes, this file does not.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  PLAIN TEXT, NOT HTML
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every field in this message is free text a collaborator typed. In HTML that
 * makes each one an escaping obligation, and the one that is forgotten is the
 * one that renders somebody's `<script>` inside the Área de Innovación's mail
 * client. Plain text has no such obligation: there is no markup, so there is
 * nothing to inject into. The message is six lines and a paragraph — it gains
 * nothing from formatting it cannot afford.
 *
 * The subject line is the exception, because a header genuinely can be broken by
 * its content. See `asuntoDe` below.
 */

export interface AutorDelCorreo {
  nombre: string;
  correo: string;
}

export interface MensajeDeCorreo {
  asunto: string;
  texto: string;
}

/**
 * The prefix every notification carries, so a filing rule in Outlook can be
 * written once against a string the portal controls rather than against a
 * sender address that may change with the provider.
 */
const PREFIJO_ASUNTO = "[Portal de Innovación] Nueva sugerencia: ";

/**
 * The subject's cap.
 *
 * `titulo` is `NVARCHAR(200)` and the schema lets all 200 through, which is a
 * perfectly reasonable title and a terrible subject line: mail clients truncate
 * it in the list anyway, and a few gateways fold or reject an over-long header.
 * Cutting it here means the portal decides where the cut lands and marks it with
 * an ellipsis, instead of letting each client cut somewhere different and
 * silently.
 */
const ASUNTO_MAX = 120;

/** Lima, always — the readers are there and the DTO's dates are UTC. */
const ZONA = "America/Lima";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", {
  timeZone: ZONA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * The title, made safe to put in a header and short enough to be one.
 *
 * CR and LF are collapsed to a space BEFORE anything else. A subject containing
 * a newline is how a header is split in two, and the second half is whatever the
 * author felt like writing — including another header. The mail API is the one
 * assembling the message here, not this code, so this is defence in depth rather
 * than the only guard; it costs one `replace` and removes the question.
 */
function asuntoDe(titulo: string): string {
  const enUnaLinea = titulo.replace(/[\r\n]+/g, " ").trim();
  const disponible = ASUNTO_MAX - PREFIJO_ASUNTO.length;

  return (
    PREFIJO_ASUNTO +
    (enUnaLinea.length > disponible
      ? `${enUnaLinea.slice(0, disponible - 1).trimEnd()}…`
      : enUnaLinea)
  );
}

/**
 * Builds the notification for one registered suggestion.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE BODY SAYS THE SUGGESTION IS ALREADY REGISTERED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Because this mail is the ONLY part of the flow that can be lost, and the
 * reader has no way of knowing that from the outside. ADR 0008 was rejected:
 * there is no outbox, no retry and no queue, so a mail that fails is a mail that
 * never existed. Telling the reader in the message itself that the record lives
 * in the portal is what keeps a missing notification from becoming a lost idea —
 * the panel is the source of truth, this is a nudge towards it.
 *
 * The id is in the body for the same reason: it is what an administrator types
 * into the panel when the mail is all they have.
 */
export function mensajeDeSugerencia(
  sugerencia: SugerenciaDTO,
  autor: AutorDelCorreo,
): MensajeDeCorreo {
  const fecha = FORMATO_FECHA.format(new Date(sugerencia.fechaCreacion));

  return {
    asunto: asuntoDe(sugerencia.titulo),
    texto: [
      `Se registró una nueva sugerencia en el Portal de Innovación.`,
      ``,
      `Sugerencia: #${sugerencia.id}`,
      `Título:     ${sugerencia.titulo}`,
      `Autor:      ${autor.nombre} <${autor.correo}>`,
      `Área destino: ${sugerencia.areaDestino}`,
      `Fecha:      ${fecha} (hora de Lima)`,
      ``,
      `Descripción`,
      `-----------`,
      sugerencia.descripcion,
      ``,
      `La sugerencia ya quedó registrada en el portal, en estado "pendiente".`,
      `Este correo es solo un aviso: para revisarla y cambiar su estado, ingresa al`,
      `panel de sugerencias del portal.`,
      ``,
    ].join("\n"),
  };
}
