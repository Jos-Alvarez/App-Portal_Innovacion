import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const buscarPersonas = vi.fn();
const promoverAdministrador = vi.fn();
const revocarAdministrador = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.mock("./administradores-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./administradores-client")>()),
  buscarPersonas: (...args: unknown[]) => buscarPersonas(...args),
  promoverAdministrador: (...args: unknown[]) => promoverAdministrador(...args),
  revocarAdministrador: (...args: unknown[]) => revocarAdministrador(...args),
}));

import { AdministradoresAdmin } from "./administradores-admin";

/**
 * The interactive half of the administrator screen.
 *
 * The three requests are replaced and nothing else: the copy, the state and
 * every decision about what to draw are the real code. What is asserted is what
 * an administrator can see and do — including the two things the API refuses,
 * which this screen must not offer in the first place.
 */

const ANA = {
  id: 7,
  nombre: "Ana Quispe",
  correo: "ana@corp.com",
  area: "TI",
  activo: true,
};

const ROSA = {
  id: 3,
  nombre: "Rosa Díaz",
  correo: "rosa@corp.com",
  area: "Innovación",
  activo: true,
};

const RESULTADO_NUEVA = {
  correo: "beto@corp.com",
  nombre: "Beto Ruiz",
  area: "Legal",
  enElPortal: null,
};

function pintar(props: Partial<Parameters<typeof AdministradoresAdmin>[0]> = {}) {
  return render(
    <AdministradoresAdmin
      administradores={[ANA, ROSA]}
      usuarioActualId={3}
      correoFijado=""
      {...props}
    />,
  );
}

async function buscar(termino = "beto") {
  const usuario = userEvent.setup();

  await usuario.type(screen.getByLabelText(/buscar a una persona/i), termino);
  await usuario.click(screen.getByRole("button", { name: "Buscar" }));

  return usuario;
}

beforeEach(() => {
  vi.clearAllMocks();
  buscarPersonas.mockResolvedValue({ ok: true, origen: "directorio", personas: [RESULTADO_NUEVA] });
  promoverAdministrador.mockResolvedValue({
    ok: true,
    administrador: { id: 9, nombre: "Beto Ruiz", correo: "beto@corp.com", area: "Legal", activo: true },
  });
  revocarAdministrador.mockResolvedValue({ ok: true, administrador: ANA });
});

describe("<AdministradoresAdmin /> — la búsqueda", () => {
  it("no busca con menos caracteres de los que la API acepta", async () => {
    pintar();

    await userEvent.setup().type(screen.getByLabelText(/buscar a una persona/i), "a");

    expect(screen.getByRole("button", { name: "Buscar" })).toBeDisabled();
    expect(buscarPersonas).not.toHaveBeenCalled();
  });

  it("busca el término recortado", async () => {
    pintar();

    await buscar("  beto  ");

    expect(buscarPersonas).toHaveBeenCalledWith("beto");
  });

  it("muestra a quien encontró", async () => {
    pintar();

    await buscar();

    expect(screen.getByText("Beto Ruiz")).toBeInTheDocument();
    expect(screen.getByText("beto@corp.com")).toBeInTheDocument();
  });

  it("no dibuja resultados antes de la primera búsqueda", () => {
    pintar();

    expect(screen.queryByLabelText("Resultados de la búsqueda")).not.toBeInTheDocument();
  });

  it("distingue «nadie coincide» de «todavía no buscaste»", async () => {
    buscarPersonas.mockResolvedValue({ ok: true, origen: "directorio", personas: [] });
    pintar();

    await buscar();

    expect(screen.getByText(/no encontramos a nadie con ese nombre/i)).toBeInTheDocument();
  });

  /**
   * ADR 0009's degradation, said out loud. Without this sentence an empty list
   * reads as "esta persona no trabaja acá", which is the wrong conclusion and
   * the one that ends with somebody asking IT for an account that exists.
   */
  it("avisa cuando los resultados salen solo del portal", async () => {
    buscarPersonas.mockResolvedValue({ ok: true, origen: "portal", personas: [] });
    pintar();

    await buscar();

    expect(screen.getByText(/no pudimos consultar el directorio/i)).toBeInTheDocument();
    expect(screen.getByText(/inicie sesión una vez/i)).toBeInTheDocument();
  });

  it("no dice nada raro cuando sí pudo usar el directorio", async () => {
    pintar();

    await buscar();

    expect(screen.queryByText(/no pudimos consultar el directorio/i)).not.toBeInTheDocument();
  });

  it("muestra el mensaje del servidor cuando la búsqueda falla", async () => {
    buscarPersonas.mockResolvedValue({ ok: false, mensaje: "No pudimos conectar con el servidor." });
    pintar();

    await buscar();

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos conectar con el servidor.");
  });
});

describe("<AdministradoresAdmin /> — la promoción", () => {
  it("promueve por correo, que es lo único que la API acepta", async () => {
    pintar();

    const usuario = await buscar();
    await usuario.click(screen.getByRole("button", { name: /dar el rol de administradora a Beto/i }));

    expect(promoverAdministrador).toHaveBeenCalledWith("beto@corp.com");
  });

  it("confirma con un toast y vuelve a leer la lista del servidor", async () => {
    pintar();

    const usuario = await buscar();
    await usuario.click(screen.getByRole("button", { name: /dar el rol de administradora a Beto/i }));

    expect(screen.getByText(/Beto Ruiz ya es administradora/i)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  /**
   * The results describe the world as it was when the search ran. Patching them
   * with an answer the directory never gave would be inventing data — remembering
   * what THIS screen did is the honest way to stop offering the same promotion.
   */
  it("deja de ofrecer el rol a quien acaba de promover", async () => {
    pintar();

    const usuario = await buscar();
    await usuario.click(screen.getByRole("button", { name: /dar el rol de administradora a Beto/i }));

    expect(
      screen.queryByRole("button", { name: /dar el rol de administradora a Beto/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Ya es administradora")).toBeInTheDocument();
  });

  it("no ofrece el rol a quien ya lo tiene", async () => {
    buscarPersonas.mockResolvedValue({
      ok: true,
      origen: "directorio",
      personas: [{ ...RESULTADO_NUEVA, enElPortal: { id: 9, esAdmin: true, activo: true } }],
    });
    pintar();

    await buscar();

    expect(screen.queryByRole("button", { name: /dar el rol/i })).not.toBeInTheDocument();
    expect(screen.getByText("Ya es administradora")).toBeInTheDocument();
  });

  /* A role the authorization guard refuses on every request is a role granted to nobody. */
  it("no ofrece el rol a una cuenta dada de baja", async () => {
    buscarPersonas.mockResolvedValue({
      ok: true,
      origen: "directorio",
      personas: [{ ...RESULTADO_NUEVA, enElPortal: { id: 9, esAdmin: false, activo: false } }],
    });
    pintar();

    await buscar();

    expect(screen.queryByRole("button", { name: /dar el rol/i })).not.toBeInTheDocument();
    expect(screen.getByText("Cuenta dada de baja")).toBeInTheDocument();
  });

  it("avisa que la persona todavía no entró al portal, y aun así la ofrece", async () => {
    pintar();

    await buscar();

    expect(screen.getByText("Todavía no entró al portal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dar el rol/i })).toBeInTheDocument();
  });

  it("muestra el rechazo del servidor sin tocar la lista", async () => {
    promoverAdministrador.mockResolvedValue({
      ok: false,
      mensaje: "Esa persona ya es administradora del portal.",
    });
    pintar();

    const usuario = await buscar();
    await usuario.click(screen.getByRole("button", { name: /dar el rol/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Esa persona ya es administradora");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("<AdministradoresAdmin /> — la revocación", () => {
  it("pregunta antes de quitar el rol", async () => {
    pintar();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /quitar el rol de administradora a Ana/i }));

    expect(screen.getByText(/¿quitar el rol a «Ana Quispe»\?/i)).toBeInTheDocument();
    expect(revocarAdministrador).not.toHaveBeenCalled();
  });

  it("quita el rol al confirmar y vuelve a leer la lista", async () => {
    pintar();

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /quitar el rol de administradora a Ana/i }));
    await usuario.click(screen.getByRole("button", { name: "Sí, quitar el rol" }));

    expect(revocarAdministrador).toHaveBeenCalledWith(7);
    expect(screen.getByText(/Ana Quispe ya no es administradora/i)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancela sin tocar nada", async () => {
    pintar();

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /quitar el rol de administradora a Ana/i }));
    await usuario.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(revocarAdministrador).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /quitar el rol de administradora a Ana/i })).toBeInTheDocument();
  });

  /** Quitting your own role is the one revocation that changes what you can do next. */
  it("hace una pregunta distinta cuando alguien se quita el rol a sí mismo", async () => {
    pintar();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /quitar el rol de administradora a Rosa/i }));

    expect(screen.getByText(/¿quitarte a ti el rol de administradora\?/i)).toBeInTheDocument();
  });

  it("muestra la regla de mínimo 1 tal como la escribió la API", async () => {
    revocarAdministrador.mockResolvedValue({
      ok: false,
      mensaje: "No puedes quitar el rol: el portal siempre debe tener al menos una persona administradora.",
    });
    pintar();

    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: /quitar el rol de administradora a Ana/i }));
    await usuario.click(screen.getByRole("button", { name: "Sí, quitar el rol" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/al menos una persona administradora/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  /**
   * The login re-promotes this account on every sign-in, so a button here could
   * only ever produce a refusal. Saying so before the click is the whole point.
   */
  it("no ofrece quitar el rol a la cuenta fijada por el entorno", async () => {
    pintar({ correoFijado: "ana@corp.com" });

    expect(
      screen.queryByRole("button", { name: /quitar el rol de administradora a Ana/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Fijada en la configuración")).toBeInTheDocument();
  });

  it("sigue ofreciendo quitar el rol a las demás", async () => {
    pintar({ correoFijado: "ana@corp.com" });

    expect(
      screen.getByRole("button", { name: /quitar el rol de administradora a Rosa/i }),
    ).toBeInTheDocument();
  });
});

describe("<AdministradoresAdmin /> — la lista", () => {
  it("marca a quien está mirando la pantalla", () => {
    pintar();

    const fila = screen.getByText("Rosa Díaz").closest("span");

    expect(within(fila as HTMLElement).getByText("Tú")).toBeInTheDocument();
  });

  it("muestra una cuenta dada de baja que todavía tiene el rol", () => {
    pintar({ administradores: [{ ...ANA, activo: false }] });

    expect(screen.getByText("Dada de baja")).toBeInTheDocument();
  });

  it("escribe el área ausente en lugar de dejar la celda en blanco", () => {
    pintar({ administradores: [{ ...ANA, area: "" }] });

    expect(screen.getByText("Sin área")).toBeInTheDocument();
  });

  /* Unreachable in a healthy portal, but a restored dump can produce it. */
  it("explica cómo vuelve un administrador si la lista quedó vacía", () => {
    pintar({ administradores: [] });

    expect(screen.getByText(/el portal no tiene administradores/i)).toBeInTheDocument();
    expect(screen.getByText(/cuenta de respaldo/i)).toBeInTheDocument();
  });
});
