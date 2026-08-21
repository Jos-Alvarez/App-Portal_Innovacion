import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOut(...args),
}));

import { SignOutButton } from "./sign-out-button";

/**
 * The way out of the portal — the anchor item #17's administrator button sits
 * beside.
 *
 * `next-auth/react` is replaced because the real helper fetches a CSRF token and
 * navigates. What is asserted is the wiring only this component can get wrong.
 */

describe("<SignOutButton />", () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it("cierra la sesión cuando se pulsa", async () => {
    render(<SignOutButton />);

    await userEvent.setup().click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  /**
   * Landing on `/` after signing out sends the reader straight into `proxy.ts`,
   * which has no session to accept and redirects to `/login` anyway — one extra
   * round trip, with a flash of the gate in between.
   */
  it("devuelve al login, no a la raíz protegida", async () => {
    render(<SignOutButton />);

    await userEvent.setup().click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(signOut.mock.calls[0][0]).toMatchObject({ redirectTo: "/login" });
  });

  it("no hace nada hasta que se lo piden", () => {
    render(<SignOutButton />);

    expect(signOut).not.toHaveBeenCalled();
  });
});
