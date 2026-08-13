import { describe, expect, it } from "vitest";

import {
  type Authorization,
  type UsuarioAuthzRow,
  allow,
  authorizeAccount,
  authorizeAdmin,
  authorizeGrant,
  deny,
  denialKind,
  errorForDenial,
  statusForDenial,
} from "@/lib/authz/decisions";

/**
 * The authorization rules as plain data in, plain data out. Everything the
 * guard decides lives here, so it can be exercised without Auth.js, without
 * Prisma and without a render — the two entry points on top of it only
 * translate these results into a screen or into a response.
 */

const row: UsuarioAuthzRow = {
  id: 7,
  correo: "jose@corp.com",
  nombre: "José Álvarez",
  esAdmin: false,
  activo: true,
};

const account: Authorization = allow({
  id: 7,
  correo: "jose@corp.com",
  nombre: "José Álvarez",
  esAdmin: false,
});

const adminAccount: Authorization = allow({
  id: 9,
  correo: "admin@corp.com",
  nombre: "Ada Admin",
  esAdmin: true,
});

describe("authorizeAccount", () => {
  it("resolves the signed-in collaborator from their row", () => {
    expect(authorizeAccount(row)).toEqual({
      allowed: true,
      usuario: { id: 7, correo: "jose@corp.com", nombre: "José Álvarez", esAdmin: false },
    });
  });

  it("does not carry activo into the resolved user, since it is not a permission", () => {
    const resolved = authorizeAccount(row);

    expect(resolved.allowed).toBe(true);
    expect(resolved.allowed && resolved.usuario).not.toHaveProperty("activo");
  });

  it("denies a session whose usuario row no longer exists", () => {
    expect(authorizeAccount(null)).toEqual({ allowed: false, reason: "unknown-account" });
  });

  it("denies a deactivated collaborator even though their row is there", () => {
    expect(authorizeAccount({ ...row, activo: false })).toEqual({
      allowed: false,
      reason: "inactive-account",
    });
  });
});

describe("authorizeAdmin", () => {
  it("lets an administrator through, keeping the resolved user", () => {
    expect(authorizeAdmin(adminAccount)).toEqual({
      allowed: true,
      usuario: { id: 9, correo: "admin@corp.com", nombre: "Ada Admin", esAdmin: true },
    });
  });

  it("denies a collaborator who is not an administrator", () => {
    expect(authorizeAdmin(account)).toEqual({ allowed: false, reason: "not-admin" });
  });

  it("keeps the original reason when the account was already denied", () => {
    expect(authorizeAdmin(deny("inactive-account"))).toEqual({
      allowed: false,
      reason: "inactive-account",
    });
  });
});

describe("authorizeGrant", () => {
  it("lets through a collaborator holding a grant over an active resource", () => {
    expect(authorizeGrant(account, { recursoActivo: true })).toEqual({
      allowed: true,
      usuario: { id: 7, correo: "jose@corp.com", nombre: "José Álvarez", esAdmin: false },
    });
  });

  it("denies when no assignment row exists (ADR 0007: sin fila de asignación, 403)", () => {
    expect(authorizeGrant(account, null)).toEqual({ allowed: false, reason: "not-assigned" });
  });

  it("denies a grant that points at a resource the catalogue deactivated", () => {
    expect(authorizeGrant(account, { recursoActivo: false })).toEqual({
      allowed: false,
      reason: "inactive-resource",
    });
  });

  it("gives an administrator no implicit grant over an unassigned resource", () => {
    expect(authorizeGrant(adminAccount, null)).toEqual({ allowed: false, reason: "not-assigned" });
  });

  it("keeps the original reason when the account was already denied", () => {
    expect(authorizeGrant(deny("no-session"), { recursoActivo: true })).toEqual({
      allowed: false,
      reason: "no-session",
    });
  });
});

describe("denialKind", () => {
  it("groups the six reasons into the three outcomes a reader can act on", () => {
    expect(denialKind("no-session")).toBe("session");
    expect(denialKind("unknown-account")).toBe("account");
    expect(denialKind("inactive-account")).toBe("account");
    expect(denialKind("not-admin")).toBe("resource");
    expect(denialKind("not-assigned")).toBe("resource");
    expect(denialKind("inactive-resource")).toBe("resource");
  });
});

describe("statusForDenial", () => {
  it("answers 401 only when there is no session to authorize at all", () => {
    expect(statusForDenial("no-session")).toBe(401);
  });

  it("answers 403 for every denial of an identified collaborator", () => {
    expect(statusForDenial("unknown-account")).toBe(403);
    expect(statusForDenial("inactive-account")).toBe(403);
    expect(statusForDenial("not-admin")).toBe(403);
    expect(statusForDenial("not-assigned")).toBe(403);
    expect(statusForDenial("inactive-resource")).toBe(403);
  });
});

describe("errorForDenial", () => {
  it("reports an expired session with its own code", () => {
    expect(errorForDenial("no-session")).toEqual({
      codigo: "sesion_requerida",
      mensaje: expect.stringMatching(/sesión/i),
    });
  });

  it("tells a deactivated account it is the account, not the permission", () => {
    expect(errorForDenial("inactive-account")).toEqual({
      codigo: "cuenta_no_habilitada",
      mensaje: expect.stringMatching(/área de innovación/i),
    });
  });

  it("collapses every missing-permission reason into one code, leaking no structure", () => {
    expect(errorForDenial("not-admin").codigo).toBe("acceso_denegado");
    expect(errorForDenial("not-assigned").codigo).toBe("acceso_denegado");
    expect(errorForDenial("inactive-resource").codigo).toBe("acceso_denegado");
  });

  it("writes every message in Spanish and free of technical codes (DESIGN.md)", () => {
    const mensajes = (
      ["no-session", "unknown-account", "inactive-account", "not-admin"] as const
    ).map((reason) => errorForDenial(reason).mensaje);

    for (const mensaje of mensajes) {
      expect(mensaje.length).toBeGreaterThan(20);
      expect(mensaje).not.toMatch(/40[13]|null|undefined|[a-z]+-[a-z]+/);
    }
  });
});
