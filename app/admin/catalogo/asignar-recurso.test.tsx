import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const asignarRecurso = vi.fn();
const revocarRecurso = vi.fn();

vi.mock("../asignaciones/asignaciones-client", () => ({
  asignarRecurso: (...args: unknown[]) => asignarRecurso(...args),
  revocarRecurso: (...args: unknown[]) => revocarRecurso(...args),
}));

const buscarColaboradores = vi.fn();
const registrarPersona = vi.fn();

vi.mock("./personas-client", () => ({
  buscarColaboradores: (...args: unknown[]) => buscarColaboradores(...args),
  registrarPersona: (...args: unknown[]) => registrarPersona(...args),
}));

import { AsignarRecurso } from "./asignar-recurso";

/**
 * The resource-first assignment dialog on its own.
 *
 * WHAT THIS FILE HAS TO PROVE. Three things, and the third is the reason the
 * feature exists: that the picker searches the COMPANY and not only the portal;
 * that somebody who has never signed in gets an account created before the
 * grant, so the grant has an id to hang on; and that no row ever shows a
 * membership the server did not confirm.
 *
 * Both transports are mocked. `asignaciones-client.test.ts` already pins the
 * verbs and the paths of the grant, and `personas-client` is the browser's side
 * of a route with its own suite — re-driving `fetch` from here would test those
 * twice and this file not at all. What matters here is WHICH calls happen, in
 * WHICH order, with which arguments.
 */

const RECURSO = { clase: "enlace", id: 7, nombre: "Facturación electrónica", activo: true } as const;

/** One row of `listarUsuarios`, trimmed to what the dialog reads. */
interface UsuarioFijo {
  id: number;
  nombre: string;
  correo: string;
  area: string;
  esAdmin: boolean;
  activo: boolean;
  enlacesAsignados: number;
  procesadoresAsignados: number;
}

function usuario(id: number, nombre: string, correo: string, activo = true): UsuarioFijo {
  return {
    id,
    nombre,
    correo,
    area: "Innovación",
    esAdmin: false,
    activo,
    enlacesAsignados: 0,
    procesadoresAsignados: 0,
  };
}

const USUARIOS: UsuarioFijo[] = [
  usuario(1, "Ana Ríos", "ana.rios@limaexpresa.pe"),
  usuario(2, "Beto Sosa", "beto.sosa@limaexpresa.pe"),
  usuario(3, "Caro Vega", "caro.vega@limaexpresa.pe", false),
];

/** Alguien que el directorio conoce y que nunca abrió el portal. */
const SHEYLA = {
  correo: "sheyla.paz@limaexpresa.pe",
  nombre: "Sheyla Paz",
  area: "Operaciones",
  enElPortal: null,
};

function renderDialogo(props: Partial<Parameters<typeof AsignarRecurso>[0]> = {}) {
  const onCambio = vi.fn();
  render(
    <AsignarRecurso
      recurso={RECURSO}
      usuarios={USUARIOS}
      asignados={[1]}
      onCambio={onCambio}
      {...props}
    />,
  );
  return { user: userEvent.setup(), onCambio };
}

/** Step into the collaborator picker — its own panel behind the band's action. */
async function abrirSelector(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^agregar$/i }));
}

describe("<AsignarRecurso />", () => {
  beforeEach(() => {
    asignarRecurso.mockReset().mockResolvedValue({ ok: true, asignado: true });
    revocarRecurso.mockReset().mockResolvedValue({ ok: true, asignado: false });
    buscarColaboradores.mockReset().mockResolvedValue({ ok: true, origen: "directorio", personas: [] });
    registrarPersona.mockReset();
  });

  it("lista a quien tiene el recurso y ofrece quitárselo", () => {
    renderDialogo();

    const conAcceso = within(screen.getByRole("region", { name: /personas con acceso/i }));
    expect(conAcceso.getByText("Ana Ríos")).toBeInTheDocument();
    expect(conAcceso.getByRole("button", { name: /quitar el acceso de ana ríos/i })).toBeEnabled();
  });

  it("cuando nadie lo tiene, lo dice en vez de mostrar una lista vacía", () => {
    renderDialogo({ asignados: [] });

    expect(screen.getByText(/todavía nadie tiene este recurso/i)).toBeInTheDocument();
  });

  it("quita el acceso con el par (usuario, recurso) y refleja lo que respondió el servidor", async () => {
    const { user, onCambio } = renderDialogo();

    await user.click(screen.getByRole("button", { name: /quitar el acceso de ana ríos/i }));

    expect(revocarRecurso).toHaveBeenCalledWith(1, "enlace", 7);
    expect(await screen.findByText(/acceso de ana ríos retirado/i)).toBeInTheDocument();
    expect(onCambio).toHaveBeenCalledOnce();
  });

  it("sin escribir nada, el selector ya muestra el padrón del portal y no pide nada", async () => {
    const { user } = renderDialogo();

    await abrirSelector(user);

    const padron = within(screen.getByRole("region", { name: /^colaboradores$/i }));
    expect(padron.getByText("Ana Ríos")).toBeInTheDocument();
    expect(padron.getByText("Beto Sosa")).toBeInTheDocument();
    expect(buscarColaboradores).not.toHaveBeenCalled();
  });

  it("al escribir dos letras busca en la empresa, no solo en el padrón", async () => {
    buscarColaboradores.mockResolvedValue({
      ok: true,
      origen: "directorio",
      personas: [SHEYLA],
    });
    const { user } = renderDialogo();

    await abrirSelector(user);
    await user.type(screen.getByLabelText(/buscar por nombre o correo/i), "sheyla");

    expect(await screen.findByText("Sheyla Paz")).toBeInTheDocument();
    expect(buscarColaboradores).toHaveBeenCalled();
    /* Una sola petición para toda la palabra: el type-ahead va con retardo. */
    expect(buscarColaboradores.mock.calls.at(-1)?.[0]).toBe("sheyla");
  });

  it("a quien nunca entró le crea la cuenta y recién ahí le concede el acceso", async () => {
    buscarColaboradores.mockResolvedValue({ ok: true, origen: "directorio", personas: [SHEYLA] });
    registrarPersona.mockResolvedValue({
      ok: true,
      usuario: { id: 42, nombre: "Sheyla Paz", correo: SHEYLA.correo, area: "Operaciones", esAdmin: false, activo: true },
    });
    const { user, onCambio } = renderDialogo();

    await abrirSelector(user);
    await user.type(screen.getByLabelText(/buscar por nombre o correo/i), "sheyla");
    await user.click(await screen.findByRole("button", { name: /dar acceso a sheyla paz/i }));

    expect(registrarPersona).toHaveBeenCalledWith({
      correo: SHEYLA.correo,
      nombre: "Sheyla Paz",
      area: "Operaciones",
    });
    /* El id que devolvió el alta, no uno inventado. */
    expect(asignarRecurso).toHaveBeenCalledWith(42, "enlace", 7);
    expect(onCambio).toHaveBeenCalledOnce();
  });

  it("tras agregarla, la fila deja de ofrecer el botón y dice que ya tiene acceso", async () => {
    buscarColaboradores.mockResolvedValue({ ok: true, origen: "directorio", personas: [SHEYLA] });
    registrarPersona.mockResolvedValue({
      ok: true,
      usuario: { id: 42, nombre: "Sheyla Paz", correo: SHEYLA.correo, area: "Operaciones", esAdmin: false, activo: true },
    });
    const { user } = renderDialogo();

    await abrirSelector(user);
    await user.type(screen.getByLabelText(/buscar por nombre o correo/i), "sheyla");
    await user.click(await screen.findByRole("button", { name: /dar acceso a sheyla paz/i }));

    /* La búsqueda la trajo SIN cuenta, y ese resultado no cambia solo. Si la
       fila siguiera leyendo ese `null`, pediría agregar lo que ya está puesto
       y el lector volvería a hacer clic. */
    expect(await screen.findByText(/ya tiene acceso/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dar acceso a sheyla paz/i }),
    ).not.toBeInTheDocument();
  });

  it("no vuelve a crear la cuenta en un segundo intento sobre la misma persona", async () => {
    buscarColaboradores.mockResolvedValue({ ok: true, origen: "directorio", personas: [SHEYLA] });
    registrarPersona.mockResolvedValue({
      ok: true,
      usuario: { id: 42, nombre: "Sheyla Paz", correo: SHEYLA.correo, area: "Operaciones", esAdmin: false, activo: true },
    });
    /* La concesión falla, así que la fila vuelve a ofrecer el botón — pero la
       cuenta YA existe y crearla otra vez sería pedirle al API algo resuelto. */
    asignarRecurso.mockResolvedValue({ ok: false, mensaje: "No se pudo aplicar el cambio." });
    const { user } = renderDialogo();

    await abrirSelector(user);
    await user.type(screen.getByLabelText(/buscar por nombre o correo/i), "sheyla");
    await user.click(await screen.findByRole("button", { name: /dar acceso a sheyla paz/i }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: /dar acceso a sheyla paz/i }));

    expect(registrarPersona).toHaveBeenCalledOnce();
    expect(asignarRecurso).toHaveBeenNthCalledWith(2, 42, "enlace", 7);
  });

  it("dice que esa persona todavía no entró al portal", async () => {
    buscarColaboradores.mockResolvedValue({ ok: true, origen: "directorio", personas: [SHEYLA] });
    const { user } = renderDialogo();

    await abrirSelector(user);
    await user.type(screen.getByLabelText(/buscar por nombre o correo/i), "sheyla");

    expect(await screen.findByText(/aún no ha entrado al portal/i)).toBeInTheDocument();
  });

  it("a quien ya tiene cuenta no le crea otra: asigna con el id que ya existe", async () => {
    const { user } = renderDialogo();

    await abrirSelector(user);
    await user.click(screen.getByRole("button", { name: /dar acceso a beto sosa/i }));

    expect(registrarPersona).not.toHaveBeenCalled();
    expect(asignarRecurso).toHaveBeenCalledWith(2, "enlace", 7);
  });

  it("si el directorio no se pudo consultar, lo dice en vez de fingir que no existe", async () => {
    buscarColaboradores.mockResolvedValue({
      ok: true,
      origen: "portal",
      personas: [{ ...SHEYLA, nombre: "Ana Ríos", correo: "ana.rios@limaexpresa.pe", enElPortal: { id: 1, esAdmin: false, activo: true } }],
    });
    const { user } = renderDialogo();

    await abrirSelector(user);
    await user.type(screen.getByLabelText(/buscar por nombre o correo/i), "ana");

    expect(await screen.findByText(/no pudimos consultar el directorio de la empresa/i)).toBeInTheDocument();
  });

  it("quien ya tiene acceso no trae botón sino la nota", async () => {
    const { user } = renderDialogo();

    await abrirSelector(user);

    expect(screen.queryByRole("button", { name: /dar acceso a ana ríos/i })).not.toBeInTheDocument();
    expect(screen.getByText(/ya tiene acceso/i)).toBeInTheDocument();
  });

  it("a una persona dada de baja no se le ofrece el botón, se dice por qué", async () => {
    const { user } = renderDialogo();

    await abrirSelector(user);

    expect(screen.queryByRole("button", { name: /dar acceso a caro vega/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/dada de baja/i).length).toBeGreaterThan(0);
  });

  it("con el recurso dado de baja, deja quitar pero no agregar", async () => {
    const { user } = renderDialogo({ recurso: { ...RECURSO, activo: false } });

    expect(screen.getAllByText(/este recurso está dado de baja/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /quitar el acceso de ana ríos/i })).toBeEnabled();

    await abrirSelector(user);
    expect(screen.getByRole("button", { name: /dar acceso a beto sosa/i })).toBeDisabled();
  });

  it("si el alta de la cuenta falla, no concede nada y muestra la negativa", async () => {
    buscarColaboradores.mockResolvedValue({ ok: true, origen: "directorio", personas: [SHEYLA] });
    registrarPersona.mockResolvedValue({
      ok: false,
      mensaje: "Esa dirección no es del dominio corporativo.",
    });
    const { user, onCambio } = renderDialogo();

    await abrirSelector(user);
    await user.type(screen.getByLabelText(/buscar por nombre o correo/i), "sheyla");
    await user.click(await screen.findByRole("button", { name: /dar acceso a sheyla paz/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esa dirección no es del dominio corporativo.",
    );
    expect(asignarRecurso).not.toHaveBeenCalled();
    expect(onCambio).not.toHaveBeenCalled();
  });

  it("muestra la negativa de la asignación tal como llegó y no toca la lista", async () => {
    asignarRecurso.mockResolvedValue({ ok: false, mensaje: "No se pudo aplicar el cambio." });
    const { user, onCambio } = renderDialogo();

    await abrirSelector(user);
    await user.click(screen.getByRole("button", { name: /dar acceso a beto sosa/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo aplicar el cambio.");
    expect(onCambio).not.toHaveBeenCalled();
  });
});
