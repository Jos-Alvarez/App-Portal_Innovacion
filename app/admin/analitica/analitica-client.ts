import type { SWRConfiguration } from "swr";

import type { Rango } from "@/lib/analitica/periodos";
import type { RespuestaAnalitica } from "@/lib/analitica/servicio";

/**
 * The browser's side of `GET /api/analitica`: how a question becomes a URL, how
 * an answer is read, and how often the answer is asked for again.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE URL IS THE STATE, AND THAT IS WHY SWR IS WORTH IT HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every other admin screen keeps one list and refreshes it. This screen holds a
 * QUESTION — four periods times a comparison toggle — and an administrator moves
 * between them several times a minute while reading. Keying the cache on the
 * built URL means going back to "Hoy" after looking at the last 30 days is
 * instant and costs no request, because that answer is already in the cache
 * under its own key. A single `useState` holding "the metrics" would have thrown
 * the previous answer away on every chip.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE POLL FOLLOWS THE QUESTION, NOT THE SCREEN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0007 asks for revalidation "al recuperar el foco y en intervalos", and the
 * two halves are not equally true of every period here. A closed range in July
 * cannot change: polling it every minute would spend a request a minute — three
 * `GROUP BY`s over `evento_uso` each time — to redraw identical numbers. A period
 * that includes today changes constantly, and it is the one an administrator
 * leaves open all morning.
 *
 * So the interval is conditional and the focus revalidation is not. Coming back
 * to the tab is the reader ASKING, and answering a stale July with fresh July
 * costs one request they caused themselves.
 */

/** ADR 0003's endpoint, and item #18's whole surface. */
export const RUTA_ANALITICA = "/api/analitica";

/** The question as the controls hold it — both dates are `""` until typed. */
export interface ConsultaUI {
  rango: Rango;
  /** `YYYY-MM-DD`, the format `<input type="date">` reads and writes. */
  desde: string;
  hasta: string;
  comparar: boolean;
}

/**
 * What the screen opens on, and what the Server Component pre-reads.
 *
 * "Hoy" without a comparison: the cheapest question the engine answers — one
 * period, three aggregations — and the one an administrator opening the screen
 * in the morning is asking. A default of 30 días with a comparison would spend
 * six aggregations before anybody chose anything.
 */
export const CONSULTA_INICIAL: ConsultaUI = {
  rango: "hoy",
  desde: "",
  hasta: "",
  comparar: false,
};

/** One period asked for, one to compare against, and nothing else that changes. */
export const MENSAJE_RANGO_INCOMPLETO = "Elige la fecha de inicio y la de fin del rango.";

/** An inverted range is empty, and every metric in it would read as "nadie usó el portal". */
export const MENSAJE_RANGO_INVERTIDO = "La fecha de inicio no puede ser posterior a la de fin.";

/**
 * THE ONLY FAILURE MESSAGE THIS SCREEN HAS, and the reason there is only one.
 *
 * A failed read here can never leave the reader with nothing: the Server
 * Component already shipped a complete report for the default period, and
 * `keepPreviousData` keeps the last good one on screen while a new period
 * loads. So "the request failed" and "the request failed and the screen is
 * empty" are not two cases — the second one cannot happen inside this
 * component, and the empty case that CAN happen (the server read itself
 * failing) belongs to `error.tsx`.
 *
 * A second message for an unreachable state would have been a sentence nobody
 * could ever be shown, and — worse — a branch nobody could ever test.
 *
 * The copy therefore says both true things at once: the newest numbers did not
 * arrive, and what IS on screen is a real reading, labelled with its own period
 * right above.
 */
export const AVISO_SIN_ACTUALIZAR =
  "No pudimos traer los datos más recientes. Sigues viendo la última lectura correcta, con su " +
  "periodo indicado arriba; lo intentaremos de nuevo en un momento.";

/** The shape `<input type="date">` produces, and the only one the engine accepts. */
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Why a custom range cannot be asked yet, or `null` when it can.
 *
 * The two rules are the engine's own (`lib/analitica/schema.ts` refuses both),
 * and they are repeated here for one reason: the reader is filling in two date
 * fields, so the answer to "that range is not valid" has to arrive while they
 * are looking at the fields — not as a failed request whose message says nothing
 * about which end is wrong. The server still refuses; this only saves a round
 * trip and names the problem.
 *
 * String comparison is enough for the ordering: `YYYY-MM-DD` sorts
 * lexicographically exactly as it sorts chronologically, which is why the engine
 * put dates on the wire in that format.
 */
export function problemaDeRango(consulta: ConsultaUI): string | null {
  if (consulta.rango !== "personalizado") return null;

  if (!DIA.test(consulta.desde) || !DIA.test(consulta.hasta)) {
    return MENSAJE_RANGO_INCOMPLETO;
  }

  return consulta.desde > consulta.hasta ? MENSAJE_RANGO_INVERTIDO : null;
}

/**
 * The question as a URL — SWR's key and the request in one string.
 *
 * `null` when the custom range is not askable yet, which is exactly what SWR
 * reads as "do not fetch": the reader who has typed one of the two dates is not
 * asking anything, and firing a request on every keystroke would ask the server
 * about half-written questions.
 *
 * THE PRESETS CARRY NO DATES, deliberately. `lib/analitica/schema.ts` refuses a
 * preset that arrives with `desde`, rather than ignoring them, so that a caller
 * whose dates were dropped hears about it. Leaving the fields' last values in the
 * query string would turn every switch back to "Hoy" into a 400.
 */
export function rutaDe(consulta: ConsultaUI): string | null {
  if (problemaDeRango(consulta) !== null) return null;

  const params = new URLSearchParams({ rango: consulta.rango });

  if (consulta.rango === "personalizado") {
    params.set("desde", consulta.desde);
    params.set("hasta", consulta.hasta);
  }

  /* Absent means "no" to the schema, so `false` is written by omission. */
  if (consulta.comparar) {
    params.set("comparar", "true");
  }

  return `${RUTA_ANALITICA}?${params.toString()}`;
}

/**
 * Whether the period being asked about is still happening.
 *
 * The presets always are — `hoy`, `7d` and `30d` all end today by construction
 * (`lib/analitica/periodos.ts`). A custom range only is when its last day has not
 * passed.
 *
 * TODAY ARRIVES AS A STRING FROM THE SERVER and is not read from the browser's
 * clock. Two reasons, and both are the same reason twice: the reader's laptop may
 * be in another zone, so its "today" is not the day the engine resolves periods
 * against; and this component is server-rendered and then hydrated, so a value
 * read from `Date` in the browser could differ from the one in the HTML and be
 * reported as a hydration mismatch.
 */
export function periodoEnCurso(consulta: ConsultaUI, hoy: string): boolean {
  if (consulta.rango !== "personalizado") return true;

  return consulta.hasta >= hoy;
}

/** One minute, matching every other polled list in this portal. */
export const INTERVALO_MS = 60_000;

/** ADR 0007's policy, applied only where the numbers can actually move. */
export function opcionesDe(
  consulta: ConsultaUI,
  hoy: string,
): SWRConfiguration<RespuestaAnalitica> {
  return {
    refreshInterval: periodoEnCurso(consulta, hoy) ? INTERVALO_MS : 0,
    revalidateOnFocus: true,
    /*
     * DO NOT RE-ASK FOR THE PERIOD THE SERVER JUST ANSWERED.
     *
     * SWR revalidates on mount by default, `fallbackData` included — so without
     * this line every single load of the screen would fire `GET /api/analitica`
     * for `rango=hoy` immediately, spending three `GROUP BY`s over `evento_uso`
     * to redraw numbers that are already in the HTML and are at most one request
     * old. The Server Component read them for this very request.
     *
     * It only affects the mount. Changing the period fetches the new key as
     * usual, and coming back to a period already in the cache still revalidates
     * it, because by then it really can be stale.
     */
    revalidateOnMount: false,
    /*
     * Keep the previous period's numbers on screen while the next one loads.
     * Without it, every chip blanks the whole dashboard for the length of a round
     * trip, and a reader comparing two periods loses the one they were reading
     * before the other arrives.
     */
    keepPreviousData: true,
  };
}

/** A 200 that did not carry a report is not a report. */
function esRespuesta(cuerpo: unknown): cuerpo is RespuestaAnalitica {
  if (typeof cuerpo !== "object" || cuerpo === null) return false;

  const { periodo, metricas } = cuerpo as { periodo?: unknown; metricas?: unknown };

  return (
    typeof periodo === "object" &&
    periodo !== null &&
    typeof metricas === "object" &&
    metricas !== null
  );
}

/**
 * THIS FETCHER THROWS, for the same reason every other fetcher in this portal
 * does: SWR replaces the cached value with whatever resolves and KEEPS the last
 * good one when it rejects.
 *
 * Resolving an empty report on a bad minute would draw a dashboard of zeros —
 * "nobody used the portal today", which is a claim about the company rather than
 * about the network, and the one claim this screen must never make by accident.
 */
export async function obtenerAnalitica(ruta: string): Promise<RespuestaAnalitica> {
  /* A rejected fetch propagates untouched: it is already the signal SWR needs. */
  const response = await fetch(ruta, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`GET ${ruta} respondió ${response.status}`);
  }

  const cuerpo = await response.json().catch(() => undefined);

  if (!esRespuesta(cuerpo)) {
    throw new Error(`GET ${ruta} respondió 200 sin el reporte`);
  }

  return cuerpo;
}
