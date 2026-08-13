import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ForbiddenState } from "./forbidden-state";

describe("<ForbiddenState />", () => {
  it("explains that the Área de Innovación administers access", () => {
    render(<ForbiddenState onBackToPortal={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/el área de innovación administra/i);
  });

  it("sends the reader back to the portal when that action is used", async () => {
    const user = userEvent.setup();
    const onBackToPortal = vi.fn();
    render(<ForbiddenState onBackToPortal={onBackToPortal} />);

    await user.click(screen.getByRole("button", { name: "Volver al portal" }));

    expect(onBackToPortal).toHaveBeenCalledTimes(1);
  });

  it("omits Solicitar acceso while no caller defines what it does", () => {
    render(<ForbiddenState onBackToPortal={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Solicitar acceso" })).toBeNull();
    expect(screen.getByRole("button", { name: "Volver al portal" })).toBeInTheDocument();
  });

  it("offers Solicitar acceso once the caller supplies its behaviour", async () => {
    const user = userEvent.setup();
    const onRequestAccess = vi.fn();
    render(<ForbiddenState onBackToPortal={vi.fn()} onRequestAccess={onRequestAccess} />);

    await user.click(screen.getByRole("button", { name: "Solicitar acceso" }));

    expect(onRequestAccess).toHaveBeenCalledTimes(1);
  });
});
