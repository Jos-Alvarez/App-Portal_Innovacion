// @vitest-environment node
import { describe, expect, it } from "vitest";

import { actualizarEnlaceSchema, crearEnlaceSchema } from "@/lib/enlaces/schema";
import {
  ERROR_INTERNO,
  enlaceNoEncontrado,
  errorDePrisma,
  errorDeValidacion,
  identificadorInvalido,
} from "@/lib/enlaces/errors";

/**
 * Turning a failure into the one envelope of ADR 0003.
 *
 * Two properties are worth more than the rest here. First, every `mensaje` is
 * Spanish a collaborator can act on, because DESIGN.md says the reader never
 * sees a technical code. Second, nothing a database throws is ever repeated
 * back to the browser: a SQL Server error number or a constraint name in a
 * toast tells an attacker about the schema and tells the administrator
 * nothing.
 */

/**
 * No English, no SQL, no library names — the text a person actually reads.
 *
 * Bare numbers are NOT banned here: a message that says "hasta 150 caracteres"
 * is telling the administrator the rule, which is the opposite of leaking an
 * error number. The tests that care about `547` and about a port name them
 * explicitly instead.
 */
function esMensajeParaPersonas(mensaje: string): void {
  expect(mensaje.length).toBeGreaterThan(10);
  expect(mensaje).not.toMatch(/prisma|sql|constraint|invalid|expected|error code|P\d{4}/i);
  /* Spanish sentences in this product end in a full stop and start capitalised. */
  expect(mensaje).toMatch(/^[¿¡A-ZÁÉÍÓÚÑ].*[.!?]$/s);
}

function fallaDeCreacion(body: unknown) {
  const result = crearEnlaceSchema.safeParse(body);
  if (result.success) throw new Error("expected the body to be rejected");
  return errorDeValidacion(result.error);
}

const VALIDO = {
  nombre: "Portal de facturación",
  url: "https://facturacion.ejemplo.com",
  tipo: "app",
};

describe("errorDeValidacion", () => {
  it("answers 400, since the caller can fix the body and retry", () => {
    expect(fallaDeCreacion({ ...VALIDO, tipo: "otro" }).status).toBe(400);
  });

  it.each([
    ["nombre", { ...VALIDO, nombre: "" }, "nombre_invalido"],
    ["descripcion", { ...VALIDO, descripcion: "a".repeat(1001) }, "descripcion_invalida"],
    ["url", { ...VALIDO, url: "javascript:alert(1)" }, "url_invalida"],
    ["tipo", { ...VALIDO, tipo: "otro" }, "tipo_invalido"],
  ])("names the offending field: %s", (_field, body, codigo) => {
    expect(fallaDeCreacion(body).error.codigo).toBe(codigo);
  });

  it("writes every field's message in plain Spanish", () => {
    for (const body of [
      { ...VALIDO, nombre: "" },
      { ...VALIDO, descripcion: "a".repeat(1001) },
      { ...VALIDO, url: "javascript:alert(1)" },
      { ...VALIDO, tipo: "otro" },
    ]) {
      esMensajeParaPersonas(fallaDeCreacion(body).error.mensaje);
    }

    /* `activo` exists only on the update — a creation strips it. */
    const activo = actualizarEnlaceSchema.safeParse({ activo: "true" });
    if (activo.success) throw new Error("expected a non-boolean activo to be rejected");

    const failure = errorDeValidacion(activo.error);
    expect(failure.error.codigo).toBe("activo_invalido");
    esMensajeParaPersonas(failure.error.mensaje);
  });

  /**
   * The URL message has to teach the rule, because "dirección no válida" in
   * front of a URL the administrator can see is fine leaves them with nothing
   * to change. It names the two schemes that are accepted.
   */
  it("tells the administrator which URLs are accepted at all", () => {
    const mensaje = fallaDeCreacion({ ...VALIDO, url: "javascript:alert(1)" }).error.mensaje;

    expect(mensaje).toMatch(/https?:\/\//);
  });

  it("never repeats zod's own English wording", () => {
    const mensaje = fallaDeCreacion({ ...VALIDO, tipo: "otro" }).error.mensaje;

    expect(mensaje).not.toMatch(/invalid|option|expected|received|string/i);
  });

  it("reports the first offending field when several are wrong at once", () => {
    const failure = fallaDeCreacion({ nombre: "", url: "javascript:alert(1)", tipo: "otro" });

    /* One error at a time: the form highlights a field, not a list of five. */
    expect(failure.error.codigo).toBe("nombre_invalido");
  });

  it("has its own code for an update that carries no change", () => {
    const result = actualizarEnlaceSchema.safeParse({});
    if (result.success) throw new Error("expected an empty update to be rejected");

    const failure = errorDeValidacion(result.error);

    expect(failure.status).toBe(400);
    expect(failure.error.codigo).toBe("sin_cambios");
    esMensajeParaPersonas(failure.error.mensaje);
  });

  it("falls back to a whole-body message when the body is not an object", () => {
    const failure = fallaDeCreacion("no soy un objeto");

    expect(failure.status).toBe(400);
    expect(failure.error.codigo).toBe("datos_invalidos");
    esMensajeParaPersonas(failure.error.mensaje);
  });
});

describe("identificadorInvalido", () => {
  it("answers 400 in plain Spanish when the path segment is not a number", () => {
    const failure = identificadorInvalido();

    expect(failure.status).toBe(400);
    expect(failure.error.codigo).toBe("id_invalido");
    esMensajeParaPersonas(failure.error.mensaje);
  });
});

describe("enlaceNoEncontrado", () => {
  it("answers 404 and explains it in a way an administrator can act on", () => {
    const failure = enlaceNoEncontrado();

    expect(failure.status).toBe(404);
    expect(failure.error.codigo).toBe("enlace_no_encontrado");
    esMensajeParaPersonas(failure.error.mensaje);
  });
});

describe("errorDePrisma", () => {
  /**
   * `enlace.nombre` is unique because the name is how a collaborator tells two
   * entries apart in the dashboard — two rows called "Facturación" are
   * indistinguishable there. A second one must therefore come back as a
   * conflict the administrator understands, not as a database failure.
   */
  it("turns a unique-constraint violation into a 409 about the name", () => {
    const failure = errorDePrisma({ code: "P2002", meta: { target: ["nombre"] } });

    expect(failure.status).toBe(409);
    expect(failure.error.codigo).toBe("nombre_duplicado");
    expect(failure.error.mensaje).toMatch(/nombre/i);
    esMensajeParaPersonas(failure.error.mensaje);
  });

  it("turns Prisma's missing-record error into the same 404 as any other", () => {
    expect(errorDePrisma({ code: "P2025" })).toEqual(enlaceNoEncontrado());
  });

  /**
   * The CHECK constraint on `enlace.tipo` is the last line of defence, reached
   * only through a bug, and Prisma does not report it dependably — it may
   * arrive as P2004 or as an untyped error depending on the provider. So it is
   * deliberately NOT distinguished: anything unrecognised is a 500 with one
   * safe message.
   */
  it.each([
    ["a CHECK violation", { code: "P2004", message: "A constraint failed on the database" }],
    ["an untyped Prisma failure", new Error("Violation of CHECK constraint 'enlace_tipo_check'")],
    ["a raw SQL Server error", { code: 547, message: "The INSERT statement conflicted" }],
    ["a dropped connection", { code: "P1001", message: "Can't reach database server at 10.0.0.5:1433" }],
    ["something that is not an error at all", "boom"],
    ["nothing", undefined],
  ])("answers a generic 500 for %s", (_case, error) => {
    expect(errorDePrisma(error)).toEqual(ERROR_INTERNO);
    expect(ERROR_INTERNO.status).toBe(500);
  });

  it("never leaks the database's own words to the browser", () => {
    const filtrado = errorDePrisma(
      new Error("Violation of CHECK constraint 'enlace_tipo_check' on table 'dbo.enlace', error 547"),
    );

    expect(filtrado.error.mensaje).not.toMatch(/check|constraint|enlace_tipo_check|dbo|547|table/i);
    esMensajeParaPersonas(filtrado.error.mensaje);
  });

  it("never leaks a connection string or a host either", () => {
    const filtrado = errorDePrisma({
      code: "P1001",
      message: "Can't reach database server at `10.20.30.40:1433`",
    });

    expect(filtrado.error.mensaje).not.toMatch(/10\.20\.30\.40|1433|server/i);
  });
});
