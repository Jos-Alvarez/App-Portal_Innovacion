// @vitest-environment node
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The production source, with its two collaborators replaced: Auth.js because
 * the session it returns comes from an OAuth round trip that cannot be run
 * without a live tenant, and the Prisma singleton because the suite never
 * opens a connection to SQL Server.
 *
 * WHAT THIS FILE CANNOT PROVE. The reads are wrapped in React's `cache()`,
 * which only memoizes inside a server render pass; called from a plain test
 * there is no request context, so `cache()` deliberately calls straight through
 * and the deduplication is simply not observable here. That the cache exists
 * per request and is discarded between requests is a React guarantee
 * ("React will invalidate the cache for all memoized functions for each server
 * request"), not something this suite re-proves. What is exercised below is the
 * branch that decides whether a database read happens at all.
 */

const authMock = vi.fn<() => Promise<Session | null>>();
const findUnique = vi.fn(async (_args: unknown) => null as unknown);

vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    usuario: { findUnique: (args: unknown) => findUnique(args) },
    asignacionEnlace: { findUnique: (args: unknown) => findUnique(args) },
    asignacionProcesador: { findUnique: (args: unknown) => findUnique(args) },
  },
}));

import { requestSource } from "@/lib/authz/request-source";

function session(email: string | null): Session {
  return { user: email ? { email } : {}, expires: "2099-01-01" } as Session;
}

describe("requestSource.account", () => {
  beforeEach(() => {
    authMock.mockReset();
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
  });

  it("resolves the account from the session's e-mail against the database", async () => {
    authMock.mockResolvedValue(session("jose@corp.com"));
    findUnique.mockResolvedValue({
      id: 4,
      correo: "jose@corp.com",
      nombre: "José",
      esAdmin: true,
      activo: true,
    });

    const result = await requestSource.account();

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      allowed: true,
      usuario: { id: 4, correo: "jose@corp.com", nombre: "José", esAdmin: true },
    });
  });

  it("denies without touching the database when there is no session", async () => {
    authMock.mockResolvedValue(null);

    expect(await requestSource.account()).toEqual({ allowed: false, reason: "no-session" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("denies a session that carries no e-mail to resolve an account by", async () => {
    authMock.mockResolvedValue(session(null));

    expect(await requestSource.account()).toEqual({ allowed: false, reason: "no-session" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("denies a session whose account was deleted while it was still alive", async () => {
    authMock.mockResolvedValue(session("fantasma@corp.com"));

    expect(await requestSource.account()).toEqual({ allowed: false, reason: "unknown-account" });
  });
});

describe("requestSource.grant", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
  });

  it("reads the assignment for the resource it is asked about", async () => {
    findUnique.mockResolvedValue({ enlace: { activo: true } });

    const grant = await requestSource.grant({ tipo: "enlace", id: 12 }, 4);

    expect(findUnique).toHaveBeenCalledWith({
      where: { usuarioId_enlaceId: { usuarioId: 4, enlaceId: 12 } },
      select: { enlace: { select: { activo: true } } },
    });
    expect(grant).toEqual({ recursoActivo: true });
  });

  it("reports no grant when the pair has no assignment row", async () => {
    expect(await requestSource.grant({ tipo: "procesador", id: 31 }, 4)).toBeNull();
  });
});
