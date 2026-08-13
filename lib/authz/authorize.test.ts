import { describe, expect, it, vi } from "vitest";

import {
  type AuthorizationSource,
  authorizeAdminRequest,
  authorizeResourceRequest,
  authorizeSessionRequest,
} from "@/lib/authz/authorize";
import { type Authorization, allow, deny } from "@/lib/authz/decisions";

/**
 * The three questions a guard can ask, over an injected source of truth. The
 * source is what `request-source.ts` builds from Auth.js and Prisma in
 * production; here it is a stub, so the orchestration — which read happens,
 * with which arguments, and which read is skipped — is exercised directly.
 */

const COLABORADOR = allow({ id: 4, correo: "jose@corp.com", nombre: "José", esAdmin: false });
const ADMIN = allow({ id: 9, correo: "ada@corp.com", nombre: "Ada", esAdmin: true });

function sourceStub(account: Authorization, grant: { recursoActivo: boolean } | null = null) {
  const readGrant = vi.fn(async () => grant);
  const source: AuthorizationSource = {
    account: async () => account,
    grant: readGrant,
  };

  return { source, readGrant };
}

describe("authorizeSessionRequest", () => {
  it("admits any active collaborator, with no role and no assignment required", async () => {
    const { source } = sourceStub(COLABORADOR);

    expect(await authorizeSessionRequest(source)).toEqual({
      allowed: true,
      usuario: { id: 4, correo: "jose@corp.com", nombre: "José", esAdmin: false },
    });
  });

  it("passes the account's own denial through untouched", async () => {
    const { source } = sourceStub(deny("inactive-account"));

    expect(await authorizeSessionRequest(source)).toEqual({
      allowed: false,
      reason: "inactive-account",
    });
  });
});

describe("authorizeAdminRequest", () => {
  it("admits an administrator", async () => {
    const { source } = sourceStub(ADMIN);

    expect(await authorizeAdminRequest(source)).toEqual({
      allowed: true,
      usuario: { id: 9, correo: "ada@corp.com", nombre: "Ada", esAdmin: true },
    });
  });

  it("refuses a collaborator who is not one", async () => {
    const { source } = sourceStub(COLABORADOR);

    expect(await authorizeAdminRequest(source)).toEqual({ allowed: false, reason: "not-admin" });
  });

  it("never reads the assignment tables to answer a role question", async () => {
    const { source, readGrant } = sourceStub(ADMIN);

    await authorizeAdminRequest(source);

    expect(readGrant).not.toHaveBeenCalled();
  });
});

describe("authorizeResourceRequest", () => {
  it("looks the grant up for the resolved user and admits an active resource", async () => {
    const { source, readGrant } = sourceStub(COLABORADOR, { recursoActivo: true });

    const result = await authorizeResourceRequest(source, { tipo: "procesador", id: 31 });

    expect(readGrant).toHaveBeenCalledWith({ tipo: "procesador", id: 31 }, 4);
    expect(result).toEqual({
      allowed: true,
      usuario: { id: 4, correo: "jose@corp.com", nombre: "José", esAdmin: false },
    });
  });

  it("refuses a resource the user holds no grant over", async () => {
    const { source } = sourceStub(COLABORADOR, null);

    expect(await authorizeResourceRequest(source, { tipo: "enlace", id: 12 })).toEqual({
      allowed: false,
      reason: "not-assigned",
    });
  });

  it("refuses a grant whose resource the catalogue deactivated", async () => {
    const { source } = sourceStub(COLABORADOR, { recursoActivo: false });

    expect(await authorizeResourceRequest(source, { tipo: "enlace", id: 12 })).toEqual({
      allowed: false,
      reason: "inactive-resource",
    });
  });

  it("does not query the assignment tables when there is no account to query them for", async () => {
    const { source, readGrant } = sourceStub(deny("no-session"), { recursoActivo: true });

    const result = await authorizeResourceRequest(source, { tipo: "enlace", id: 12 });

    expect(readGrant).not.toHaveBeenCalled();
    expect(result).toEqual({ allowed: false, reason: "no-session" });
  });
});
