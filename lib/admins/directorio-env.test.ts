// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readDirectorioEnv, tenantFromIssuer } from "@/lib/admins/directorio-env";

/**
 * The configuration of the directory search, and the throw that starts ADR
 * 0009's degradation.
 *
 * Nothing here reads `process.env`: the source is a parameter, so a
 * misconfiguration can be described exactly rather than simulated.
 */

const COMPLETO = {
  AUTH_MICROSOFT_ENTRA_ID_ID: "cliente-123",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "secreto",
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/tenant-abc/v2.0",
};

describe("tenantFromIssuer", () => {
  it("saca el tenant del issuer que ya usa el login", () => {
    expect(tenantFromIssuer("https://login.microsoftonline.com/tenant-abc/v2.0")).toBe("tenant-abc");
  });

  it("tolera una barra final y segmentos de más", () => {
    expect(tenantFromIssuer("https://login.microsoftonline.com/tenant-abc/v2.0/")).toBe(
      "tenant-abc",
    );
  });

  it("funciona con otra nube de Microsoft", () => {
    expect(tenantFromIssuer("https://login.microsoftonline.us/tenant-abc/v2.0")).toBe("tenant-abc");
  });

  /**
   * A client-credentials token has no user to resolve the tenant from, so the
   * endpoint must name one. Rejecting the aliases here turns a misconfiguration
   * into the documented degradation instead of a 400 from Microsoft per search.
   */
  it.each(["common", "organizations", "consumers", "COMMON"])(
    "rechaza el alias multitenant %s",
    (alias) => {
      expect(() => tenantFromIssuer(`https://login.microsoftonline.com/${alias}/v2.0`)).toThrow();
    },
  );

  it("rechaza un issuer sin tenant", () => {
    expect(() => tenantFromIssuer("https://login.microsoftonline.com/")).toThrow();
  });

  it("rechaza algo que no es una URL", () => {
    expect(() => tenantFromIssuer("tenant-abc")).toThrow(/not a URL/i);
  });
});

describe("readDirectorioEnv", () => {
  it("lee las mismas credenciales que usa el login", () => {
    expect(readDirectorioEnv(COMPLETO)).toEqual({
      tenantId: "tenant-abc",
      clientId: "cliente-123",
      clientSecret: "secreto",
    });
  });

  it("recorta los valores", () => {
    expect(readDirectorioEnv({ ...COMPLETO, AUTH_MICROSOFT_ENTRA_ID_ID: "  cliente-123  " })).toEqual(
      expect.objectContaining({ clientId: "cliente-123" }),
    );
  });

  it.each(Object.keys(COMPLETO))("lanza cuando falta %s", (nombre) => {
    expect(() => readDirectorioEnv({ ...COMPLETO, [nombre]: undefined })).toThrow(nombre);
  });

  it("trata una variable en blanco como ausente", () => {
    expect(() => readDirectorioEnv({ ...COMPLETO, AUTH_MICROSOFT_ENTRA_ID_SECRET: "   " })).toThrow(
      /SECRET/,
    );
  });

  it("nombra todas las que faltan de una vez", () => {
    expect(() => readDirectorioEnv({})).toThrow(/ID.*SECRET.*ISSUER/s);
  });

  /** This message reaches a server log; the secret must never be in it. */
  it("no incluye el secreto en el error", () => {
    try {
      readDirectorioEnv({ ...COMPLETO, AUTH_MICROSOFT_ENTRA_ID_ID: "" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("secreto");
    }
  });
});
