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
  it("starts in light mode and offers to activate dark mode", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: /modo oscuro/i })).toBeInTheDocument();
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false);
  });

  it("adopts the theme already persisted in localStorage on mount", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(<ThemeToggle />);

    expect(document.body.getAttribute(DARK_ATTRIBUTE)).toBe("1");
    expect(screen.getByRole("button", { name: /modo claro/i })).toBeInTheDocument();
  });

  it("flips the body attribute and persists the choice when clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /modo oscuro/i }));

    expect(document.body.getAttribute(DARK_ATTRIBUTE)).toBe("1");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("returns to light and persists that too on a second click", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /modo oscuro/i }));
    await user.click(screen.getByRole("button", { name: /modo claro/i }));

    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("reports the active theme through aria-pressed", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});
