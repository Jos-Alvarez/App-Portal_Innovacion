import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("<Button />", () => {
  it("reports a click on the label it was given", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Guardar
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stays visible but inert while disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Guardar
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Guardar" });
    await user.click(button);

    expect(button).toBeVisible();
    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not submit the surrounding form by default", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Cancelar</Button>
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the surrounding form when the caller asks for a submit button", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" variant="primary">
          Enviar
        </Button>
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
