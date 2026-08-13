import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "./empty-state";

describe("<EmptyState />", () => {
  it("shows the title the view gives it", () => {
    render(<EmptyState title="Aún no tienes aplicaciones asignadas" />);

    expect(
      screen.getByRole("heading", { name: "Aún no tienes aplicaciones asignadas" }),
    ).toBeInTheDocument();
  });

  it("explains by default who assigns access", () => {
    render(<EmptyState title="Sin aplicaciones" />);

    expect(screen.getByRole("status")).toHaveTextContent(/el área de innovación asigna/i);
  });

  it("replaces the explanation when the view supplies its own", () => {
    render(<EmptyState title="Sin ideas" description="Todavía nadie ha enviado una idea." />);

    expect(screen.getByRole("status")).toHaveTextContent("Todavía nadie ha enviado una idea.");
  });

  it("omits the contact exit when the caller supplies no handler", () => {
    render(<EmptyState title="Sin aplicaciones" />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("invokes the contact handler when the exit is used", async () => {
    const user = userEvent.setup();
    const onContact = vi.fn();
    render(<EmptyState title="Sin aplicaciones" onContact={onContact} />);

    await user.click(screen.getByRole("button", { name: "Contactar al Área de Innovación" }));

    expect(onContact).toHaveBeenCalledTimes(1);
  });
});
