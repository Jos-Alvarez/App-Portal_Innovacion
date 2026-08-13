import { describe, expect, it } from "vitest";

import {
  AUTH_ERROR_PATH,
  DEFAULT_AFTER_SIGN_IN_PATH,
  SIGN_IN_PATH,
  isPublicPath,
  toSafeCallbackUrl,
} from "./auth-gate";

describe("isPublicPath", () => {
  it("keeps the sign-in screen reachable without a session", () => {
    expect(isPublicPath(SIGN_IN_PATH)).toBe(true);
  });

  it("keeps the authentication error screen reachable without a session", () => {
    expect(isPublicPath(AUTH_ERROR_PATH)).toBe(true);
  });

  it("keeps the Auth.js endpoints reachable so the OAuth round trip can finish", () => {
    expect(isPublicPath("/api/auth/signin")).toBe(true);
    expect(isPublicPath("/api/auth/csrf")).toBe(true);
    expect(isPublicPath("/api/auth/callback/microsoft-entra-id")).toBe(true);
  });

  it("gates the portal itself", () => {
    expect(isPublicPath("/")).toBe(false);
  });

  it("gates application endpoints that are not the Auth.js ones", () => {
    expect(isPublicPath("/api/procesadores/ejecutar")).toBe(false);
  });

  it("matches whole segments, so a lookalike prefix is not public", () => {
    expect(isPublicPath("/loginfalso")).toBe(false);
    expect(isPublicPath("/api/authentication")).toBe(false);
  });

  it("treats a trailing slash on a public path as the same path", () => {
    expect(isPublicPath(`${SIGN_IN_PATH}/`)).toBe(true);
  });
});

describe("toSafeCallbackUrl", () => {
  it("keeps an in-app path so the reader returns where they were going", () => {
    expect(toSafeCallbackUrl("/sugerencias")).toBe("/sugerencias");
  });

  it("keeps the query string of an in-app path", () => {
    expect(toSafeCallbackUrl("/sugerencias?estado=pendiente")).toBe("/sugerencias?estado=pendiente");
  });

  it("falls back to the portal root when nothing was requested", () => {
    expect(toSafeCallbackUrl(undefined)).toBe(DEFAULT_AFTER_SIGN_IN_PATH);
    expect(toSafeCallbackUrl(null)).toBe(DEFAULT_AFTER_SIGN_IN_PATH);
    expect(toSafeCallbackUrl("")).toBe(DEFAULT_AFTER_SIGN_IN_PATH);
  });

  it("rejects an absolute URL, which would send the reader off the portal", () => {
    expect(toSafeCallbackUrl("https://ejemplo.invalid/robo")).toBe(DEFAULT_AFTER_SIGN_IN_PATH);
  });

  it("rejects a protocol-relative URL, which is an off-site destination in disguise", () => {
    expect(toSafeCallbackUrl("//ejemplo.invalid/robo")).toBe(DEFAULT_AFTER_SIGN_IN_PATH);
  });

  it("rejects a backslash-prefixed path, which browsers normalise to an off-site host", () => {
    expect(toSafeCallbackUrl("/\\ejemplo.invalid")).toBe(DEFAULT_AFTER_SIGN_IN_PATH);
  });

  it("rejects a value that is not a path at all", () => {
    expect(toSafeCallbackUrl("javascript:alert(1)")).toBe(DEFAULT_AFTER_SIGN_IN_PATH);
  });
});
