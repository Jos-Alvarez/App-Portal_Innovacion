import { describe, expect, it } from "vitest";

import { TIPOS_ERROR } from "@/lib/analitica/metricas";
import { RANGOS } from "@/lib/analitica/periodos";

import {
  ETIQUETA_RANGO,
  ETIQUETA_TIPO_ERROR,
  ETIQUETA_TIPO_RECURSO,
  SIN_AREA,
  TONO_TIPO_RECURSO,
  etiquetaDeArea,
  etiquetaDePeriodo,
  formatearDia,
  formatearDiferencia,
  formatearNumero,
  formatearPorcentaje,
  hoyEnLima,
  nombreDePersona,
  nombreDeRecurso,
} from "./etiquetas";

/**
 * The screen's vocabulary. Everything item #18's engine deliberately left as a
 * storage token, given a word — and the two conversions that are easy to get
 * wrong: a calendar day that must not become an instant, and a ratio that must
 * not become a zero.
 */

describe("los vocabularios están completos", () => {
  it("nombra los cuatro periodos", () => {
    for (const rango of RANGOS) {
      expect(ETIQUETA_RANGO[rango]).toBeTruthy();
    }
  });

  it("nombra los cinco errores tipificados y ninguno más", () => {
    expect(Object.keys(ETIQUETA_TIPO_ERROR)).toHaveLength(5);

    for (const tipo of TIPOS_ERROR) {
      expect(ETIQUETA_TIPO_ERROR[tipo]).toBeTruthy();
    }
  });

  it("nombra y colorea los dos tipos de recurso", () => {
    expect(ETIQUETA_TIPO_RECURSO).toEqual({ enlace: "Enlace", procesador: "Procesador" });
    expect(TONO_TIPO_RECURSO.procesador).toBe("navy");
  });
});

describe("etiquetaDeArea", () => {
  it("nombra el balde de quienes no traen departamento", () => {
    expect(etiquetaDeArea("")).toBe(SIN_AREA);
  });

  it("deja intacta un área real", () => {
    expect(etiquetaDeArea("Operaciones")).toBe("Operaciones");
  });
});

describe("nombreDeRecurso", () => {
  it("usa el nombre del catálogo cuando la fila sigue existiendo", () => {
    expect(nombreDeRecurso({ id: 4, nombre: "Tablero de peajes" })).toBe("Tablero de peajes");
  });

  /*
   * `evento_uso` no tiene clave foránea (ADR 0002): el evento sobrevive a la fila
   * que apunta. Dos recursos borrados en un mismo ranking no pueden verse como
   * la misma fila, así que el id se conserva.
   */
  it("conserva el id cuando la fila del catálogo ya no está", () => {
    expect(nombreDeRecurso({ id: 41, nombre: null })).toBe("Recurso eliminado (#41)");
    expect(nombreDeRecurso({ id: 42, nombre: null })).not.toBe(
      nombreDeRecurso({ id: 41, nombre: null }),
    );
  });
});

describe("nombreDePersona", () => {
  it("cae al id cuando la cuenta no tiene nombre", () => {
    expect(nombreDePersona({ id: 7, nombre: null })).toBe("Persona #7");
  });
});

describe("formatearDiferencia", () => {
  it("escribe el signo de una subida", () => {
    expect(formatearDiferencia(12)).toBe("+12");
  });

  it("usa el signo menos tipográfico en una bajada", () => {
    expect(formatearDiferencia(-3)).toBe("−3");
  });

  it("no le pone signo al cero", () => {
    expect(formatearDiferencia(0)).toBe("0");
  });
});

describe("formatearPorcentaje", () => {
  it("redondea la proporción", () => {
    expect(formatearPorcentaje(3, 4)).toBe("75 %");
  });

  /*
   * Un portal sin accesos asignados no es un portal con 0 % de adopción: es un
   * portal sin nada que adoptar, y es un hallazgo distinto.
   */
  it("no divide entre cero: sin gente con acceso no hay porcentaje", () => {
    expect(formatearPorcentaje(0, 0)).toBe("—");
  });

  it("sí escribe el cero cuando hay gente con acceso y nadie usó", () => {
    expect(formatearPorcentaje(0, 14)).toBe("0 %");
  });
});

describe("formatearDia", () => {
  /*
   * La razón de existir de esta función: `new Date("2026-08-21")` es medianoche
   * UTC, y el formateador de Lima la dibujaría como el 20 a las 19:00. El día del
   * motor es un día de calendario, no un instante.
   */
  it("no interpreta el día como un instante", () => {
    expect(formatearDia("2026-08-21")).toBe("21/08/2026");
  });

  it("deja pasar cualquier cosa que no tenga la forma esperada", () => {
    expect(formatearDia("2026-08")).toBe("2026-08");
  });
});

describe("etiquetaDePeriodo", () => {
  it("escribe un solo día una sola vez", () => {
    expect(etiquetaDePeriodo({ desde: "2026-08-21", hasta: "2026-08-21" })).toBe("21/08/2026");
  });

  it("escribe los dos extremos de un rango", () => {
    expect(etiquetaDePeriodo({ desde: "2026-08-15", hasta: "2026-08-21" })).toBe(
      "15/08/2026 – 21/08/2026",
    );
  });
});

describe("hoyEnLima", () => {
  it("responde en el formato que lee un campo de fecha", () => {
    expect(hoyEnLima(new Date("2026-08-21T15:00:00.000Z"))).toBe("2026-08-21");
  });

  /*
   * 21/08/2026 a las 02:00 UTC es todavía el 20 en Lima. El techo de los campos
   * de fecha es el día del portal, no el del reloj del servidor ni el del lector.
   */
  it("usa la zona del portal y no la del proceso", () => {
    expect(hoyEnLima(new Date("2026-08-21T02:00:00.000Z"))).toBe("2026-08-20");
  });
});

describe("formatearNumero", () => {
  it("agrupa los miles para que no se lean como un año", () => {
    expect(formatearNumero(2026)).not.toBe("2026");
  });
});
