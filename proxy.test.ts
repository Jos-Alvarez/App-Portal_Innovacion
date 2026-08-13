// @vitest-environment node
import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";

/**
 * `auth()` is Auth.js's wrapper: it verifies the session cookie and hands the
 * handler a request carrying `auth`. Replacing it with the identity function
 * lets the gate's own decision be exercised directly, with the session state
 * supplied as data — the OAuth round trip that produces it cannot be run
 * without a live Entra ID tenant.
 */
vi.mock("@/auth", () => ({
  auth: (handler: unknown) => handler,
}));

import { CALLBACK_URL_PARAM, SIGN_IN_PATH } from "@/lib/auth-gate";

import { config, proxy } from "./proxy";

const SESSION = { user: { email: "persona@empresa.test" }, expires: "2099-01-01" } as Session;

type GateRequest = { nextUrl: URL; auth: Session | null };

function request(url: string, session: Session | null = null): GateRequest {
  return { nextUrl: new URL(url, "https://portal.test"), auth: session };
}

function runGate(req: GateRequest): Response {
  const gate = proxy as unknown as (req: GateRequest) => Response;
  return gate(req);
}

function locationOf(response: Response): string | null {
  return response.headers.get("location");
}

describe("proxy", () => {
  it("sends an unauthenticated request to the sign-in screen", () => {
    const response = runGate(request("/"));

    const location = locationOf(response);
    expect(location).not.toBeNull();
    expect(new URL(location as string).pathname).toBe(SIGN_IN_PATH);
  });

  it("remembers where the reader was going so sign-in returns them there", () => {
    const response = runGate(request("/sugerencias?estado=pendiente"));

    const location = new URL(locationOf(response) as string);
    expect(location.searchParams.get(CALLBACK_URL_PARAM)).toBe("/sugerencias?estado=pendiente");
  });

  it("keeps the redirect on the portal's own origin", () => {
    const response = runGate(request("/sugerencias"));

    expect(new URL(locationOf(response) as string).origin).toBe("https://portal.test");
  });

  it("lets an authenticated request through", () => {
    const response = runGate(request("/", SESSION));

    expect(locationOf(response)).toBeNull();
  });

  it("lets the sign-in screen itself through, or the redirect would loop", () => {
    const response = runGate(request(SIGN_IN_PATH));

    expect(locationOf(response)).toBeNull();
  });

  it("lets the authentication error screen through, or a rejection could not be explained", () => {
    const response = runGate(request("/login/error?error=AccessDenied"));

    expect(locationOf(response)).toBeNull();
  });

  it("lets the Auth.js endpoints through, or the OAuth round trip could never finish", () => {
    expect(locationOf(runGate(request("/api/auth/signin/microsoft-entra-id")))).toBeNull();
    expect(locationOf(runGate(request("/api/auth/callback/microsoft-entra-id?code=x")))).toBeNull();
  });

  it("gates application endpoints that are not the Auth.js ones", () => {
    const response = runGate(request("/api/procesadores/ejecutar"));

    expect(new URL(locationOf(response) as string).pathname).toBe(SIGN_IN_PATH);
  });

  it("does not run on Next's build output or on static assets", () => {
    const matcher = config.matcher as string[];
    const pattern = new RegExp(`^${matcher[0]}$`);

    expect(pattern.test("/_next/static/chunks/main.js")).toBe(false);
    expect(pattern.test("/_next/image?url=%2Flogo.png")).toBe(false);
    expect(pattern.test("/logo.png")).toBe(false);
    expect(pattern.test("/favicon.ico")).toBe(false);
  });

  it("does run on the portal's pages and endpoints", () => {
    const matcher = config.matcher as string[];
    const pattern = new RegExp(`^${matcher[0]}$`);

    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/sugerencias")).toBe(true);
    expect(pattern.test("/api/procesadores/ejecutar")).toBe(true);
  });
});
