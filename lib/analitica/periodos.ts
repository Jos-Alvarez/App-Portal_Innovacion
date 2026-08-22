import { ZONA_HORARIA } from "@/lib/zona-horaria";

/**
 * Where a reporting period begins and ends — backlog item #18, under ADR 0010.
 *
 * Every number this engine produces is bounded by one of these ranges, so a
 * boundary that is off by a few hours moves events between periods and quietly
 * changes every metric on the screen. This module is where that is decided, and
 * it is pure: no database, no `process.env`, and `ahora` is a parameter, so the
 * whole of it is exercised against fixed instants.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TWO CLOCKS, AND WHY A NAIVE COLUMN IS COMPARED AGAINST `Date.UTC`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This is the one genuinely subtle thing in item #18, so it is written out.
 *
 *   1. `evento_uso.fecha` is `DATETIME2` with `DEFAULT CURRENT_TIMESTAMP`
 *      (see the initial migration). SQL Server's `CURRENT_TIMESTAMP` is the
 *      DATABASE HOST's wall clock and carries no offset: the column holds a
 *      naive local timestamp, not an instant.
 *
 *   2. Prisma maps `DateTime2` to a JavaScript `Date` by reading that naive
 *      value AS IF it were UTC. A row stamped `2026-08-21 14:30:00` comes back
 *      as `2026-08-21T14:30:00.000Z`.
 *
 * So a boundary that is meant to mean "the wall clock read 00:00" has to be
 * built with `Date.UTC(y, m, d)` — no offset applied, because there is no offset
 * in the column to correct for. Shifting it by −05:00 "to convert Lima to UTC"
 * is the intuitive move and it is exactly wrong: it would compare 05:00 against
 * a column that never left local time, and every period would start five hours
 * late.
 *
 * The offset DOES apply to the other conversion — turning the real instant
 * `ahora` into the calendar day the reader is living in — and that one is done
 * by `Intl`, with the zone pinned, rather than by arithmetic. `Intl` knows the
 * whole history of Peru's offsets; a hardcoded −5 would be right today and
 * silently wrong if that ever changed.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHICH WALL CLOCK, THOUGH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The one the database host keeps, and this portal assumes it is Lima's — the
 * company's own zone, already pinned everywhere a date is rendered. That is an
 * assumption about the deployment and it is stated here rather than hidden: a
 * SQL Server running in UTC would stamp rows five hours ahead of the day its
 * readers are living in, and "hoy" would begin at 19:00 the previous evening.
 * The fix in that case is one line of infrastructure — set the host's zone —
 * and not a correction smeared through this module, because a correction would
 * have to be undone the day somebody fixes the host.
 */

/** A half-open range: `desde` is included, `hasta` is not. */
export interface Periodo {
  desde: Date;
  hasta: Date;
}

/** The four ranges the PRD asks for. */
export const RANGOS = ["hoy", "7d", "30d", "personalizado"] as const;

export type Rango = (typeof RANGOS)[number];

/** How many calendar days each preset covers, counting today. */
const DIAS_POR_RANGO: Record<Exclude<Rango, "personalizado">, number> = {
  hoy: 1,
  "7d": 7,
  "30d": 30,
};

/** One calendar day, as three numbers. No instant, no zone, no time of day. */
export interface DiaCivil {
  anio: number;
  mes: number;
  dia: number;
}

const FORMATO_DIA = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ZONA_HORARIA,
});

/**
 * The calendar day an instant falls on, in the portal's zone.
 *
 * `en-CA` because it formats as `YYYY-MM-DD`, which parses without a table of
 * month names. `formatToParts` would avoid the string entirely and is more
 * ceremony than one `split` deserves.
 */
export function diaCivilDe(instante: Date): DiaCivil {
  const [anio, mes, dia] = FORMATO_DIA.format(instante).split("-").map(Number);

  return { anio, mes, dia };
}

/**
 * Midnight at the start of a calendar day, as the value to compare the column
 * against. See the header: `Date.UTC` and no offset, on purpose.
 */
export function inicioDeDia({ anio, mes, dia }: DiaCivil): Date {
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/** The same day shifted by whole days. `Date.UTC` normalises month and year. */
export function sumarDias(dia: DiaCivil, dias: number): DiaCivil {
  const desplazado = new Date(Date.UTC(dia.anio, dia.mes - 1, dia.dia + dias));

  return {
    anio: desplazado.getUTCFullYear(),
    mes: desplazado.getUTCMonth() + 1,
    dia: desplazado.getUTCDate(),
  };
}

/**
 * A preset range, resolved against the clock.
 *
 * WHOLE CALENDAR DAYS, NOT A ROLLING WINDOW. "Últimos 7 días" ends at the end of
 * today and begins at the start of the day six days ago — it does not mean "the
 * 168 hours before this instant". The rolling reading would make every reload
 * return slightly different numbers and would make the comparison against the
 * previous period impossible to explain: a Tuesday morning would be compared
 * against half of the Tuesday before it. Whole days also make `hoy` fall out as
 * the same rule with a length of one, rather than as a special case.
 *
 * `hasta` is the start of TOMORROW, and the range is half-open, so an event
 * recorded at 23:59:59.997 today is inside it. A closed range ending at 23:59:59
 * would drop the last second of every day, and `DATETIME2` has the precision to
 * notice.
 */
export function periodoDePreset(rango: Exclude<Rango, "personalizado">, ahora: Date): Periodo {
  const hoy = diaCivilDe(ahora);

  return {
    desde: inicioDeDia(sumarDias(hoy, 1 - DIAS_POR_RANGO[rango])),
    hasta: inicioDeDia(sumarDias(hoy, 1)),
  };
}

/**
 * A custom range, from two calendar days the caller named.
 *
 * Both ends are INCLUSIVE to the reader — somebody who types 01/08 to 07/08
 * means seven whole days — so `hasta` becomes the start of the day after it.
 */
export function periodoPersonalizado(desde: DiaCivil, hasta: DiaCivil): Periodo {
  return { desde: inicioDeDia(desde), hasta: inicioDeDia(sumarDias(hasta, 1)) };
}

/**
 * The period immediately before this one, of the same length.
 *
 * "Equivalente" in the PRD means the same amount of time, ending exactly where
 * this one starts: seven days are compared against the seven before them, and a
 * custom range of nineteen days against the nineteen before it. There is no
 * calendar arithmetic here — no "same days last month" — because the length is
 * what the comparison is about, and a month-shifted range of a different length
 * would compare two numbers that are not comparable.
 */
export function periodoAnterior({ desde, hasta }: Periodo): Periodo {
  const duracion = hasta.getTime() - desde.getTime();

  return { desde: new Date(desde.getTime() - duracion), hasta: new Date(desde.getTime()) };
}

/** How many whole days a period covers. Exposed for the response, not used here. */
export function diasDe({ desde, hasta }: Periodo): number {
  return Math.round((hasta.getTime() - desde.getTime()) / 86_400_000);
}

/**
 * A boundary read back as the calendar day it stands for.
 *
 * UTC getters and no zone conversion, because the value was built by
 * `inicioDeDia` with `Date.UTC` and never represented an instant — see the
 * header. Formatting it with `Intl` and a zone here would undo exactly what that
 * function did and hand back the previous day.
 */
export function diaCivilDeBoundary(fecha: Date): DiaCivil {
  return {
    anio: fecha.getUTCFullYear(),
    mes: fecha.getUTCMonth() + 1,
    dia: fecha.getUTCDate(),
  };
}

/** `YYYY-MM-DD` — the same shape the query string accepts. */
export function formatearDia({ anio, mes, dia }: DiaCivil): string {
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** A period as the client reads it, with `hasta` INCLUSIVE. */
export interface PeriodoDTO {
  /** First day covered, `YYYY-MM-DD`. */
  desde: string;
  /** Last day covered, `YYYY-MM-DD` — inclusive, unlike the internal range. */
  hasta: string;
  dias: number;
}

/**
 * The period as it leaves the API.
 *
 * TWO CALENDAR DAYS AND NOT TWO TIMESTAMPS, deliberately. An ISO instant like
 * `2026-08-21T00:00:00.000Z` is correct inside this module and a trap outside
 * it: item #19 renders dates through `formatearFecha`, which converts to Lima
 * and would draw the 20th at 19:00 for a period that starts on the 21st. A
 * `YYYY-MM-DD` has no time and no zone, so there is nothing left to convert.
 *
 * `hasta` becomes the last day INCLUDED, which is the day the reader named and
 * the day the screen has to print. The half-open boundary — the start of the day
 * after — is an implementation detail of the query and stays inside.
 */
export function aPeriodoDTO(periodo: Periodo): PeriodoDTO {
  const ultimoDia = new Date(periodo.hasta.getTime() - 86_400_000);

  return {
    desde: formatearDia(diaCivilDeBoundary(periodo.desde)),
    hasta: formatearDia(diaCivilDeBoundary(ultimoDia)),
    dias: diasDe(periodo),
  };
}
