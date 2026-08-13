import { describe, expect, it } from "vitest";

import { readAuthEnv } from "@/lib/auth/env";

const complete = {
  ALLOWED_EMAIL_DOMAIN: " Corp.COM ",
  AUTH_SECRET: "secret",
  AUTH_MICROSOFT_ENTRA_ID_ID: "client-id",
  AUTH_MICROSOFT_ENTRA_ID_SECRET: "client-secret",
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/tenant/v2.0",
};

describe("readAuthEnv", () => {
  it("returns the normalized values when every required variable is present", () => {
    expect(readAuthEnv({ ...complete, ADMIN_EMAIL: " Jose@Corp.com " })).toEqual({
      allowedEmailDomain: "corp.com",
      adminEmail: "jose@corp.com",
    });
  });

  it("treats ADMIN_EMAIL as optional, because its absence promotes nobody", () => {
    expect(readAuthEnv(complete).adminEmail).toBe("");
  });

  it("names every missing required variable in the error", () => {
    expect(() => readAuthEnv({})).toThrow(/ALLOWED_EMAIL_DOMAIN/);
    expect(() => readAuthEnv({})).toThrow(/AUTH_MICROSOFT_ENTRA_ID_SECRET/);
  });

  it("rejects a blank required variable as loudly as a missing one", () => {
    expect(() => readAuthEnv({ ...complete, ALLOWED_EMAIL_DOMAIN: "   " })).toThrow(
      /ALLOWED_EMAIL_DOMAIN/,
    );
  });
});
