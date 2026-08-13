import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

import { ENTRA_PROVIDER_ID, SignInButton } from "./sign-in-button";

describe("<SignInButton />", () => {
  beforeEach(() => {
    signIn.mockReset();
  });

  function pressSignIn() {
    return userEvent.setup().click(screen.getByRole("button", { name: /iniciar sesión/i }));
  }

  it("starts the sign-in with the corporate identity provider", async () => {
    render(<SignInButton redirectTo="/" />);

    await pressSignIn();

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn.mock.calls[0][0]).toBe(ENTRA_PROVIDER_ID);
  });

  it("carries the destination the reader was originally heading to", async () => {
    render(<SignInButton redirectTo="/sugerencias?estado=pendiente" />);

    await pressSignIn();

    expect(signIn.mock.calls[0][1]).toMatchObject({ redirectTo: "/sugerencias?estado=pendiente" });
  });

  it("does nothing until the reader asks for it", () => {
    render(<SignInButton redirectTo="/" />);

    expect(signIn).not.toHaveBeenCalled();
  });
});
