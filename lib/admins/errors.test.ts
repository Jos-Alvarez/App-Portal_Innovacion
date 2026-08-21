// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ERROR_INTERNO,
  type MotivoRechazo,
  RolRechazado,
  correoInvalido,
  cuentaDadaDeBaja,
  cuentaFijada,
  directorioNoDisponible,
  dominioNoCorporativo,
  errorDeRol,
  identificadorInvalido,
  noEsAdministrador,
  personaNoEncontrada,
  terminoInvalido,
  ultimoAdministrador,
  usuarioNoEncontrado,
  yaEsAdministrador,
} from "@/lib/admins/errors";
import { BUSQUEDA_MIN } from "@/lib/admins/schema";

/**
 * The refusal vocabulary of the role screen.
 *
 * Two properties are worth protecting here. The status codes, because a client
 * that cannot tell "you sent something wrong" from "the world changed" will
 * eventually retry the wrong one. And the copy, because DESIGN.md requires plain
 * Spanish with no technical codes — these sentences are shown to a person as
 * they stand.
 */

const TODAS = [
  terminoInvalido(),
  identificadorInvalido(),
  correoInvalido(),
  dominioNoCorporativo(),
  personaNoEncontrada(),
  directorioNoDisponible(),
  yaEsAdministrador(),
  cuentaDadaDeBaja(),
  noEsAdministrador(),
  usuarioNoEncontrado(),
  ultimoAdministrador(),
  cuentaFijada(),
  ERROR_INTERNO,
];

describe("el envelope de ADR 0003", () => {
  it.each(TODAS)("$error.codigo lleva código y mensaje", (fallo) => {
    expect(fallo.error.codigo).not.toBe("");
    expect(fallo.error.mensaje.length).toBeGreaterThan(10);
  });

  it("usa un código distinto para cada motivo", () => {
    const codigos = TODAS.map((fallo) => fallo.error.codigo);

    expect(new Set(codigos).size).toBe(codigos.length);
  });

  /**
   * Nothing the database, Microsoft Graph or zod said may reach the reader. The
   * words below are the ones that would betray a leak.
   */
  it.each(TODAS)("$error.codigo no filtra jerga técnica", (fallo) => {
    expect(fallo.error.mensaje).not.toMatch(
      /prisma|sql|graph|token|es_admin|usuario\.|P20\d\d|undefined|null/i,
    );
  });
});

describe("los códigos de estado", () => {
  it("responde 400 a lo que el cliente puede corregir en la petición", () => {
    expect(terminoInvalido().status).toBe(400);
    expect(identificadorInvalido().status).toBe(400);
    expect(correoInvalido().status).toBe(400);
  });

  it("responde 404 a quien no existe", () => {
    expect(personaNoEncontrada().status).toBe(404);
    expect(usuarioNoEncontrado().status).toBe(404);
  });

  it("responde 409 a lo que es un choque con el estado del mundo", () => {
    expect(yaEsAdministrador().status).toBe(409);
    expect(cuentaDadaDeBaja().status).toBe(409);
    expect(noEsAdministrador().status).toBe(409);
    expect(ultimoAdministrador().status).toBe(409);
    expect(cuentaFijada().status).toBe(409);
    expect(dominioNoCorporativo().status).toBe(409);
    expect(directorioNoDisponible().status).toBe(409);
  });

  it("reserva el 500 para lo que el portal no supo explicar", () => {
    expect(ERROR_INTERNO.status).toBe(500);
  });
});

describe("los mensajes que tienen que decir algo accionable", () => {
  it("el término inválido dice cuántos caracteres hacen falta", () => {
    expect(terminoInvalido().error.mensaje).toContain(String(BUSQUEDA_MIN));
  });

  /** The whole point of the rule, in the sentence the administrator reads. */
  it("el último administrador explica la regla y qué hacer antes", () => {
    expect(ultimoAdministrador().error.mensaje).toMatch(/al menos una persona administradora/i);
  });

  /** ADR 0009's degradation: asking that person to sign in once is a real fix. */
  it("el directorio caído propone que la persona entre una vez", () => {
    expect(directorioNoDisponible().error.mensaje).toMatch(/inicie sesión/i);
  });

  /**
   * `lib/auth/usuario-repository.ts` requires this refusal to say WHERE the pin
   * lives, so the administrator knows the change is possible but not from here.
   */
  it("la cuenta fijada apunta a la configuración del despliegue", () => {
    expect(cuentaFijada().error.mensaje).toMatch(/configuración del despliegue/i);
  });

  /** A failed write must never leave the reader guessing whether it half-applied. */
  it("el error interno promete que no se guardó nada", () => {
    expect(ERROR_INTERNO.error.mensaje).toMatch(/no se guardó nada/i);
  });
});

describe("errorDeRol", () => {
  const ESPERADOS: Record<MotivoRechazo, string> = {
    no_encontrado: usuarioNoEncontrado().error.codigo,
    dado_de_baja: cuentaDadaDeBaja().error.codigo,
    ya_es_admin: yaEsAdministrador().error.codigo,
    no_es_admin: noEsAdministrador().error.codigo,
    cuenta_fijada: cuentaFijada().error.codigo,
    ultimo_admin: ultimoAdministrador().error.codigo,
    conflicto: "conflicto_de_roles",
  };

  it.each(Object.entries(ESPERADOS))("traduce el rechazo %s", (motivo, codigo) => {
    const fallo = errorDeRol(new RolRechazado(motivo as MotivoRechazo));

    expect(fallo.error.codigo).toBe(codigo);
  });

  /**
   * Serializable is what makes the minimum-one rule hold under two simultaneous
   * revocations, and P2034 is what SQL Server answers when it enforces it. A
   * retry is the fix, so it must not look like a server fault.
   */
  it("trata el conflicto de escritura de Prisma como algo que se reintenta", () => {
    const fallo = errorDeRol({ code: "P2034" });

    expect(fallo.status).toBe(409);
    expect(fallo.error.mensaje).toMatch(/vuelve a intentarlo/i);
  });

  /**
   * The unique index on `correo`. It can fire because another promotion won the
   * race — or because that person's own first sign-in did, which creates the row
   * WITHOUT the role. Claiming "ya es administradora" would be a lie in exactly
   * the case the administrator most needs to act on.
   */
  it("trata la colisión de correo como conflicto, no como «ya es administradora»", () => {
    const fallo = errorDeRol({ code: "P2002" });

    expect(fallo.error.codigo).toBe("conflicto_de_roles");
    expect(fallo.error.codigo).not.toBe(yaEsAdministrador().error.codigo);
  });

  it.each([new Error("boom"), null, undefined, "P2034", { code: 7 }, { code: "P2003" }])(
    "responde 500 ante %o",
    (error) => {
      expect(errorDeRol(error)).toBe(ERROR_INTERNO);
    },
  );

  /** Duck-typed on purpose: Prisma does not always throw its own error class. */
  it("lee el código sin exigir la clase de error de Prisma", () => {
    expect(errorDeRol({ code: "P2034" }).status).toBe(409);
  });
});

describe("RolRechazado", () => {
  it("conserva el motivo para que el mapeo no tenga que adivinarlo", () => {
    expect(new RolRechazado("ultimo_admin").motivo).toBe("ultimo_admin");
  });

  it("es un Error, así que lanzarlo revierte la transacción", () => {
    expect(new RolRechazado("conflicto")).toBeInstanceOf(Error);
  });
});
