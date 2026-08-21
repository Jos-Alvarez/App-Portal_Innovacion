// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  AREA_DESTINO_MAX,
  cambiarEstadoSchema,
  crearSugerenciaSchema,
  DESCRIPCION_MAX,
  ESTADO_INICIAL,
  ESTADOS_SUGERENCIA,
  idSugerenciaSchema,
  TITULO_MAX,
} from "./schema";

/**
 * The one definition of a valid suggestion, checked from both sides: what it
 * accepts, what it refuses, and — most importantly — what it silently DROPS.
 */

const VALIDA = {
  titulo: "Tablero de peajes en tiempo real",
  descripcion: "Un tablero que muestre el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
};

describe("el vocabulario de estados", () => {
  /**
   * The list is not decorative: `sugerencia_estado_check`, written by
   * `20260813040410_init_esquema_portal`, refuses anything outside it. A member
   * added here without a migration produces a row SQL Server rejects at runtime.
   */
  it("es exactamente el del CHECK de la base", () => {
    expect(ESTADOS_SUGERENCIA).toEqual([
      "pendiente",
      "en_revision",
      "aprobada",
      "rechazada",
      "implementada",
    ]);
  });

  it("empieza el embudo en «pendiente», como pide el ítem #13", () => {
    expect(ESTADO_INICIAL).toBe("pendiente");
    expect(ESTADOS_SUGERENCIA).toContain(ESTADO_INICIAL);
  });
});

describe("crearSugerenciaSchema", () => {
  it("acepta una sugerencia completa", () => {
    const resultado = crearSugerenciaSchema.safeParse(VALIDA);

    expect(resultado.success).toBe(true);
  });

  it("recorta los espacios de los tres campos", () => {
    const resultado = crearSugerenciaSchema.parse({
      titulo: "  Tablero  ",
      descripcion: "  Una idea  ",
      areaDestino: "  Operaciones  ",
    });

    expect(resultado).toEqual({
      titulo: "Tablero",
      descripcion: "Una idea",
      areaDestino: "Operaciones",
    });
  });

  it.each(["titulo", "descripcion", "areaDestino"] as const)(
    "rechaza «%s» vacío o con solo espacios",
    (campo) => {
      expect(crearSugerenciaSchema.safeParse({ ...VALIDA, [campo]: "" }).success).toBe(false);
      expect(crearSugerenciaSchema.safeParse({ ...VALIDA, [campo]: "   " }).success).toBe(false);
    },
  );

  it.each(["titulo", "descripcion", "areaDestino"] as const)("rechaza «%s» ausente", (campo) => {
    const cuerpo: Record<string, unknown> = { ...VALIDA };
    delete cuerpo[campo];

    expect(crearSugerenciaSchema.safeParse(cuerpo).success).toBe(false);
  });

  /**
   * The description is REQUIRED, unlike an enlace's. A title with no body is a
   * subject line: the Área de Innovación would have to go back and ask what it
   * meant, which is the conversation this box exists to avoid.
   */
  it("no admite una sugerencia que sea solo un título", () => {
    expect(
      crearSugerenciaSchema.safeParse({ titulo: "Una idea", descripcion: "", areaDestino: "TI" })
        .success,
    ).toBe(false);
  });

  it.each([
    ["titulo", TITULO_MAX],
    ["descripcion", DESCRIPCION_MAX],
    ["areaDestino", AREA_DESTINO_MAX],
  ] as const)("acepta «%s» en su tope y rechaza un carácter más", (campo, tope) => {
    expect(crearSugerenciaSchema.safeParse({ ...VALIDA, [campo]: "a".repeat(tope) }).success).toBe(
      true,
    );
    expect(
      crearSugerenciaSchema.safeParse({ ...VALIDA, [campo]: "a".repeat(tope + 1) }).success,
    ).toBe(false);
  });

  /**
   * The widths are the columns'. `titulo NVARCHAR(200)` and `area_destino
   * NVARCHAR(120)` — validating them here turns a SQL Server truncation error
   * nobody can act on into a Spanish 400 that names the field.
   *
   * `descripcion` is the exception and the constant is deliberately NOT the
   * column's: the column is `NVARCHAR(MAX)`, so the limit is a product decision
   * about how long an idea may be, not a storage one.
   */
  it("mide título y área contra el ancho real de sus columnas", () => {
    expect(TITULO_MAX).toBe(200);
    expect(AREA_DESTINO_MAX).toBe(120);
  });

  it("acota la descripción aunque la columna sea NVARCHAR(MAX)", () => {
    expect(DESCRIPCION_MAX).toBeGreaterThan(0);
    expect(Number.isFinite(DESCRIPCION_MAX)).toBe(true);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  THE KEYS THAT ARE NOT DECLARED ARE THE SECURITY PROPERTY
   * ══════════════════════════════════════════════════════════════════════════
   *
   * The route writes the PARSED output, never the raw body. So a client that
   * posts `autorId`, `estado`, `grupoId` or `id` gets a working request whose
   * extra fields never reach Prisma — which is what makes "send a suggestion in
   * someone else's name" and "send one that arrives already approved" things
   * this endpoint cannot be talked into.
   */
  it("descarta autorId, estado, grupoId e id si alguien los manda", () => {
    const resultado = crearSugerenciaSchema.parse({
      ...VALIDA,
      id: 99,
      autorId: 1,
      estado: "aprobada",
      grupoId: 7,
      fechaCreacion: "2020-01-01T00:00:00.000Z",
    });

    expect(resultado).toEqual(VALIDA);
    expect(Object.keys(resultado).sort()).toEqual(["areaDestino", "descripcion", "titulo"]);
  });

  it("rechaza un cuerpo que no es un objeto", () => {
    expect(crearSugerenciaSchema.safeParse(undefined).success).toBe(false);
    expect(crearSugerenciaSchema.safeParse("una idea").success).toBe(false);
    expect(crearSugerenciaSchema.safeParse([VALIDA]).success).toBe(false);
  });

  it("rechaza campos que no son texto en vez de convertirlos", () => {
    expect(crearSugerenciaSchema.safeParse({ ...VALIDA, titulo: 42 }).success).toBe(false);
    expect(crearSugerenciaSchema.safeParse({ ...VALIDA, descripcion: null }).success).toBe(false);
  });

  /** The issue's path is what `errorDeValidacion` keys its Spanish message on. */
  it("señala el campo culpable en el path del primer issue", () => {
    const resultado = crearSugerenciaSchema.safeParse({ ...VALIDA, areaDestino: "" });

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.path).toEqual(["areaDestino"]);
  });
});

/**
 * El identificador de la ruta — item #15 addresses one suggestion by id.
 *
 * What matters here is what is refused BEFORE any conversion: a value that is
 * not digits must never reach Prisma as a `NaN`.
 */
describe("idSugerenciaSchema", () => {
  it("acepta un id decimal y lo entrega como número", () => {
    const resultado = idSugerenciaSchema.safeParse("31");

    expect(resultado.success).toBe(true);
    expect(resultado.data).toBe(31);
  });

  it.each(["", " ", "abc", "12abc", " 12", "12 ", "1.5", "-3", "0x1f", "1e3"])(
    "rechaza %o antes de convertirlo",
    (crudo) => {
      expect(idSugerenciaSchema.safeParse(crudo).success).toBe(false);
    },
  );

  /** Cero no es un id: la columna es IDENTITY y arranca en 1. */
  it("rechaza el cero", () => {
    expect(idSugerenciaSchema.safeParse("0").success).toBe(false);
  });

  it("acepta el mayor INT de SQL Server y rechaza el siguiente", () => {
    expect(idSugerenciaSchema.safeParse("2147483647").success).toBe(true);
    expect(idSugerenciaSchema.safeParse("2147483648").success).toBe(false);
  });

  /**
   * The static `/todas` route sits beside this dynamic one. Next resolves the
   * literal path first, but if that ever changed, the schema is the second line
   * of defence and it refuses the word outright.
   */
  it("rechaza «todas», que es la ruta hermana y no un id", () => {
    expect(idSugerenciaSchema.safeParse("todas").success).toBe(false);
  });
});

/**
 * El cuerpo del cambio de estado.
 *
 * The whole endpoint is one field, so these tests are mostly about what the
 * schema DROPS: the words a collaborator wrote, and the identity of whoever
 * signs the asiento.
 */
describe("cambiarEstadoSchema", () => {
  it.each(ESTADOS_SUGERENCIA)("acepta el estado %s", (estado) => {
    const resultado = cambiarEstadoSchema.safeParse({ estado });

    expect(resultado.success).toBe(true);
    expect(resultado.data).toEqual({ estado });
  });

  it("acepta exactamente el vocabulario del CHECK de la base, ni uno más", () => {
    /* `archivada` suena razonable y no existe: la restricción
       `sugerencia_estado_check` sólo enumera cinco valores. */
    for (const invalido of ["archivada", "PENDIENTE", "en revision", "en-revision", ""]) {
      expect(cambiarEstadoSchema.safeParse({ estado: invalido }).success).toBe(false);
    }
  });

  it.each([undefined, null, 42, [], "pendiente"])("rechaza el cuerpo %o", (cuerpo) => {
    expect(cambiarEstadoSchema.safeParse(cuerpo).success).toBe(false);
  });

  it("rechaza un cuerpo sin estado", () => {
    expect(cambiarEstadoSchema.safeParse({}).success).toBe(false);
  });

  /**
   * LO QUE ESTE ENDPOINT NO PUEDE REESCRIBIR.
   *
   * The title, the description and the destination area are what a collaborator
   * WROTE. They are dropped rather than refused — zod strips unknown keys — and
   * the repository writes the parsed output, so there is no path by which a
   * request to this route edits somebody's words.
   */
  it("descarta el título, la descripción y el área que traiga el cuerpo", () => {
    const resultado = cambiarEstadoSchema.safeParse({
      estado: "aprobada",
      titulo: "Otro título",
      descripcion: "Otro texto",
      areaDestino: "Otra área",
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data).toEqual({ estado: "aprobada" });
  });

  /** Quién firma el asiento sale de la sesión, nunca del cuerpo. */
  it("descarta cambiadoPor, autorId, id y grupoId", () => {
    const resultado = cambiarEstadoSchema.safeParse({
      estado: "rechazada",
      cambiadoPor: 1,
      autorId: 1,
      id: 99,
      grupoId: 4,
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data).toEqual({ estado: "rechazada" });
  });

  /** El embudo no se valida acá: el repositorio explica por qué no se valida en ningún lado. */
  it("acepta una transición hacia atrás, porque el orden del embudo no es una regla", () => {
    expect(cambiarEstadoSchema.safeParse({ estado: "pendiente" }).success).toBe(true);
  });
});
