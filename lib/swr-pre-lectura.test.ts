import { describe, expect, it } from "vitest";

import { OPCIONES_MIS_RECURSOS } from "@/app/(portal)/mis-recursos-client";
import { OPCIONES_SUGERENCIAS } from "@/app/(portal)/sugerencias/sugerencias-client";
import { opcionesDe } from "@/app/admin/analitica/analitica-client";
import { OPCIONES_TODAS } from "@/app/admin/sugerencias/sugerencias-client";

import { SIN_REVALIDACION_AL_MONTAR } from "./swr-pre-lectura";

/**
 * The setting itself, and the roll call of the screens that opt into it.
 *
 * The roll call is the point. Four screens share the "server pre-read plus
 * `fallbackData`" shape, and the redundant fetch it causes was invisible on
 * three of them for as long as nothing asserted it — the fourth only made it
 * obvious because its read costs three `GROUP BY`s. A fifth screen built on the
 * same shape and left out of this list is the regression this file exists to
 * make loud.
 */

describe("SIN_REVALIDACION_AL_MONTAR", () => {
  it("apaga la revalidación al montar y no toca nada más", () => {
    expect(SIN_REVALIDACION_AL_MONTAR).toEqual({ revalidateOnMount: false });
  });

  /*
   * `false` y no `undefined`: `undefined` es justamente el valor por defecto que
   * hace que SWR caiga en `revalidateIfStale` y consulte igual.
   */
  it("es `false` explícito, que es lo único que SWR lee como «no consultes»", () => {
    expect(SIN_REVALIDACION_AL_MONTAR.revalidateOnMount).toBe(false);
  });
});

describe("las cuatro pantallas con pre-lectura del servidor lo adoptan", () => {
  const HOY = "2026-08-21";

  it("el tablero del colaborador", () => {
    expect(OPCIONES_MIS_RECURSOS.revalidateOnMount).toBe(false);
  });

  it("el buzón del colaborador", () => {
    expect(OPCIONES_SUGERENCIAS.revalidateOnMount).toBe(false);
  });

  it("la bandeja del administrador", () => {
    expect(OPCIONES_TODAS.revalidateOnMount).toBe(false);
  });

  it("la analítica, en cualquier periodo", () => {
    const consulta = { rango: "hoy" as const, desde: "", hasta: "", comparar: false };
    const cerrado = {
      rango: "personalizado" as const,
      desde: "2026-07-01",
      hasta: "2026-07-31",
      comparar: true,
    };

    expect(opcionesDe(consulta, HOY).revalidateOnMount).toBe(false);
    expect(opcionesDe(cerrado, HOY).revalidateOnMount).toBe(false);
  });

  /*
   * Lo que NO cambió. El intervalo y el foco son la política del ADR 0007 y
   * siguen siendo la garantía de frescura: apagar la consulta del montaje sin
   * ellos dejaría pantallas que no se actualizan nunca.
   */
  it("deja intactos los dos relojes del ADR 0007", () => {
    for (const opciones of [OPCIONES_MIS_RECURSOS, OPCIONES_SUGERENCIAS, OPCIONES_TODAS]) {
      expect(opciones.refreshInterval).toBe(60_000);
      expect(opciones.revalidateOnFocus).toBe(true);
    }

    const analitica = opcionesDe(
      { rango: "hoy", desde: "", hasta: "", comparar: false },
      HOY,
    );

    expect(analitica.refreshInterval).toBe(60_000);
    expect(analitica.revalidateOnFocus).toBe(true);
  });
});
