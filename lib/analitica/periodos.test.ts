// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  aPeriodoDTO,
  diaCivilDe,
  diasDe,
  formatearDia,
  inicioDeDia,
  periodoAnterior,
  periodoDePreset,
  periodoPersonalizado,
  sumarDias,
} from "@/lib/analitica/periodos";
import { ZONA_HORARIA } from "@/lib/zona-horaria";

/**
 * Where a period begins and ends.
 *
 * This is the file that protects the subtle half of item #18. Two conversions
 * live next to each other and pull in opposite directions:
 *
 *   · an INSTANT (`ahora`) becomes the calendar day the reader is living in,
 *     which needs the zone;
 *   · a calendar day becomes the value compared against `evento_uso.fecha`,
 *     which must NOT be shifted at all, because that column is a naive local
 *     timestamp that Prisma hands back as if it were UTC.
 *
 * Applying the offset to the second one is the intuitive mistake and it moves
 * every boundary by five hours, which silently reassigns five hours of events to
 * the neighbouring period. The tests below fail if that ever happens.
 */

/** 21/08/2026, 10:00 in Lima — the middle of a working day, no ambiguity. */
const MEDIODIA_LIMA = new Date("2026-08-21T15:00:00.000Z");

describe("diaCivilDe", () => {
  it("lee el día que vive el lector, no el del reloj UTC", () => {
    expect(diaCivilDe(MEDIODIA_LIMA)).toEqual({ anio: 2026, mes: 8, dia: 21 });
  });

  /**
   * 03:00Z on the 22nd is 22:00 on the 21st in Lima. A portal that answered "el
   * 22" here would put an evening's work into the next day's report, and the
   * person who did it would open the screen the next morning and find their own
   * activity already counted.
   */
  it("una noche limeña todavía es el día anterior, aunque en UTC ya sea el siguiente", () => {
    expect(diaCivilDe(new Date("2026-08-22T03:00:00.000Z"))).toEqual({
      anio: 2026,
      mes: 8,
      dia: 21,
    });
  });

  it("cambia de día exactamente a la medianoche limeña", () => {
    expect(diaCivilDe(new Date("2026-08-22T04:59:59.999Z"))).toMatchObject({ dia: 21 });
    expect(diaCivilDe(new Date("2026-08-22T05:00:00.000Z"))).toMatchObject({ dia: 22 });
  });

  /**
   * The zone is asked, never assumed. This is the guard on the one fact the
   * module leans on: if Peru ever adopted daylight saving, `Intl` would know and
   * this assertion would start failing on one of the two dates.
   */
  it("usa la zona del portal y no la del proceso", () => {
    const offsetEnEnero = new Date("2026-01-15T05:00:00.000Z");
    const offsetEnJulio = new Date("2026-07-15T05:00:00.000Z");

    expect(ZONA_HORARIA).toBe("America/Lima");
    expect(diaCivilDe(offsetEnEnero)).toMatchObject({ dia: 15 });
    expect(diaCivilDe(offsetEnJulio)).toMatchObject({ dia: 15 });
  });
});

describe("inicioDeDia", () => {
  /**
   * The anti-regression of the whole module. `evento_uso.fecha` is a naive
   * `DATETIME2` that Prisma reads as UTC, so the boundary for "the 21st" is
   * literally `2026-08-21T00:00:00.000Z`. A −05:00 correction would produce
   * 05:00Z and drop the first five hours of every day.
   */
  it("no desplaza nada: el día 21 empieza en 2026-08-21T00:00:00.000Z", () => {
    expect(inicioDeDia({ anio: 2026, mes: 8, dia: 21 }).toISOString()).toBe(
      "2026-08-21T00:00:00.000Z",
    );
  });
});

describe("sumarDias", () => {
  it("cruza el fin de mes", () => {
    expect(sumarDias({ anio: 2026, mes: 8, dia: 31 }, 1)).toEqual({ anio: 2026, mes: 9, dia: 1 });
  });

  it("cruza el fin de año hacia atrás", () => {
    expect(sumarDias({ anio: 2026, mes: 1, dia: 1 }, -1)).toEqual({
      anio: 2025,
      mes: 12,
      dia: 31,
    });
  });

  it("conoce los años bisiestos", () => {
    expect(sumarDias({ anio: 2028, mes: 2, dia: 28 }, 1)).toEqual({ anio: 2028, mes: 2, dia: 29 });
  });
});

describe("periodoDePreset", () => {
  it("«hoy» va de la medianoche de hoy a la de mañana", () => {
    const periodo = periodoDePreset("hoy", MEDIODIA_LIMA);

    expect(periodo.desde.toISOString()).toBe("2026-08-21T00:00:00.000Z");
    expect(periodo.hasta.toISOString()).toBe("2026-08-22T00:00:00.000Z");
  });

  /**
   * Half-open, so the last millisecond of the day is inside. A closed range
   * ending at 23:59:59 would drop the last second of every period, and
   * `DATETIME2` has the precision to put an event there.
   */
  it("«hoy» dura exactamente un día", () => {
    expect(diasDe(periodoDePreset("hoy", MEDIODIA_LIMA))).toBe(1);
  });

  /**
   * Whole calendar days and not a rolling 168 hours: two reloads a minute apart
   * have to return the same numbers, and "los últimos 7 días" has to include all
   * of today.
   */
  it("«7d» cubre siete días completos terminando hoy", () => {
    const periodo = periodoDePreset("7d", MEDIODIA_LIMA);

    expect(periodo.desde.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    expect(periodo.hasta.toISOString()).toBe("2026-08-22T00:00:00.000Z");
    expect(diasDe(periodo)).toBe(7);
  });

  it("«30d» cubre treinta días completos terminando hoy", () => {
    const periodo = periodoDePreset("30d", MEDIODIA_LIMA);

    expect(periodo.desde.toISOString()).toBe("2026-07-23T00:00:00.000Z");
    expect(diasDe(periodo)).toBe(30);
  });

  it("se resuelve contra la noche limeña, no contra la fecha UTC", () => {
    /* 22:00 del 21 en Lima; en UTC ya es el 22. */
    const periodo = periodoDePreset("hoy", new Date("2026-08-22T03:00:00.000Z"));

    expect(periodo.desde.toISOString()).toBe("2026-08-21T00:00:00.000Z");
  });
});

describe("periodoPersonalizado", () => {
  /** Somebody who types 01/08 to 07/08 means seven whole days, both included. */
  it("incluye el día final completo", () => {
    const periodo = periodoPersonalizado(
      { anio: 2026, mes: 8, dia: 1 },
      { anio: 2026, mes: 8, dia: 7 },
    );

    expect(periodo.desde.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(periodo.hasta.toISOString()).toBe("2026-08-08T00:00:00.000Z");
    expect(diasDe(periodo)).toBe(7);
  });

  it("un solo día es un rango de un día", () => {
    const dia = { anio: 2026, mes: 8, dia: 21 };

    expect(diasDe(periodoPersonalizado(dia, dia))).toBe(1);
  });
});

describe("periodoAnterior", () => {
  /**
   * "El periodo anterior equivalente" is the same LENGTH ending exactly where
   * this one starts. Not "the same days last month": a month-shifted range of a
   * different length compares two numbers that are not comparable.
   */
  it("son los siete días justo anteriores a los siete pedidos", () => {
    const anterior = periodoAnterior(periodoDePreset("7d", MEDIODIA_LIMA));

    expect(anterior.desde.toISOString()).toBe("2026-08-08T00:00:00.000Z");
    expect(anterior.hasta.toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  it("termina donde empieza el periodo actual, sin huecos ni solapes", () => {
    const periodo = periodoDePreset("30d", MEDIODIA_LIMA);
    const anterior = periodoAnterior(periodo);

    expect(anterior.hasta.getTime()).toBe(periodo.desde.getTime());
    expect(diasDe(anterior)).toBe(diasDe(periodo));
  });

  it("conserva la longitud de un rango personalizado cualquiera", () => {
    const periodo = periodoPersonalizado(
      { anio: 2026, mes: 3, dia: 3 },
      { anio: 2026, mes: 3, dia: 21 },
    );

    expect(diasDe(periodoAnterior(periodo))).toBe(19);
  });
});

describe("formatearDia", () => {
  it("rellena mes y día con ceros", () => {
    expect(formatearDia({ anio: 2026, mes: 3, dia: 7 })).toBe("2026-03-07");
  });
});

describe("aPeriodoDTO", () => {
  /**
   * Two calendar days and not two instants: item #19 renders dates through
   * `formatearFecha`, which converts to Lima and would draw `2026-08-21T00:00Z`
   * as the 20th at 19:00. A `YYYY-MM-DD` has nothing left to convert.
   */
  it("devuelve días de calendario, no marcas de tiempo", () => {
    expect(aPeriodoDTO(periodoDePreset("7d", MEDIODIA_LIMA))).toEqual({
      desde: "2026-08-15",
      hasta: "2026-08-21",
      dias: 7,
    });
  });

  /** `hasta` es el último día INCLUIDO, que es el que el lector nombró. */
  it("«hoy» empieza y termina el mismo día", () => {
    expect(aPeriodoDTO(periodoDePreset("hoy", MEDIODIA_LIMA))).toEqual({
      desde: "2026-08-21",
      hasta: "2026-08-21",
      dias: 1,
    });
  });

  it("describe el periodo anterior con las mismas reglas", () => {
    expect(aPeriodoDTO(periodoAnterior(periodoDePreset("7d", MEDIODIA_LIMA)))).toEqual({
      desde: "2026-08-08",
      hasta: "2026-08-14",
      dias: 7,
    });
  });
});
