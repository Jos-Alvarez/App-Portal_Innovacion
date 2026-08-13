import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EnlaceForm } from "./enlace-form";

/**
 * What the form hands upwards.
 *
 * The validation RULES are not re-tested here — `lib/enlaces/schema.test.ts`
 * already owns the scheme allowlist, the lengths and the trimming, and this
 * form runs that very schema. What is tested instead is this layer's own two
 * jobs: that the value reaching the API is the schema's OUTPUT rather than the
 * raw keystrokes, and that a refusal stops the round trip and lands on the
 * field the reader has to fix.
 */

const ENLACE = {
  id: 7,
  nombre: "Facturación electrónica",
  descripcion: "Emisión de comprobantes",
  url: "https://facturacion.limaexpresa.pe",
  tipo: "app",
  activo: true,
} as const;

const onSubmit = vi.fn();
const onCancelar = vi.fn();

function renderForm(enlace: typeof ENLACE | null = null) {
  render(<EnlaceForm enlace={enlace} enviando={false} onSubmit={onSubmit} onCancelar={onCancelar} />);
  return userEvent.setup();
}

const campo = {
  nombre: () => screen.getByLabelText(/nombre/i),
  url: () => screen.getByLabelText(/dirección web/i),
  descripcion: () => screen.getByLabelText(/descripción/i),
  tipo: () => screen.getByLabelText(/tipo/i),
};

describe("<EnlaceForm />", () => {
  beforeEach(() => {
    onSubmit.mockReset();
    onCancelar.mockReset();
  });

  it("submits what the shared schema produced, not what was typed", async () => {
    const user = renderForm();

    /* Padding on both fields, and a description left blank on purpose. */
    await user.type(campo.nombre(), "  Tablero de obras  ");
    await user.type(campo.url(), "  https://obras.limaexpresa.pe  ");
    await user.selectOptions(campo.tipo(), "agente");
    await user.click(screen.getByRole("button", { name: /agregar enlace/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      nombre: "Tablero de obras",
      /* Blank collapses to null, so no screen has to treat "" and NULL alike. */
      descripcion: null,
      url: "https://obras.limaexpresa.pe",
      tipo: "agente",
    });
  });

  it("opens already filled in with the enlace being edited", () => {
    renderForm(ENLACE);

    expect(campo.nombre()).toHaveValue("Facturación electrónica");
    expect(campo.url()).toHaveValue("https://facturacion.limaexpresa.pe");
    expect(campo.descripcion()).toHaveValue("Emisión de comprobantes");
    expect(campo.tipo()).toHaveValue("app");
    expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeInTheDocument();
  });

  it("stops an address the API would refuse and says so on that field", async () => {
    const user = renderForm();

    await user.type(campo.nombre(), "Tablero de obras");
    await user.type(campo.url(), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: /agregar enlace/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    /* The very sentence the API would have answered with, from the same mapper. */
    expect(
      screen.getByText(
        "Escribe una dirección web válida que empiece por http:// o https://, de hasta 2048 caracteres.",
      ),
    ).toBeInTheDocument();
    expect(campo.url()).toHaveAttribute("aria-invalid", "true");
  });

  it("lets an edit started by mistake be abandoned", async () => {
    const user = renderForm(ENLACE);

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it("offers nothing to cancel when there is no edit in progress", () => {
    renderForm();

    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
  });
});
