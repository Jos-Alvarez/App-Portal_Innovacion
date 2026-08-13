import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const crearEnlace = vi.fn();
const editarEnlace = vi.fn();
const darDeBajaEnlace = vi.fn();
const restaurarEnlace = vi.fn();

vi.mock("./enlaces-client", () => ({
  crearEnlace: (...args: unknown[]) => crearEnlace(...args),
  editarEnlace: (...args: unknown[]) => editarEnlace(...args),
  darDeBajaEnlace: (...args: unknown[]) => darDeBajaEnlace(...args),
  restaurarEnlace: (...args: unknown[]) => restaurarEnlace(...args),
}));

import { EnlacesAdmin } from "./enlaces-admin";

/**
 * The screen's own behaviour: what each action sends, what the reader is told,
 * and when the server list is asked for again.
 *
 * The transport is mocked on purpose. `enlaces-client.test.ts` already pins the
 * verbs and the paths, so re-driving `fetch` from here would test that file
 * twice and this one not at all.
 */

const ACTIVO = {
  id: 7,
  nombre: "Facturación electrónica",
  descripcion: "Emisión de comprobantes",
  url: "https://facturacion.limaexpresa.pe",
  tipo: "app",
  activo: true,
} as const;

const DE_BAJA = {
  id: 9,
  nombre: "Asistente de contratos",
  descripcion: null,
  url: "https://contratos.limaexpresa.pe",
  tipo: "agente",
  activo: false,
} as const;

function renderAdmin(enlaces: readonly (typeof ACTIVO | typeof DE_BAJA)[] = [ACTIVO, DE_BAJA]) {
  render(<EnlacesAdmin enlaces={enlaces} />);
  return userEvent.setup();
}

async function llenarAlta(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nombre/i), "Tablero de obras");
  await user.type(screen.getByLabelText(/dirección web/i), "https://obras.limaexpresa.pe");
  await user.click(screen.getByRole("button", { name: /agregar enlace/i }));
}

describe("<EnlacesAdmin />", () => {
  beforeEach(() => {
    refresh.mockReset();
    crearEnlace.mockReset().mockResolvedValue({ ok: true, enlace: ACTIVO });
    editarEnlace.mockReset().mockResolvedValue({ ok: true, enlace: ACTIVO });
    darDeBajaEnlace.mockReset().mockResolvedValue({ ok: true, enlace: { ...ACTIVO, activo: false } });
    restaurarEnlace.mockReset().mockResolvedValue({ ok: true, enlace: { ...DE_BAJA, activo: true } });
  });

  it("confirms an alta with a toast and asks the server for the updated list", async () => {
    const user = renderAdmin();

    await llenarAlta(user);

    expect(crearEnlace).toHaveBeenCalledWith({
      nombre: "Tablero de obras",
      descripcion: null,
      url: "https://obras.limaexpresa.pe",
      tipo: "app",
    });
    expect(await screen.findByText("Enlace agregado al catálogo.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the API's refusal exactly as it arrived, and leaves the list alone", async () => {
    crearEnlace.mockResolvedValue({
      ok: false,
      mensaje: "Ya existe un enlace con ese nombre. Elige otro para que se distingan en el portal.",
    });
    const user = renderAdmin();

    await llenarAlta(user);

    expect(
      await screen.findByText(
        "Ya existe un enlace con ese nombre. Elige otro para que se distingan en el portal.",
      ),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("saves an edit against the row the reader picked", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /editar facturación electrónica/i }));
    const nombre = screen.getByLabelText(/nombre/i);
    await user.clear(nombre);
    await user.type(nombre, "Facturación");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(editarEnlace).toHaveBeenCalledWith(7, {
      nombre: "Facturación",
      descripcion: "Emisión de comprobantes",
      url: "https://facturacion.limaexpresa.pe",
      tipo: "app",
    });
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("asks before taking an enlace down", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /dar de baja facturación electrónica/i }));

    expect(darDeBajaEnlace).not.toHaveBeenCalled();
    expect(screen.getByText(/¿dar de baja «facturación electrónica»\?/i)).toBeInTheDocument();
  });

  it("takes it down once the question is answered, and confirms it", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /dar de baja facturación electrónica/i }));
    await user.click(screen.getByRole("button", { name: /sí, dar de baja/i }));

    expect(darDeBajaEnlace).toHaveBeenCalledWith(7);
    expect(await screen.findByText("Enlace dado de baja.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("puts a deactivated enlace back, which destroys nothing and so asks nothing", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /restaurar asistente de contratos/i }));

    expect(restaurarEnlace).toHaveBeenCalledWith(9);
    expect(await screen.findByText("Enlace restaurado.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("makes the condition of every row legible without reading the actions", () => {
    renderAdmin();

    /* Scoped to the table: the form's own <option> list names the types too. */
    const catalogo = within(screen.getByRole("table"));

    expect(catalogo.getByText("Activo")).toBeInTheDocument();
    expect(catalogo.getByText("Dado de baja")).toBeInTheDocument();
    expect(catalogo.getByText("Agente de IA")).toBeInTheDocument();
    expect(catalogo.getByText("Aplicación")).toBeInTheDocument();
  });

  it("opens a catalogue address in a new tab without handing it this one", () => {
    renderAdmin();

    const enlace = screen.getByRole("link", { name: /facturacion\.limaexpresa\.pe/i });

    expect(enlace).toHaveAttribute("target", "_blank");
    /* Without noopener the destination can rewrite the portal's own tab. */
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("explains an empty catalogue instead of drawing an empty table", () => {
    renderAdmin([]);

    expect(screen.getByText(/todavía no hay enlaces/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
