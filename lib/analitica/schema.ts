import { z } from "zod";

import { RANGOS } from "@/lib/analitica/periodos";

/**
 * What a valid analytics query is — the query string of ADR 0003's
 * `GET /api/analitica`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `rango` IS AN ADDITION TO THE ADR'S SIGNATURE, AND IT IS DELIBERATE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0003 writes the endpoint as `GET /api/analitica?desde=&hasta=&comparar=`,
 * which describes the custom range and nothing else. The PRD asks for four
 * periods — hoy, 7 días, 30 días and a custom range — so the three presets have
 * to be expressed somehow, and there are only two places to compute them.
 *
 * IN THE BROWSER, sending the resulting dates: rejected. The browser's clock and
 * zone belong to the reader, so an administrator whose laptop is in Madrid would
 * ask for a "today" that started at 19:00 Lima time the previous evening, and
 * two administrators looking at the same screen would see different numbers.
 * `lib/analitica/periodos.ts` explains why the day boundary has to be one
 * agreed-upon thing.
 *
 * ON THE SERVER, named by the caller: this. `rango` says WHICH period, the
 * server resolves it against the deployment's clock in the portal's own zone,
 * and `desde`/`hasta` are still exactly what the ADR named — the two ends of
 * `personalizado`. The query string is a superset of the one the ADR wrote, so
 * nothing that ADR promised is taken away.
 */

/**
 * A calendar day as the client writes it: `YYYY-MM-DD`, and nothing else.
 *
 * NOT `z.coerce.date()` and not `new Date(valor)`. Both accept a full ISO
 * timestamp with an offset, which would let a caller ask for a period that
 * starts at 14:30 — a range this engine cannot describe and the screen cannot
 * label. Both also accept `"2026-02-31"` by rolling it into March, so a typo
 * would silently return the wrong month's data.
 *
 * The regex fixes the shape and the refinement fixes the calendar: the parsed
 * numbers have to survive a round trip through `Date.UTC`, which is what rejects
 * the 31st of February and the 13th month without a table of month lengths.
 */
export const diaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((valor) => {
    const [anio, mes, dia] = valor.split("-").map(Number);
    return { anio, mes, dia };
  })
  .refine(({ anio, mes, dia }) => {
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));

    return (
      fecha.getUTCFullYear() === anio && fecha.getUTCMonth() + 1 === mes && fecha.getUTCDate() === dia
    );
  });

/**
 * `comparar` as a query parameter, where everything is a string or absent.
 *
 * Only the two spellings a client would actually write are accepted, and an
 * absent parameter means "no". Anything else is refused rather than treated as
 * false: a caller who wrote `comparar=si` asked for a comparison and would
 * otherwise get a screen quietly missing the half they came for.
 */
export const compararSchema = z
  .union([z.literal("true"), z.literal("false")])
  .nullish()
  .transform((valor) => valor === "true");

/**
 * The whole query, cross-validated.
 *
 * The two rules a single field cannot express live here:
 *
 *   · `personalizado` needs both ends. A range with one end named is not a
 *     range, and guessing the other one would answer a question nobody asked.
 *   · A preset must NOT carry them. Accepting and ignoring `desde` would tell a
 *     caller their dates were applied when the server resolved `hoy` instead —
 *     the kind of failure that is only ever noticed by somebody who trusted the
 *     number.
 *   · `desde` cannot be after `hasta`. An inverted range is empty, so every
 *     metric would come back at zero and read as "nobody used the portal".
 */
export const consultaSchema = z
  .object({
    rango: z.enum(RANGOS),
    desde: diaSchema.nullish(),
    hasta: diaSchema.nullish(),
    comparar: compararSchema,
  })
  .refine(
    ({ rango, desde, hasta }) =>
      rango === "personalizado" ? desde != null && hasta != null : desde == null && hasta == null,
  )
  .refine(({ desde, hasta }) => {
    if (desde == null || hasta == null) return true;

    return Date.UTC(desde.anio, desde.mes - 1, desde.dia) <= Date.UTC(hasta.anio, hasta.mes - 1, hasta.dia);
  });

export type Consulta = z.infer<typeof consultaSchema>;

/**
 * The query string as it arrives, before parsing.
 *
 * `URLSearchParams.get` answers `null` for an absent parameter, which the schema
 * reads as "not sent" — so this is the whole translation, and the route does not
 * have to know that zod prefers `undefined`.
 */
export function leerConsulta(params: URLSearchParams): unknown {
  return {
    rango: params.get("rango"),
    desde: params.get("desde"),
    hasta: params.get("hasta"),
    comparar: params.get("comparar"),
  };
}
