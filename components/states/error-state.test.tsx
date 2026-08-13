import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorState } from "./error-state";

describe("<ErrorState />", () => {
  it("reports the failure through an alert, in plain language", () => {
    render(<ErrorState onRetry={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar la información");
  });

  it("shows the specific message the view supplies instead of the default", () => {
    render(<ErrorState description="No pudimos cargar el catálogo." onRetry={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar el catálogo.");
  });

  it("invokes the retry callback when Reintentar is pressed", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("lets the reader retry more than once", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    const retry = screen.getByRole("button", { name: "Reintentar" });
    await user.click(retry);
    await user.click(retry);

    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});
