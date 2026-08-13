import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "./switch";

describe("<Switch />", () => {
  it("is reachable by its label and reports its state", () => {
    render(<Switch label="Acceso a Analítica" checked onCheckedChange={() => {}} />);

    expect(screen.getByRole("switch", { name: "Acceso a Analítica" })).toBeChecked();
  });

  it("reports the state it is not in yet when it is turned on", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label="Acceso a Analítica" checked={false} onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByRole("switch"));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("reports the state it is not in yet when it is turned off", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label="Acceso a Analítica" checked onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByRole("switch"));

    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("does not move on its own while the caller controls it", async () => {
    const user = userEvent.setup();
    render(<Switch label="Acceso a Analítica" checked={false} onCheckedChange={() => {}} />);

    const control = screen.getByRole("switch");
    await user.click(control);

    expect(control).not.toBeChecked();
  });

  it("keeps its own state when the caller leaves it uncontrolled", async () => {
    const user = userEvent.setup();
    render(<Switch label="Acceso a Analítica" defaultChecked />);

    const control = screen.getByRole("switch");
    expect(control).toBeChecked();

    await user.click(control);

    expect(control).not.toBeChecked();
  });

  it("starts off when neither a value nor a default is given", () => {
    render(<Switch label="Acceso a Analítica" />);

    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("toggles from the keyboard", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label="Acceso a Analítica" onCheckedChange={onCheckedChange} />);

    await user.tab();
    await user.keyboard(" ");

    expect(screen.getByRole("switch")).toHaveFocus();
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("stays visible but inert while disabled", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label="Acceso a Analítica" disabled onCheckedChange={onCheckedChange} />);

    const control = screen.getByRole("switch");
    await user.click(control);

    expect(control).toBeVisible();
    expect(control).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
