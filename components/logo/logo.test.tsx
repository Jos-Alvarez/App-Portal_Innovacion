import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo, LOGO_SIZE_LOGIN, LOGO_SIZE_TOPBAR } from "./logo";

function logo() {
  return screen.getByRole("img", { name: "Lima Expresa" });
}

describe("<Logo />", () => {
  it("names the brand for anyone who cannot see it", () => {
    render(<Logo />);

    expect(logo()).toBeInTheDocument();
  });

  it("draws the login lockup at the 132px DESIGN.md fixes", () => {
    render(<Logo size={LOGO_SIZE_LOGIN} />);

    expect(logo()).toHaveAttribute("width", "132");
    expect(logo()).toHaveAttribute("height", "99");
  });

  it("draws the topbar lockup at the 58px DESIGN.md fixes", () => {
    render(<Logo size={LOGO_SIZE_TOPBAR} />);

    expect(logo()).toHaveAttribute("width", "58");
    expect(logo()).toHaveAttribute("height", "44");
  });

  it("reserves the box at the login size when no size is asked for", () => {
    render(<Logo />);

    expect(logo()).toHaveAttribute("width", "132");
    expect(logo()).toHaveAttribute("height", "99");
  });

  it("keeps the 4:3 lockup at any other size the shell asks for", () => {
    render(<Logo size={200} />);

    expect(logo()).toHaveAttribute("width", "200");
    expect(logo()).toHaveAttribute("height", "150");
  });

  it("serves the single asset the design system ships, in both themes", () => {
    render(<Logo />);

    /* One file, adapted by CSS — DESIGN.md derives the dark appearance from
       this same PNG instead of shipping a second asset. */
    expect(logo().getAttribute("src")).toContain("logo");
  });

  it("defers loading unless the caller says the logo is above the fold", () => {
    render(<Logo />);

    expect(logo()).toHaveAttribute("loading", "lazy");
  });

  it("stops deferring once the caller says the logo is above the fold", () => {
    render(<Logo preload />);

    /* Next drops the attribute entirely when the image is preloaded, which
       leaves the browser default — eager. */
    expect(logo()).not.toHaveAttribute("loading");
  });
});
