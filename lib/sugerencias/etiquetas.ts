import type { ChipTone } from "@/components/chip/chip";
import type { EstadoSugerencia } from "@/lib/sugerencias/schema";

/**
 * How the five states of a suggestion are written and coloured — the single
 * place the storage tokens become Spanish.
 *
 * It lives in `lib/` and not beside the screen because two screens will read
 * it: the collaborator's own list (item #13) and the administrator's management
 * screen (item #15), which changes the very states this names. Two copies would
 * eventually disagree about a word, and the reader has no way to tell that
 * "En revisión" on one screen and "En revision" on the other are the same
 * thing — they are looking at the same row.
 *
 * Both records are keyed on `EstadoSugerencia`, so a sixth state stops the
 * build here until it has a name and a colour, instead of reaching a browser as
 * a raw `en_revision`.
 */

export const ETIQUETA_ESTADO: Record<EstadoSugerencia, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  implementada: "Implementada",
};

/**
 * DESIGN.md assigns these five directly, and this is the one place in the
 * portal where it does: "Estados de sugerencia: pendiente gris, en revisión
 * ámbar, aprobada verde, rechazada rojo, implementada navy."
 *
 * `rechazada` is therefore the single legitimate use of red outside an error or
 * a destructive action — DESIGN.md's own rule names it as the exception, so the
 * chip is following the document rather than bending it.
 */
export const TONO_ESTADO: Record<EstadoSugerencia, ChipTone> = {
  pendiente: "neutral",
  en_revision: "warn",
  aprobada: "ok",
  rechazada: "danger",
  implementada: "navy",
};

/**
 * One ledger entry, in words.
 *
 * The entry with no previous state is the send itself, and it reads as an event
 * rather than as a transition — "Enviada" — because "→ Pendiente" with nothing
 * on the left is a sentence about the database, not about what happened.
 *
 * It lives here rather than beside a screen because BOTH screens render the same
 * ledger: item #13's author reading their own trail and item #15's administrator
 * reading the one they are about to add to. Two copies would eventually word one
 * transition differently on the two screens that show the very same row.
 */
export function textoDeAsiento(asiento: {
  estadoAnterior: EstadoSugerencia | null;
  estadoNuevo: EstadoSugerencia;
}): string {
  const destino = ETIQUETA_ESTADO[asiento.estadoNuevo];

  return asiento.estadoAnterior === null
    ? `Enviada · ${destino}`
    : `${ETIQUETA_ESTADO[asiento.estadoAnterior]} → ${destino}`;
}
