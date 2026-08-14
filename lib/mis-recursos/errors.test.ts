// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ERROR_INTERNO,
  aperturaNoRegistrada,
  destinoNoPermitido,
  enlaceNoEncontrado,
  identificadorInvalido,
} from "@/lib/mis-recursos/errors";

/**
 * Every way the collaborator's two routes can fail.
 *
 * These messages are read by a collaborator and not by an administrator, which
 * is the whole reason this mapping exists next to `lib/enlaces/errors.ts`
 * instead of being borrowed from it: that one says "vuelve al catálogo",
 * addressing whoever maintains the catalogue. The person reading these has no
 * catalogue and nothing to fix — their only useful next step is to retry or to
 * tell the Área de Innovación.
 */

const TODOS = [
  ERROR_INTERNO,
  identificadorInvalido(),
  enlaceNoEncontrado(),
  destinoNoPermitido(),
  aperturaNoRegistrada(),
];

describe("the envelope", () => {
  it("is ADR 0003's two keys and nothing else", () => {
    for (const fallo of TODOS) {
      expect(Object.keys(fallo.error).sort()).toEqual(["codigo", "mensaje"]);
    }
  });

  it("gives every failure its own code, so the UI can tell them apart", () => {
    const codigos = TODOS.map((fallo) => fallo.error.codigo);

    expect(new Set(codigos).size).toBe(codigos.length);
  });

  /**
   * DESIGN.md: "Copys en español, directos, sin jerga técnica". Nothing here may
   * name a status code, a SQL Server constraint, a Prisma code or a URL scheme —
   * a collaborator cannot act on any of it, and it describes the portal's
   * insides to whoever provoked the failure.
   */
  it("says nothing technical the reader cannot act on", () => {
    for (const fallo of TODOS) {
      expect(fallo.error.mensaje).not.toMatch(
        /prisma|sql|constraint|http|javascript|null|undefined|\b\d{3}\b/i,
      );
    }
  });

  it("ends every message as a sentence, in Spanish", () => {
    for (const fallo of TODOS) {
      expect(fallo.error.mensaje).toMatch(/\.$/);
      expect(fallo.error.mensaje.length).toBeGreaterThan(20);
    }
  });
});

describe("each failure", () => {
  it("answers 500 for a portal-side problem the reader did not cause", () => {
    expect(ERROR_INTERNO.status).toBe(500);
    expect(destinoNoPermitido().status).toBe(500);
    expect(aperturaNoRegistrada().status).toBe(500);
  });

  it("answers 400 for a link segment that is not an identifier", () => {
    expect(identificadorInvalido().status).toBe(400);
  });

  it("answers 404 for a resource that is no longer there", () => {
    expect(enlaceNoEncontrado().status).toBe(404);
  });

  /**
   * The reader is told the portal refused to open it, not merely that something
   * failed: a redirect that silently did not happen looks like a broken link,
   * and the person who can fix the stored address is the Área de Innovación.
   */
  it("tells the reader who can fix a destination the portal refuses", () => {
    expect(destinoNoPermitido().error.mensaje).toMatch(/Área de Innovación/);
  });

  /**
   * The apertura is not best-effort here (see the route). If the record failed,
   * the link was not opened, and saying so is the difference between a reader
   * who retries and a reader who thinks the portal is broken.
   */
  it("says plainly that the link was not opened when the record failed", () => {
    expect(aperturaNoRegistrada().error.mensaje).toMatch(/no (lo )?abrimos|no se abrió|sin abrir/i);
  });
});
