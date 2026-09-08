import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./modal";

/**
 * The keyboard contract, which is the only reason this component has code.
 *
 * `<dialog>` would have given all of it by the platform, and `modal.tsx`
 * explains why it is not used here — so what the platform would have
 * guaranteed has to be asserted instead: Escape closes, Tab stays inside, and
 * the focus goes in on open and comes back out on close.
 */

function abrir(children = <button type="button">Primero</button>) {
  const onClose = vi.fn();

  function Pantalla() {
    return (
      <>
        <button type="button">Abrir</button>
        <Modal title="Nuevo enlace de app / agente" onClose={onClose}>
          {children}
        </Modal>
      </>
    );
  }

  const utils = render(<Pantalla />);
  return { user: userEvent.setup(), onClose, ...utils };
}

describe("<Modal />", () => {
  it("is a dialog named by the title it draws", () => {
    abrir();

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("dialog", { name: "Nuevo enlace de app / agente" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nuevo enlace de app / agente" }),
    ).toBeInTheDocument();
  });

  it("moves the keyboard into the card as soon as it opens", () => {
    abrir();

    /* Si el foco se quedara en el disparador, el teclado seguiría fuera de algo
       que está pintado encima de toda la página. */
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const { user, onClose } = abrir();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the overlay beside the card is pressed", async () => {
    const { user, onClose, container } = abrir();

    /* Un clic al lado de la tarjeta tiraría lo que se haya escrito en el
       formulario que este diálogo sostiene. Escape y «Cancelar» son las salidas. */
    await user.click(container.firstChild as HTMLElement);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps Tab inside the card, wrapping in both directions", async () => {
    const { user } = abrir(
      <>
        <button type="button">Primero</button>
        <button type="button">Último</button>
      </>,
    );

    const primero = screen.getByRole("button", { name: "Primero" });
    const ultimo = screen.getByRole("button", { name: "Último" });

    await user.tab();
    expect(ultimo).toHaveFocus();

    /* Del último al primero, sin pasar por «Abrir», que está detrás del overlay. */
    await user.tab();
    expect(primero).toHaveFocus();

    await user.tab({ shift: true });
    expect(ultimo).toHaveFocus();
  });

  it("gives focus back to whatever opened it", async () => {
    function Pantalla() {
      const [abierto, setAbierto] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setAbierto(true)}>
            Abrir
          </button>
          {abierto ? (
            <Modal title="Nuevo enlace" onClose={() => setAbierto(false)}>
              <button type="button">Dentro</button>
            </Modal>
          ) : null}
        </>
      );
    }

    const user = userEvent.setup();
    render(<Pantalla />);

    const disparador = screen.getByRole("button", { name: "Abrir" });
    await user.click(disparador);
    expect(screen.getByRole("button", { name: "Dentro" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(disparador).toHaveFocus();
  });
});
