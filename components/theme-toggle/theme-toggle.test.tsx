import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./theme-toggle";
import { DARK_ATTRIBUTE, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

/** Runs the head/body inline script exactly as the browser would, before React. */
function runInitScript(): void {
  new Function(THEME_INIT_SCRIPT)();
}

describe("anti-flash init script", () => {
  it("marks the document dark before React renders when dark is persisted", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    runInitScript();

    expect(document.body.getAttribute(DARK_ATTRIBUTE)).toBe("1");
  });

  it("leaves the document light when light is persisted", () => {
    document.body.setAttribute(DARK_ATTRIBUTE, "1");
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    runInitScript();

    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false);
  });

  it("defaults to light when nothing is persisted", () => {
    runInitScript();

    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false);
  });

  it("never throws when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("localStorage blocked");
    });

    expect(() => runInitScript()).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe("<ThemeToggle />", () => {
  it("starts in light mode and offers dark mode unchecked", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("menuitemcheckbox", { name: /modo oscuro/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false);
  });

  it("adopts the theme already persisted in localStorage on mount", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(<ThemeToggle />);

    expect(document.body.getAttribute(DARK_ATTRIBUTE)).toBe("1");
    expect(screen.getByRole("menuitemcheckbox")).toHaveAttribute("aria-checked", "true");
  });

  it("flips the body attribute and persists the choice when clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("menuitemcheckbox"));

    expect(document.body.getAttribute(DARK_ATTRIBUTE)).toBe("1");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("returns to light and persists that too on a second click", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("menuitemcheckbox"));
    await user.click(screen.getByRole("menuitemcheckbox"));

    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  /**
   * `aria-checked` and not `aria-pressed`, which is what this carried while it
   * was a toggle button. A `menuitemcheckbox` reports its state through
   * `aria-checked`; `aria-pressed` on that role is simply ignored, so the swap
   * is the difference between announcing the state and announcing nothing.
   */
  it("reports the active theme through aria-checked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    expect(screen.getByRole("menuitemcheckbox")).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("menuitemcheckbox"));

    expect(screen.getByRole("menuitemcheckbox")).toHaveAttribute("aria-checked", "true");
  });

  /**
   * The label names the SETTING and does not flip with it. As an icon button it
   * announced the destination ("Cambiar a modo claro") because there was no
   * state to announce; as a checkbox a flipping label produces "cambiar a modo
   * claro, marcado", which nobody can parse.
   */
  it("mantiene la etiqueta fija en los dos estados", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    expect(screen.getByRole("menuitemcheckbox", { name: "Modo oscuro" })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitemcheckbox"));

    expect(screen.getByRole("menuitemcheckbox", { name: "Modo oscuro" })).toBeInTheDocument();
  });

  /* El único tab stop del menú es su disparador; a las entradas se llega con las
     flechas. Un `tabIndex` perdido rompe eso sin romper ninguna otra prueba. */
  it("queda fuera del recorrido de tabulación", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("menuitemcheckbox")).toHaveAttribute("tabindex", "-1");
  });
});
