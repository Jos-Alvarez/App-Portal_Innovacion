import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterChip, StatusChip } from "./chip";

describe("<FilterChip />", () => {
  it("exposes whether it is the active filter", () => {
    render(
      <>
        <FilterChip label="Todos" selected onSelect={() => {}} />
        <FilterChip label="Agentes" onSelect={() => {}} />
      </>,
    );

    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Agentes" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("asks the filter bar to select it when used", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FilterChip label="Agentes" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Agentes" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("still reports a click while it is already the active filter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FilterChip label="Todos" selected onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Todos" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("stays visible but inert while disabled", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FilterChip label="Agentes" disabled onSelect={onSelect} />);

    const chip = screen.getByRole("button", { name: "Agentes" });
    await user.click(chip);

    expect(chip).toBeVisible();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("<StatusChip />", () => {
  it("shows the state it was given", () => {
    render(<StatusChip tone="warn">En revisión</StatusChip>);

    expect(screen.getByText("En revisión")).toBeInTheDocument();
  });

  it("carries its semantic tone so the palette can follow the state", () => {
    render(
      <>
        <StatusChip tone="ok">Aprobada</StatusChip>
        <StatusChip tone="danger">Rechazada</StatusChip>
        <StatusChip tone="navy">Implementada</StatusChip>
      </>,
    );

    expect(screen.getByText("Aprobada")).toHaveAttribute("data-tone", "ok");
    expect(screen.getByText("Rechazada")).toHaveAttribute("data-tone", "danger");
    expect(screen.getByText("Implementada")).toHaveAttribute("data-tone", "navy");
  });

  it("falls back to the neutral tone, the one DESIGN.md gives to 'pendiente'", () => {
    render(<StatusChip>Pendiente</StatusChip>);

    expect(screen.getByText("Pendiente")).toHaveAttribute("data-tone", "neutral");
  });

  it("is read as text, not as a control", () => {
    render(<StatusChip tone="agent">Agente IA</StatusChip>);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
