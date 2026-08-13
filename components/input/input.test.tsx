import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Input } from "./input";

describe("<Input />", () => {
  it("is reachable by its label", () => {
    render(<Input label="Nombre del enlace" />);

    expect(screen.getByLabelText("Nombre del enlace")).toBeInTheDocument();
  });

  it("gives each field its own label association", () => {
    render(
      <>
        <Input label="Nombre" />
        <Input label="Dirección" />
      </>,
    );

    expect(screen.getByLabelText("Nombre")).not.toBe(screen.getByLabelText("Dirección"));
  });

  it("reports every keystroke to the caller", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input label="Nombre" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText("Nombre"), "abc");

    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("shows the value the caller controls and never drifts from it", async () => {
    const user = userEvent.setup();
    render(<Input label="Nombre" value="Portal" onChange={() => {}} />);

    const field = screen.getByLabelText("Nombre");
    expect(field).toHaveValue("Portal");

    await user.type(field, "x");

    expect(field).toHaveValue("Portal");
  });

  it("keeps its own value when the caller leaves it uncontrolled", async () => {
    const user = userEvent.setup();
    render(<Input label="Nombre" defaultValue="Portal" />);

    const field = screen.getByLabelText("Nombre");
    await user.type(field, "!");

    expect(field).toHaveValue("Portal!");
  });

  it("announces the error and links it to the field", () => {
    render(<Input label="Dirección" error="Escribe una dirección que empiece por https://" />);

    const field = screen.getByLabelText("Dirección");
    expect(field).toHaveAccessibleDescription("Escribe una dirección que empiece por https://");
    expect(field).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escribe una dirección que empiece por https://",
    );
  });

  it("carries no error state while the value is acceptable", () => {
    render(<Input label="Dirección" />);

    expect(screen.getByLabelText("Dirección")).toBeValid();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses input while disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input label="Nombre" disabled onChange={onChange} />);

    await user.type(screen.getByLabelText("Nombre"), "abc");

    expect(onChange).not.toHaveBeenCalled();
  });
});
