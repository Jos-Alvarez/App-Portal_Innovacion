import type { ChipTone } from "@/components/chip/chip";
import type { TipoError, TipoRecurso } from "@/lib/analitica/metricas";
import type { Rango } from "@/lib/analitica/periodos";
import { ZONA_HORARIA } from "@/lib/zona-horaria";

/**
 * The words and the number formats of the analytics screen — everything item
 * #18 deliberately left unnamed.
 *
 * The engine answers in storage tokens and raw integers on purpose: `""` for an
 * area Entra ID never reported, `null` for a resource whose catalogue row is
 * gone, `error_tamano` for a rejected upload. `lib/analitica/metricas.ts` says of
 * each of them that item #19 decides how to draw it. This is that decision, in
 * one file, so the ranking and the comparison beside it cannot word the same
 * fact two ways.
 *
 * SCREEN-LOCAL AND NOT `lib/`. Every other vocabulary in this portal moved down
 * to `lib/` the moment a SECOND screen showed the same rows — the suggestion
 * states did, the resource types did. Nothing here has a second reader: no other
 * screen names an error type, a report period or an empty area. The day one
 * does, this file moves, exactly as `lib/sugerencias/etiquetas.ts` did.
 */

/** The four periods, as the chips write them. */
export const ETIQUETA_RANGO: Record<Rango, string> = {
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  personalizado: "Personalizado",
};

/**
 * The five typed errors as column headers.
 *
 * SHORT, because they head a numeric column in a table that already says it is
 * about failures — "Formato" over a column of counts is unambiguous where
 * "Archivos con formato no permitido" would wrap onto three lines. The long
 * sentences already exist and belong to the collaborator who hit the error:
 * `lib/procesadores/ejecucion-errores.ts` owns those, and they say what to DO
 * about it, which is not what an administrator counting attempts needs.
 *
 * `error_clave_inexistente` is the odd one: it is not the collaborator's doing at
 * all — the procesador's `clave_procesador` matches no module in the service —
 * so it is named after the cause an administrator can act on rather than after
 * what the person did.
 */
export const ETIQUETA_TIPO_ERROR: Record<TipoError, string> = {
  error_formato: "Formato",
  error_tamano: "Tamaño",
  error_contenido: "Contenido",
  error_cantidad: "Cantidad",
  error_clave_inexistente: "Sin módulo",
};

/** The two resource tables of ADR 0002, as a chip beside each name. */
export const ETIQUETA_TIPO_RECURSO: Record<TipoRecurso, string> = {
  enlace: "Enlace",
  procesador: "Procesador",
};

/**
 * The tones the rest of the portal already gives these two.
 *
 * `procesador` is navy on the dashboard (`app/(portal)/etiquetas.ts`) and stays
 * navy here. `enlace` is the ONE term this screen writes differently, and on
 * purpose: the dashboard splits it into "Aplicación" and "Agente de IA" because a
 * collaborator picks between them, while `evento_uso.tipo_recurso` records only
 * the table the row came from. Colouring it "info" — the derived cyan the
 * catalogue gives `app` — would claim these events were all applications when the
 * agents are in the same bucket, so it takes the neutral grey instead.
 */
export const TONO_TIPO_RECURSO: Record<TipoRecurso, ChipTone> = {
  enlace: "neutral",
  procesador: "navy",
};

/**
 * The bucket for a person whose `area` Entra ID never reported.
 *
 * Not "Otros" and not blank. Blank reads as a rendering bug, and "Otros" reads
 * as a real area that happens to be miscellaneous — an administrator would go
 * looking for it in the org chart. "Sin área" says exactly what is known: the
 * directory has no department for these people, which is itself something the
 * Área de Innovación can go and fix.
 */
export const SIN_AREA = "Sin área";

/** An area as a person reads it — the storage `""` becomes the bucket's name. */
export function etiquetaDeArea(area: string): string {
  return area === "" ? SIN_AREA : area;
}

/**
 * A resource whose catalogue row no longer exists.
 *
 * `evento_uso` has no foreign key (ADR 0002), so an event outlives the row it
 * points at and `nombre` comes back `null`. The id is kept in the label because
 * it is the only handle left: two deleted resources in one ranking would
 * otherwise be the same row twice, and an administrator asking "what was 41"
 * has something to search the logs with.
 */
export function nombreDeRecurso(recurso: { id: number; nombre: string | null }): string {
  return recurso.nombre ?? `Recurso eliminado (#${recurso.id})`;
}

/** The same, for a `usuario` row that is gone or was never named. */
export function nombreDePersona(persona: { id: number; nombre: string | null }): string {
  return persona.nombre ?? `Persona #${persona.id}`;
}

/**
 * `es-PE`, pinned, for the same reason `lib/sugerencias/fechas.ts` pins its zone:
 * this screen is rendered on the server and hydrated in the browser, and a
 * thousands separator taken from the ambient locale would differ between the two
 * renders and be reported as a hydration mismatch.
 */
const FORMATO_NUMERO = new Intl.NumberFormat("es-PE");

/** A count, grouped — four digits of openings should not read as a year. */
export function formatearNumero(valor: number): string {
  return FORMATO_NUMERO.format(valor);
}

/**
 * A difference against the previous period, with its sign always written.
 *
 * `+0` is never shown — an unchanged figure reads as "0" and a leading plus on
 * nothing is noise — but a real increase always carries its `+`, because "12"
 * beside a figure is ambiguous about whether it is the delta or the old value.
 *
 * The minus is U+2212, not a hyphen: it is the character that lines up with
 * digits in a column of figures.
 */
export function formatearDiferencia(diferencia: number): string {
  if (diferencia === 0) return "0";

  return diferencia > 0
    ? `+${formatearNumero(diferencia)}`
    : `−${formatearNumero(Math.abs(diferencia))}`;
}

/**
 * Adoption as a percentage, or a dash when there is nobody to divide by.
 *
 * A portal where nobody holds access yet is not "0 % adoption" — that reads as a
 * portal people are refusing to use. It is a portal with nothing assigned, which
 * is a different finding and the one an administrator can act on.
 */
export function formatearPorcentaje(parte: number, total: number): string {
  if (total <= 0) return "—";

  return `${Math.round((parte / total) * 100)} %`;
}

/**
 * A `YYYY-MM-DD` from the engine, as a person reads it.
 *
 * Built from the three numbers directly and NOT through `new Date(iso)`. The
 * engine's dates are calendar days with no time and no offset; parsing one as an
 * instant makes it midnight UTC, and `formatearFecha`'s Lima formatter would then
 * draw a period starting on the 21st as the 20th at 19:00. `lib/analitica/periodos.ts`
 * chose `YYYY-MM-DD` for the wire precisely so this screen would not have to undo
 * a time zone it never applied.
 */
export function formatearDia(dia: string): string {
  const [anio, mes, resto] = dia.split("-");

  return resto === undefined ? dia : `${resto}/${mes}/${anio}`;
}

/** The period on screen: "21/08/2026" for one day, "15/08/2026 – 21/08/2026" for more. */
export function etiquetaDePeriodo(periodo: { desde: string; hasta: string }): string {
  return periodo.desde === periodo.hasta
    ? formatearDia(periodo.desde)
    : `${formatearDia(periodo.desde)} – ${formatearDia(periodo.hasta)}`;
}

/**
 * Today in Lima as `<input type="date">` writes it — the ceiling of both date
 * fields.
 *
 * The zone is the portal's, not the reader's: the engine resolves every period
 * against `America/Lima` (`lib/zona-horaria.ts`), so an administrator travelling
 * with a laptop in Madrid must not be offered a "tomorrow" the server would
 * answer as empty.
 *
 * `en-CA` is the shortest way to get `YYYY-MM-DD` out of `Intl` — the format the
 * date input speaks — without assembling it from three `getUTC*` calls that would
 * be in the wrong zone anyway.
 */
export function hoyEnLima(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: ZONA_HORARIA,
  }).format(ahora);
}
