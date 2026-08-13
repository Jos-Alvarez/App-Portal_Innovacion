import { afterEach, describe, expect, it, vi } from "vitest";

import { GRAPH_ME_DEPARTMENT_URL, fetchDepartment } from "@/lib/auth/graph";

/**
 * `department` is an optional profile attribute. Every failure mode here must
 * resolve to `""` — the empty-area bucket — because a user must never be kept
 * out of the portal by a directory attribute the portal merely likes to have.
 */

function respondWith(body: unknown, ok = true): typeof fetch {
  return vi.fn(async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchDepartment", () => {
  it("asks Graph for the department with the bearer token and returns it trimmed", async () => {
    const fetchImpl = respondWith({ department: "  Innovación  " });

    await expect(fetchDepartment("token-abc", fetchImpl)).resolves.toBe("Innovación");
    expect(fetchImpl).toHaveBeenCalledWith(GRAPH_ME_DEPARTMENT_URL, {
      headers: { Authorization: "Bearer token-abc" },
    });
  });

  it("selects department explicitly, since Graph omits it from /me by default", () => {
    expect(GRAPH_ME_DEPARTMENT_URL).toBe(
      "https://graph.microsoft.com/v1.0/me?$select=department",
    );
  });

  it("returns the empty bucket when the account has no department", async () => {
    await expect(fetchDepartment("token", respondWith({}))).resolves.toBe("");
    await expect(fetchDepartment("token", respondWith({ department: null }))).resolves.toBe("");
    await expect(fetchDepartment("token", respondWith({ department: 42 }))).resolves.toBe("");
  });

  it("returns the empty bucket when Graph answers with an error status", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(fetchDepartment("token", respondWith({ error: {} }, false))).resolves.toBe("");
  });

  it("returns the empty bucket when the call throws or the body is not JSON", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const rejecting = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(fetchDepartment("token", rejecting)).resolves.toBe("");
    await expect(
      fetchDepartment("token", {
        ok: true,
        json: async () => {
          throw new SyntaxError("not json");
        },
      } as never),
    ).resolves.toBe("");
  });

  it("does not call Graph at all without an access token", async () => {
    const fetchImpl = respondWith({ department: "Innovación" });

    await expect(fetchDepartment(undefined, fetchImpl)).resolves.toBe("");
    await expect(fetchDepartment("   ", fetchImpl)).resolves.toBe("");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
