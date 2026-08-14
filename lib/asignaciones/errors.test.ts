// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ERROR_INTERNO,
  errorDePrisma,
  esFilaAusente,
  esFilaYaExistente,
  identificadorDeRecursoInvalido,
  identificadorDeUsuarioInvalido,
  recursoDadoDeBaja,
  recursoNoEncontrado,
  usuarioDadoDeBaja,
  usuarioNoEncontrado,
} from "@/lib/asignaciones/errors";

/**
 * Turning a failed assignment into the one envelope of ADR 0003.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE THING THIS FILE EXISTS TO PROTECT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `lib/enlaces/errors.ts` and `lib/procesadores/errors.ts` both map P2002 to a
 * 409 and P2025 to a 404. For an assignment those two mappings are WRONG, and
 * wrong in the most user-visible way there is: P2002 means the grant the
 * administrator asked for already exists, and P2025 means the grant they asked
 * to remove is already gone. Both are the requested state, reached. The tests
 * below fail loudly if anyone ever copies the sibling mapping over.
 */

/** No English, no SQL, no library names — the text a person actually reads. */
function esMensajeParaPersonas(mensaje: string): void {
  expect(mensaje.length).toBeGreaterThan(10);
  expect(mensaje).not.toMatch(/prisma|sql|constraint|invalid|expected|error code|P\d{4}/i);
  expect(mensaje).toMatch(/^[¿¡A-ZÁÉÍÓÚÑ].*[.!?]$/s);
}

const TIPOS = ["enlace", "procesador"] as const;

describe("the identifiers in the path", () => {
  it("answers 400 for an unusable usuario id, not a database error", () => {
    expect(identificadorDeUsuarioInvalido().status).toBe(400);
  });

  it.each(TIPOS)("answers 400 for an unusable %s id", (tipo) => {
    expect(identificadorDeRecursoInvalido(tipo).status).toBe(400);
  });

  it("names the two identifiers apart, so the administrator knows which one to fix", () => {
    expect(identificadorDeUsuarioInvalido().error.codigo).not.toBe(
      identificadorDeRecursoInvalido("enlace").error.codigo,
    );
  });

  it("names the two resource types apart", () => {
    expect(identificadorDeRecursoInvalido("enlace").error.codigo).not.toBe(
      identificadorDeRecursoInvalido("procesador").error.codigo,
    );
  });
});

describe("something the request refers to is not there", () => {
  it("answers 404 for a usuario that does not exist", () => {
    expect(usuarioNoEncontrado().status).toBe(404);
  });

  it.each(TIPOS)("answers 404 for a %s that does not exist", (tipo) => {
    expect(recursoNoEncontrado(tipo).status).toBe(404);
  });

  it.each(TIPOS)("says %s in the message, not a generic 'recurso'", (tipo) => {
    expect(recursoNoEncontrado(tipo).error.mensaje.toLowerCase()).toContain(tipo);
  });
});

describe("the grant is refused because of a baja", () => {
  /**
   * 409 and not 400: the request is perfectly well formed and both rows exist.
   * What forbids it is the STATE they are in, which is what 409 is for, and
   * which the administrator resolves by reactivating rather than by retyping.
   */
  it("answers 409 for a resource that is dado de baja", () => {
    expect(recursoDadoDeBaja("enlace").status).toBe(409);
  });

  it("answers 409 for a usuario that is dado de baja", () => {
    expect(usuarioDadoDeBaja().status).toBe(409);
  });

  /** "reactívalo" / "Reactívala" — the accent is part of the word, so match it. */
  const REACTIVAR = /react[ií]va/;

  it.each(TIPOS)("tells the administrator how to unblock a %s", (tipo) => {
    expect(recursoDadoDeBaja(tipo).error.mensaje.toLowerCase()).toMatch(REACTIVAR);
  });

  it("tells the administrator how to unblock a usuario", () => {
    expect(usuarioDadoDeBaja().error.mensaje.toLowerCase()).toMatch(REACTIVAR);
  });
});

describe("errorDePrisma — DELIBERATELY NOT the mapping of enlaces and procesadores", () => {
  /**
   * The regression this whole module is shaped around. A duplicate key on an
   * assignment table is not a conflict to report: it is the grant already
   * being in place, which is what the caller asked for. Any status at all here
   * means someone reintroduced the sibling resources' mapping.
   */
  it("never turns a duplicate row into a 409, the way enlaces and procesadores do", () => {
    expect(errorDePrisma({ code: "P2002" }, "enlace").status).not.toBe(409);
  });

  it("never turns a missing row into a 404, the way enlaces and procesadores do", () => {
    expect(errorDePrisma({ code: "P2025" }, "enlace").status).not.toBe(404);
  });

  /**
   * They reach `errorDePrisma` as 500s only because the repository is supposed
   * to have swallowed them as successes long before. Arriving here at all means
   * the idempotency handling was removed, and a 500 is the honest answer to a
   * write nobody understood.
   */
  it.each(["P2002", "P2025"])("treats a stray %s as unrecognised, since it should never arrive", (code) => {
    expect(errorDePrisma({ code }, "enlace")).toEqual(ERROR_INTERNO);
  });

  it.each(TIPOS)("answers 404 when a referenced row vanished mid-write, for a %s", (tipo) => {
    expect(errorDePrisma({ code: "P2003" }, tipo).status).toBe(404);
  });

  it("answers 500 for anything it does not recognise", () => {
    expect(errorDePrisma({ code: "P2010" }, "enlace")).toEqual(ERROR_INTERNO);
  });

  it("survives an error that is not an object at all", () => {
    expect(errorDePrisma("boom", "enlace")).toEqual(ERROR_INTERNO);
    expect(errorDePrisma(null, "procesador")).toEqual(ERROR_INTERNO);
  });
});

describe("the two predicates the repository decides idempotency with", () => {
  it("recognises the duplicate row that means 'already granted'", () => {
    expect(esFilaYaExistente({ code: "P2002" })).toBe(true);
    expect(esFilaYaExistente({ code: "P2025" })).toBe(false);
  });

  it("recognises the missing row that means 'already revoked'", () => {
    expect(esFilaAusente({ code: "P2025" })).toBe(true);
    expect(esFilaAusente({ code: "P2002" })).toBe(false);
  });

  it.each([["a string", "P2002"], ["null", null], ["a numeric code", { code: 2002 }]])(
    "says no to %s rather than guessing",
    (_caso, error) => {
      expect(esFilaYaExistente(error)).toBe(false);
      expect(esFilaAusente(error)).toBe(false);
    },
  );
});

describe("every message a person can receive", () => {
  it.each([
    ["identificadorDeUsuarioInvalido", identificadorDeUsuarioInvalido()],
    ["identificadorDeRecursoInvalido/enlace", identificadorDeRecursoInvalido("enlace")],
    ["identificadorDeRecursoInvalido/procesador", identificadorDeRecursoInvalido("procesador")],
    ["usuarioNoEncontrado", usuarioNoEncontrado()],
    ["recursoNoEncontrado/enlace", recursoNoEncontrado("enlace")],
    ["recursoNoEncontrado/procesador", recursoNoEncontrado("procesador")],
    ["usuarioDadoDeBaja", usuarioDadoDeBaja()],
    ["recursoDadoDeBaja/enlace", recursoDadoDeBaja("enlace")],
    ["recursoDadoDeBaja/procesador", recursoDadoDeBaja("procesador")],
    ["ERROR_INTERNO", ERROR_INTERNO],
    ["errorDePrisma/P2003", errorDePrisma({ code: "P2003" }, "enlace")],
  ])("reads as plain Spanish: %s", (_nombre, fallo) => {
    esMensajeParaPersonas(fallo.error.mensaje);
    expect(fallo.error.codigo).toMatch(/^[a-z_]+$/);
  });
});
