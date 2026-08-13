import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { SIGN_IN_PATH } from "@/lib/auth-gate";

import { ACCESS_DENIED_ERROR, AuthErrorMessage } from "./auth-error";

describe("<AuthErrorMessage />", () => {
  beforeEach(() => {
    push.mockReset();
  });

  describe("when the account does not belong to the organization", () => {
    it("says the account is not a corporate one, in plain Spanish", () => {
      render(<AuthErrorMessage error={ACCESS_DENIED_ERROR} />);

      expect(screen.getByRole("alert")).toHaveTextContent(/no pertenece a lima expresa/i);
    });

    it("names the Área de Innovación as the place that resolves it", () => {
      render(<AuthErrorMessage error={ACCESS_DENIED_ERROR} />);

      expect(screen.getByRole("alert")).toHaveTextContent(/área de innovación/i);
    });

    it("leaks neither the configured domain nor the provider's own error code", () => {
      render(<AuthErrorMessage error={ACCESS_DENIED_ERROR} />);

      const shown = screen.getByRole("alert").textContent ?? "";
      expect(shown).not.toMatch(/@/);
      expect(shown).not.toMatch(/AccessDenied/i);
      /* The identity provider and the domain rule are configuration, not news. */
      expect(shown).not.toMatch(/entra id|microsoft|azure|oauth|oidc|dominio/i);
    });

    it("offers a way back to the sign-in screen", async () => {
      render(<AuthErrorMessage error={ACCESS_DENIED_ERROR} />);

      await userEvent.setup().click(screen.getByRole("button", { name: /volver al portal/i }));

      expect(push).toHaveBeenCalledWith(SIGN_IN_PATH);
    });
  });

  describe("when the sign-in failed for any other reason", () => {
    it("does not tell the reader their account is foreign to the organization", () => {
      render(<AuthErrorMessage error="Configuration" />);

      expect(screen.getByRole("alert")).not.toHaveTextContent(/no pertenece a lima expresa/i);
    });

    it("reports a failure and offers to try again", async () => {
      render(<AuthErrorMessage error="Configuration" />);

      expect(screen.getByRole("alert")).toHaveTextContent(/no pudimos/i);

      await userEvent.setup().click(screen.getByRole("button", { name: /reintentar/i }));

      expect(push).toHaveBeenCalledWith(SIGN_IN_PATH);
    });

    it("treats an absent error the same as any other failure", () => {
      render(<AuthErrorMessage error={undefined} />);

      expect(screen.getByRole("alert")).not.toHaveTextContent(/no pertenece a lima expresa/i);
      expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
    });

    it("treats an unknown error code the same as any other failure", () => {
      render(<AuthErrorMessage error="AlgoQueNoConocemos" />);

      expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
    });

    it("never echoes the raw error code back to the reader", () => {
      render(<AuthErrorMessage error="AlgoQueNoConocemos" />);

      expect(screen.getByRole("alert")).not.toHaveTextContent("AlgoQueNoConocemos");
    });
  });
});
