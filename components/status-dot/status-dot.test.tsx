import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusDot } from "./status-dot";

describe("<StatusDot />", () => {
  it("renders its label", () => {
    render(<StatusDot tone="ok">Activo</StatusDot>);

    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("exposes only the label to assistive tech, never the dot", () => {
    const { container } = render(<StatusDot tone="danger">Inactivo</StatusDot>);

    // The dot carries the same meaning the label already states, so announcing
    // it twice would be noise.
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(container.textContent).toBe("Inactivo");
  });

  it("falls back to the neutral tone when none is given", () => {
    const { container } = render(<StatusDot>Sin definir</StatusDot>);

    expect(container.firstElementChild).toHaveAttribute("data-tone", "neutral");
  });

  it("carries the requested tone", () => {
    const { container } = render(<StatusDot tone="agent">Agente</StatusDot>);

    expect(container.firstElementChild).toHaveAttribute("data-tone", "agent");
  });
});
