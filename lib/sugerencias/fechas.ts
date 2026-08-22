/**
 * How a suggestion's timestamps are written, for every screen that shows one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE FIXED TIME ZONE, AND IT IS NOT A SIMPLIFICATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * These lists are rendered on the server and then hydrated in the browser. A
 * date formatted with the ambient zone would be formatted TWICE — once with the
 * server process's zone, once with the reader's — and a suggestion sent at 21:00
 * in Lima is already the next day in UTC. React would find different text in the
 * two renders and report a hydration mismatch, and the reader would watch the
 * date change under them.
 *
 * Pinning the zone makes both renders agree by construction. `America/Lima` is
 * not a default picked for convenience: it is where the company operates, so it
 * is also the zone in which "el martes" means what the reader thinks it means.
 * A traveller sees Lima time, which is the correct answer for a corporate record
 * rather than a compromise.
 *
 * `es-PE` for the same reason, and it fixes the order to día/mes/año regardless
 * of the browser's own locale.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS LEFT `app/(portal)/sugerencias/sugerencias-client.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Item #13 wrote it there because one screen showed these dates. Item #15 adds
 * the second, and the two show THE SAME ROWS — a collaborator and an
 * administrator reading one suggestion's ledger have to see one timestamp, not
 * two that agree until somebody edits one of the copies. Reaching across from
 * `app/admin/` into `app/(portal)/` to import it would have coupled two screens
 * that share data and nothing else, so the definition moved down to `lib/`,
 * where both of them already read the states and their labels from.
 *
 * `sugerencias-client.ts` re-exports both names, so item #13's call sites and
 * its suite are untouched by the move.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  AND WHY THE ZONE ITSELF LEFT AGAIN, ONE LEVEL FURTHER DOWN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Item #18's analytics engine needs the same zone to decide where "hoy" begins,
 * which is the same argument one level up: two features sharing a fact. So
 * `ZONA_HORARIA` now lives in `lib/zona-horaria.ts` and is re-exported here,
 * exactly as `sugerencias-client.ts` re-exports these two functions. Nothing
 * that imported it from this module has to change.
 */

import { ZONA_HORARIA } from "@/lib/zona-horaria";

export { ZONA_HORARIA };

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONA_HORARIA,
});

/**
 * An ISO timestamp as a person reads it.
 *
 * An unparseable string comes back as a dash rather than as "Invalid Date". The
 * date is context around a suggestion, never the point of the screen: it is not
 * worth an exception that blanks the whole list.
 */
export function formatearFecha(iso: string): string {
  const fecha = new Date(iso);

  return Number.isNaN(fecha.getTime()) ? "—" : FORMATO_FECHA.format(fecha);
}
