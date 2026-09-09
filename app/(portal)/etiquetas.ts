import { ETIQUETA_TIPO, TONO_TIPO } from "@/lib/enlaces/etiquetas";
import type { ChipTone } from "@/components/chip/chip";
import type { TipoRecursoAsignado } from "@/lib/mis-recursos/repository";

/**
 * How the dashboard's vocabulary of three is written and coloured.
 *
 * WHY THE TWO ENLACE TERMS ARE IMPORTED AND NOT RESTATED. The catalogue's
 * `etiquetas.ts` says of itself that it is "the single place they become
 * Spanish, so the form's option list and the table's chip cannot drift into
 * naming the same thing two ways". A collaborator and the administrator who
 * assigned them the resource are looking at the SAME row: if one screen says
 * "Agente de IA" and the other ever says "Agente", they are talking about
 * something the reader cannot confirm is the same thing. Copying the two
 * entries here would create exactly the second place that comment forbids.
 *
 * The natural home for a term shared by two screens is `lib/enlaces`, next to
 * the vocabulary it names. That module is settled work outside this item's
 * scope, so the import points at the module that already holds the promise
 * rather than at a third copy created to avoid pointing at it.
 *
 * `procesador` is the term this module owns, because it is the term the split
 * of ADR 0002 keeps outside `enlace` entirely.
 *
 * Keying both records on `TipoRecursoAsignado` keeps the set closed: a fourth
 * kind of assigned resource stops the build here until it has a name and a
 * colour, instead of rendering as a raw storage token.
 */

export const ETIQUETA_RECURSO: Record<TipoRecursoAsignado, string> = {
  ...ETIQUETA_TIPO,
  procesador: "Procesador",
};

/**
 * DESIGN.md assigns violet (`--agent`) to the AI agent type and nothing to the
 * other two, so `app` keeps the derived cyan-soft "info" the catalogue gives it
 * and `procesador` takes navy.
 *
 * Navy is not a free choice — it is what is left. `ok`, `warn` and `danger` are
 * the semantic status colours ("el rojo jamás se usa fuera de error/
 * destrucción"), `neutral` is the grey DESIGN.md spends on "pendiente", and
 * `info` and `agent` are already the two enlace types. Navy is the remaining
 * brand tone and carries no state meaning a reader could misread.
 */
export const TONO_RECURSO: Record<TipoRecursoAsignado, ChipTone> = {
  ...TONO_TIPO,
  procesador: "navy",
};

/**
 * How the dashboard greets the person reading it.
 *
 * THE FIRST NAME, NOT THE WHOLE ROW. `usuario.nombre` is the `displayName`
 * Entra ID reports, which in this tenant is the full legal name — "Jose Rolando
 * Alvarez Fernandez". A greeting is the one place in the portal that speaks to
 * somebody rather than about them, and reading their four names back at them is
 * the opposite of what a greeting is for.
 *
 * IT MAY NOT BE A NAME AT ALL, and that is on purpose upstream: both the login
 * (`mapToUsuarioUpsert`) and the pre-registration fall back to the address when
 * nothing better is known. An address has no first name, so it comes back
 * whole — which is honest, and better than greeting somebody by half an e-mail.
 *
 * An empty name loses the comma rather than trailing one, because `usuario.nombre`
 * is NOT NULL with no default and the day something writes `""` into it the
 * screen should still read as Spanish.
 */
export function saludo(nombre: string): string {
  const primero = nombre.trim().split(/\s+/)[0] ?? "";

  return primero === "" ? "Hola" : `Hola, ${primero}`;
}
