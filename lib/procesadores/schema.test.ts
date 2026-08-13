// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CLAVE_MAX,
  FORMATOS_MAX,
  INT_MAX,
  NOMBRE_MAX,
  SALIDAS_ESPERADAS,
  TAMANO_MAX_BYTES,
  actualizarProcesadorSchema,
  afectaAlContrato,
  contratoProcesadorSchema,
  crearProcesadorSchema,
  fusionarContrato,
  idProcesadorSchema,
  normalizarFormatos,
  violacionesDelContrato,
} from "@/lib/procesadores/schema";

/**
 * The validation rules of a `procesador`.
 *
 * What makes this resource different from an `enlace` is that four of its
 * columns are not independent: they declare the SHAPE of an execution
 * (ADR 0002), and a row can be field-by-field valid while describing something
 * no execution could ever satisfy — a maximum below its own minimum, a combined
 * size cap below the per-file one. Those rules get the thorough coverage below.
 * Everything the enlaces catalogue already proved — trimming, column widths,
 * unknown-key stripping — is checked once here and no more.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function procesadorValido(overrides: Record<string, unknown> = {}) {
  return {
    nombre: "Maestro de Excel",
    descripcion: "Consolida los maestros mensuales.",
    claveProcesador: "maestro-excel",
    formatosAceptados: "xlsx,csv",
    tamanoMax: 5_000_000,
    salidaEsperada: "archivo",
    ...overrides,
  };
}

describe("normalizarFormatos", () => {
  it("lowercases, trims and drops the leading dot of every extension", () => {
    expect(normalizarFormatos("xlsx, CSV, .pdf")).toEqual(["xlsx", "csv", "pdf"]);
  });

  it("drops the empty entries a trailing or doubled comma leaves behind", () => {
    expect(normalizarFormatos("xlsx,,csv,")).toEqual(["xlsx", "csv"]);
    expect(normalizarFormatos("   ")).toEqual([]);
  });
});

describe("crearProcesadorSchema — formatosAceptados", () => {
  it("stores the normalised comma-separated string the column expects", () => {
    const result = crearProcesadorSchema.safeParse(
      procesadorValido({ formatosAceptados: "xlsx, CSV, .pdf" }),
    );

    expect(result.data?.formatosAceptados).toBe("xlsx,csv,pdf");
  });

  /**
   * Duplicates are refused rather than silently collapsed: "xlsx, .xlsx" is an
   * administrator who thinks the two forms mean different things, and quietly
   * saving one of them hides the misunderstanding instead of correcting it.
   */
  it("refuses a list that repeats a format, however it was written", () => {
    const result = crearProcesadorSchema.safeParse(
      procesadorValido({ formatosAceptados: "xlsx, .XLSX" }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("formatosAceptados");
  });

  it.each([
    ["", "a processor that accepts nothing can never run"],
    ["  ,  ", "commas alone declare no format"],
    ["tar.gz", "a dot inside would never match the stored single-segment form"],
    ["xls x", "a space is not part of an extension"],
    ["*.xlsx", "a glob is not an extension"],
  ])("refuses %j — %s", (formatosAceptados) => {
    const result = crearProcesadorSchema.safeParse(procesadorValido({ formatosAceptados }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("formatosAceptados");
  });

  it("refuses a list longer than the nvarchar(400) column can hold", () => {
    const largo = Array.from({ length: 120 }, (_, i) => `f${i}`).join(",");

    expect(largo.length).toBeGreaterThan(FORMATOS_MAX);
    expect(crearProcesadorSchema.safeParse(procesadorValido({ formatosAceptados: largo })).success).toBe(
      false,
    );
  });
});

describe("crearProcesadorSchema — claveProcesador", () => {
  it.each(["maestro-excel", "limpieza-word", "consolidado2", "a"])("accepts %j", (claveProcesador) => {
    expect(crearProcesadorSchema.safeParse(procesadorValido({ claveProcesador })).success).toBe(true);
  });

  it("normalises what was typed, so the stored key is always the lookup key", () => {
    const result = crearProcesadorSchema.safeParse(
      procesadorValido({ claveProcesador: "  Maestro-Excel  " }),
    );

    expect(result.data?.claveProcesador).toBe("maestro-excel");
  });

  it.each([
    ["", "no key at all"],
    ["maestro excel", "a space breaks the URL path the portal builds from it"],
    ["maestro_excel", "one separator only, so two rows cannot differ by punctuation"],
    ["maestro/excel", "a slash would change the route it is spliced into"],
    ["maestro.excel", "a dot reads as a Python module path it is not"],
    ["-maestro", "a leading separator is not a name"],
    ["maestro-", "a trailing separator is not a name"],
    ["maestro--excel", "a doubled separator is a typo, not a distinct key"],
    ["2maestro", "a Python identifier never starts with a digit"],
    ["maestro-éxcel", "non-ASCII cannot survive a registry lookup unchanged"],
  ])("refuses %j — %s", (claveProcesador) => {
    const result = crearProcesadorSchema.safeParse(procesadorValido({ claveProcesador }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("claveProcesador");
  });

  it("refuses a key longer than the nvarchar(100) column", () => {
    expect(
      crearProcesadorSchema.safeParse(procesadorValido({ claveProcesador: "a".repeat(CLAVE_MAX + 1) }))
        .success,
    ).toBe(false);
  });
});

describe("crearProcesadorSchema — salidaEsperada", () => {
  it.each(SALIDAS_ESPERADAS)("accepts %s", (salidaEsperada) => {
    expect(crearProcesadorSchema.safeParse(procesadorValido({ salidaEsperada })).success).toBe(true);
  });

  it.each(["ARCHIVO", "excel", "", null])("refuses %j", (salidaEsperada) => {
    const result = crearProcesadorSchema.safeParse(procesadorValido({ salidaEsperada }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("salidaEsperada");
  });

  /**
   * The vocabulary lives in two places that cannot see each other: this
   * validator and the hand-written `procesador_salida_esperada_check`
   * constraint. `lib/prisma-schema.test.ts` pins the constraint to the schema's
   * `/// Enum-shaped:` comment; this pins the validator to the same comment.
   */
  it("uses exactly the vocabulary the database CHECK constraint enforces", () => {
    const schema = readFileSync(path.join(repoRoot, "prisma", "schema.prisma"), "utf8");
    const modelo = /model\s+Procesador\s*\{([\s\S]*?)^\}/m.exec(schema)?.[1] ?? "";
    const documentado = /Enum-shaped:\s*("[^"]+"(?:\s*\|\s*"[^"]+")*)/.exec(modelo)?.[1] ?? "";
    const valores = [...documentado.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

    expect(valores).toEqual([...SALIDAS_ESPERADAS]);
  });
});

describe("crearProcesadorSchema — sizes and counts", () => {
  it("refuses a per-file cap that is zero, negative or fractional", () => {
    for (const tamanoMax of [0, -1, 1.5]) {
      expect(crearProcesadorSchema.safeParse(procesadorValido({ tamanoMax })).success).toBe(false);
    }
  });

  /** The PRD's 25 MB ceiling, in bytes — the unit the API speaks throughout. */
  it("accepts the 25 MB ceiling itself and nothing above it", () => {
    expect(TAMANO_MAX_BYTES).toBe(26_214_400);
    expect(
      crearProcesadorSchema.safeParse(procesadorValido({ tamanoMax: TAMANO_MAX_BYTES })).success,
    ).toBe(true);
    expect(
      crearProcesadorSchema.safeParse(procesadorValido({ tamanoMax: TAMANO_MAX_BYTES + 1 })).success,
    ).toBe(false);
  });

  it("refuses counts below one, because an execution with no file is not one", () => {
    expect(crearProcesadorSchema.safeParse(procesadorValido({ entradasMin: 0 })).success).toBe(false);
    expect(crearProcesadorSchema.safeParse(procesadorValido({ entradasMax: 0 })).success).toBe(false);
  });

  it("refuses a size past what the INT column holds", () => {
    expect(
      crearProcesadorSchema.safeParse(procesadorValido({ tamanoMaxTotal: INT_MAX + 1 })).success,
    ).toBe(false);
  });
});

describe("violacionesDelContrato", () => {
  const base = { entradasMin: 1, entradasMax: null, tamanoMax: 1_000, tamanoMaxTotal: null };

  it("accepts the uncapped shape ADR 0002 describes as min = 1, max = NULL", () => {
    expect(violacionesDelContrato(base)).toEqual([]);
  });

  it("accepts the single-file shape ADR 0002 describes as min = max = 1", () => {
    expect(violacionesDelContrato({ ...base, entradasMin: 1, entradasMax: 1 })).toEqual([]);
  });

  it("accepts a maximum above the minimum", () => {
    expect(violacionesDelContrato({ ...base, entradasMin: 2, entradasMax: 10 })).toEqual([]);
  });

  it("refuses a maximum below the minimum, and blames the maximum", () => {
    const violaciones = violacionesDelContrato({ ...base, entradasMin: 5, entradasMax: 3 });

    expect(violaciones).toHaveLength(1);
    expect(violaciones[0].campo).toBe("entradasMax");
  });

  it("leaves an uncapped maximum alone however high the minimum is", () => {
    expect(violacionesDelContrato({ ...base, entradasMin: 99, entradasMax: null })).toEqual([]);
  });

  it("accepts a combined cap equal to or above the per-file cap", () => {
    expect(violacionesDelContrato({ ...base, tamanoMax: 1_000, tamanoMaxTotal: 1_000 })).toEqual([]);
    expect(violacionesDelContrato({ ...base, tamanoMax: 1_000, tamanoMaxTotal: 8_000 })).toEqual([]);
  });

  /**
   * `tamano_max` bounds each file and `tamano_max_total` bounds the set
   * (ADR 0002). A set cap under the per-file cap makes the per-file cap
   * unreachable: no file that the row says is acceptable could ever be sent.
   */
  it("refuses a combined cap below the per-file cap, and blames the combined cap", () => {
    const violaciones = violacionesDelContrato({ ...base, tamanoMax: 8_000, tamanoMaxTotal: 1_000 });

    expect(violaciones).toHaveLength(1);
    expect(violaciones[0].campo).toBe("tamanoMaxTotal");
  });

  it("leaves an uncapped total alone, which ADR 0002 reads as no cap of its own", () => {
    expect(violacionesDelContrato({ ...base, tamanoMax: INT_MAX, tamanoMaxTotal: null })).toEqual([]);
  });

  /**
   * Each violation is attributed to the field that owns it, so the form of part
   * 2 can highlight one input rather than shrugging at the whole row.
   */
  it("reports both rules independently when both are broken", () => {
    const violaciones = violacionesDelContrato({
      entradasMin: 5,
      entradasMax: 3,
      tamanoMax: 8_000,
      tamanoMaxTotal: 1_000,
    });

    expect(violaciones.map((v) => v.campo)).toEqual(["entradasMax", "tamanoMaxTotal"]);
  });
});

/**
 * The rules themselves are covered above; what is checked here is the wiring —
 * `.superRefine` and not `.refine`, so the issue lands on the field the form
 * has to highlight rather than on the body as a whole.
 */
describe("crearProcesadorSchema — the contract rules reach the owning field", () => {
  it.each([
    [{ entradasMin: 5, entradasMax: 3 }, "entradasMax"],
    [{ tamanoMax: 8_000, tamanoMaxTotal: 1_000 }, "tamanoMaxTotal"],
  ])("blames %j on %s", (overrides, campo) => {
    const result = crearProcesadorSchema.safeParse(procesadorValido(overrides));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([campo]);
    expect(result.error?.issues[0].code).toBe("custom");
  });
});

describe("crearProcesadorSchema — what the caller may and may not set", () => {
  /** ADR 0002: `entradas_min` defaults to 1, and both caps default to absent. */
  it("fills in the defaults ADR 0002 states, so the row is complete without them", () => {
    const result = crearProcesadorSchema.safeParse(procesadorValido());

    expect(result.data).toMatchObject({ entradasMin: 1, entradasMax: null, tamanoMaxTotal: null });
  });

  it("drops activo and id instead of letting the caller preset them", () => {
    const result = crearProcesadorSchema.safeParse(procesadorValido({ activo: false, id: 99 }));

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("activo");
    expect(result.data).not.toHaveProperty("id");
  });

  it("trims the name and turns a blank description into the null the column stores", () => {
    const result = crearProcesadorSchema.safeParse(
      procesadorValido({ nombre: "  Maestro  ", descripcion: "   " }),
    );

    expect(result.data?.nombre).toBe("Maestro");
    expect(result.data?.descripcion).toBeNull();
  });

  it("refuses a name longer than the nvarchar(150) column", () => {
    expect(
      crearProcesadorSchema.safeParse(procesadorValido({ nombre: "a".repeat(NOMBRE_MAX + 1) })).success,
    ).toBe(false);
  });
});

describe("idProcesadorSchema", () => {
  it("turns the path segment into the number Prisma keys the row on", () => {
    expect(idProcesadorSchema.safeParse("7").data).toBe(7);
  });

  it.each(["abc", "", "1.5", "-3", "0", " 7", "7; DROP TABLE procesador", String(INT_MAX + 1)])(
    "refuses %j",
    (raw) => {
      expect(idProcesadorSchema.safeParse(raw).success).toBe(false);
    },
  );
});

describe("actualizarProcesadorSchema", () => {
  it("accepts a single field, since an edit need not resend the whole row", () => {
    expect(actualizarProcesadorSchema.safeParse({ nombre: "Otro" }).data).toEqual({ nombre: "Otro" });
  });

  it("rejects an update that carries no change at all", () => {
    const result = actualizarProcesadorSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([]);
  });

  it("applies the very same field rules the creation does", () => {
    expect(actualizarProcesadorSchema.safeParse({ claveProcesador: "mal_clave" }).success).toBe(false);
    expect(actualizarProcesadorSchema.safeParse({ formatosAceptados: "xlsx,xlsx" }).success).toBe(false);
    expect(actualizarProcesadorSchema.safeParse({ salidaEsperada: "excel" }).success).toBe(false);
    expect(actualizarProcesadorSchema.safeParse({ tamanoMax: 0 }).success).toBe(false);
  });

  it("normalises what it does receive", () => {
    expect(
      actualizarProcesadorSchema.safeParse({
        claveProcesador: " Limpieza-Word ",
        formatosAceptados: ".DOCX, DOC ",
      }).data,
    ).toEqual({ claveProcesador: "limpieza-word", formatosAceptados: "docx,doc" });
  });

  it("lets an administrator undo a baja by setting activo back to true", () => {
    expect(actualizarProcesadorSchema.safeParse({ activo: true }).data).toEqual({ activo: true });
  });

  /**
   * THE RULE THIS RESOURCE EXISTS TO PROVE. A fragment carrying one half of a
   * cross-field pair is valid on its own — it is the MERGED row that has to be
   * coherent — so the update schema must not reject it. `entradas_min: 5` alone
   * is a perfectly good edit for a row whose maximum is 10.
   */
  it("accepts one half of a cross-field pair, because the fragment is not the row", () => {
    expect(actualizarProcesadorSchema.safeParse({ entradasMin: 5 }).success).toBe(true);
    expect(actualizarProcesadorSchema.safeParse({ entradasMax: 3 }).success).toBe(true);
    expect(actualizarProcesadorSchema.safeParse({ tamanoMaxTotal: 1 }).success).toBe(true);
  });
});

describe("afectaAlContrato", () => {
  it("recognises an edit that moves any of the four contract columns", () => {
    expect(afectaAlContrato({ entradasMin: 2 })).toBe(true);
    expect(afectaAlContrato({ entradasMax: null })).toBe(true);
    expect(afectaAlContrato({ tamanoMax: 10 })).toBe(true);
    expect(afectaAlContrato({ tamanoMaxTotal: null })).toBe(true);
  });

  /**
   * A row that is already stored was already validated as a whole, so an edit
   * that touches none of the four cannot make it incoherent — and the extra
   * read it would cost is one the request does not need.
   */
  it("recognises an edit that cannot possibly disturb it", () => {
    expect(afectaAlContrato({ nombre: "Otro", salidaEsperada: "zip", activo: false })).toBe(false);
  });
});

describe("fusionarContrato", () => {
  const actual = { entradasMin: 1, entradasMax: 10, tamanoMax: 1_000, tamanoMaxTotal: 9_000 };

  it("keeps every column the edit did not mention", () => {
    expect(fusionarContrato(actual, { entradasMin: 3 })).toEqual({ ...actual, entradasMin: 3 });
  });

  it("honours an explicit null as the removal of a cap, not as an absent field", () => {
    expect(fusionarContrato(actual, { entradasMax: null })).toEqual({ ...actual, entradasMax: null });
  });

  /**
   * The whole point of merging. Each of these two edits is valid alone and the
   * row they produce together is not; validating the fragment would let the
   * second one through and leave the catalogue describing an impossible
   * execution.
   */
  it("exposes the incoherence a fragment on its own would hide", () => {
    const fusionado = fusionarContrato({ ...actual, entradasMin: 5 }, { entradasMax: 3 });

    expect(contratoProcesadorSchema.safeParse(fusionado).success).toBe(false);
    expect(violacionesDelContrato(fusionado).map((v) => v.campo)).toEqual(["entradasMax"]);
  });

  it("accepts the merge that repairs the row in the same request", () => {
    const fusionado = fusionarContrato({ ...actual, entradasMin: 5 }, { entradasMin: 1, entradasMax: 3 });

    expect(contratoProcesadorSchema.safeParse(fusionado).success).toBe(true);
  });
});
