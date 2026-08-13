import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { type Authorization, allow, deny } from "@/lib/authz/decisions";
import { toPageAuthorization } from "@/lib/authz/page-guard";

/**
 * The Server Component half of the guard: a page cannot set a status code, so
 * a denial has to arrive as something the page renders in place. Rendering it
 * in place — rather than redirecting home — is what the PRD asks for: the
 * resource is blocked with an explanation, not quietly hidden.
 */

function forbiddenScreen(authorization: Authorization): ReactElement {
  const result = toPageAuthorization(authorization);

  if (result.allowed) {
    throw new Error("expected a denial");
  }

  return result.screen as ReactElement;
}

describe("toPageAuthorization", () => {
  beforeEach(() => {
    push.mockReset();
  });

  it("hands the resolved user to the page when the request is allowed", () => {
    expect(
      toPageAuthorization(allow({ id: 4, correo: "jose@corp.com", nombre: "José", esAdmin: false })),
    ).toEqual({
      allowed: true,
      usuario: { id: 4, correo: "jose@corp.com", nombre: "José", esAdmin: false },
    });
  });

  it("renders DESIGN.md's Sin permiso screen when the assignment is missing", () => {
    render(forbiddenScreen(deny("not-assigned")));

    expect(screen.getByRole("alert")).toHaveTextContent(/no tienes acceso a esta sección/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/el área de innovación administra/i);
  });

  it("shows the same screen to someone who is simply not an administrator", () => {
    render(forbiddenScreen(deny("not-admin")));

    expect(screen.getByRole("alert")).toHaveTextContent(/no tienes acceso a esta sección/i);
  });

  it("tells a deactivated account that the problem is the account, not the section", () => {
    render(forbiddenScreen(deny("inactive-account")));

    expect(screen.getByRole("alert")).toHaveTextContent(/tu cuenta no está habilitada/i);
  });

  it("tells an expired session to sign in again instead of blaming a permission", () => {
    render(forbiddenScreen(deny("no-session")));

    expect(screen.getByRole("alert")).toHaveTextContent(/sesión/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/no tienes acceso a esta sección/i);
  });

  it("sends a blocked reader back to the portal", async () => {
    const user = userEvent.setup();
    render(forbiddenScreen(deny("not-assigned")));

    await user.click(screen.getByRole("button", { name: "Volver al portal" }));

    expect(push).toHaveBeenCalledWith("/");
  });

  it("sends a reader with no session to the sign-in screen, which is their portal", async () => {
    const user = userEvent.setup();
    render(forbiddenScreen(deny("no-session")));

    await user.click(screen.getByRole("button", { name: "Volver al portal" }));

    expect(push).toHaveBeenCalledWith("/login");
  });

  it("omits Solicitar acceso while its destination is still an open product decision", () => {
    render(forbiddenScreen(deny("not-assigned")));

    expect(screen.queryByRole("button", { name: "Solicitar acceso" })).toBeNull();
  });
});
