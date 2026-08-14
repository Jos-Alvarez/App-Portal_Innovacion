import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const asignarRecurso = vi.fn();
const revocarRecurso = vi.fn();

vi.mock("./asignaciones-client", () => ({
  asignarRecurso: (...args: unknown[]) => asignarRecurso(...args),
  revocarRecurso: (...args: unknown[]) => revocarRecurso(...args),
}));

import { AsignacionesUsuario, type AsignacionesUsuarioProps } from "./asignaciones-usuario";

/**
 * The screen's own behaviour: what a switch sends, what it shows before and
 * after the server answers, and what it does when the server refuses.
 *
 * The API's rules are NOT re-tested here. Part 1 owns idempotency, the baja
 * asymmetry and the status codes with 125 tests, and `asignaciones-client`
 * owns the verbs and the paths. What is left — and what this item exists to
 * demonstrate — is that a switch never shows a grant the server has not
 * confirmed.
 */

const ENLACE = {
  id: 4,
  nombre: "Portal de Compras",
  descripcion: "Solicitudes de compra",
  url: "https://compras.limaexpresa.pe",
  tipo: "app",
  activo: true,
} as const;

const ENLACE_DE_BAJA = {
  id: 11,
  nombre: "Tablero antiguo",
  descripcion: null,
  url: "https://viejo.limaexpresa.pe",
  tipo: "app",
  activo: false,
} as const;

const PROCESADOR = {
  id: 9,
  nombre: "Maestro de Excel",
  descripcion: null,
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx,csv",
  tamanoMax: 26_214_400,
  entradasMin: 1,
  entradasMax: null,
  tamanoMaxTotal: null,
  salidaEsperada: "zip",
  activo: true,
} as const;

const USUARIO = {
  id: 7,
  nombre: "Ana Quispe",
  correo: "ana.quispe@limaexpresa.pe",
  area: "Operaciones",
  esAdmin: false,
  activo: true,
  enlaces: [] as number[],
  procesadores: [] as number[],
};

function props(overrides: Partial<AsignacionesUsuarioProps> = {}): AsignacionesUsuarioProps {
  return {
    usuario: USUARIO,
    enlaces: [ENLACE, ENLACE_DE_BAJA],
    procesadores: [PROCESADOR],
    ...overrides,
  };
}

function renderPantalla(overrides: Partial<AsignacionesUsuarioProps> = {}) {
  const vista = render(<AsignacionesUsuario {...props(overrides)} />);
  return { user: userEvent.setup(), ...vista };
}

/** A response the test decides when to give, so the in-flight moment is observable. */
function pendiente<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promesa, resolver };
}

function interruptor(nombre: RegExp) {
  return screen.getByRole("switch", { name: nombre });
}

const ENLACE_SWITCH = /acceso al enlace portal de compras/i;
const BAJA_SWITCH = /acceso al enlace tablero antiguo/i;
const PROCESADOR_SWITCH = /acceso al procesador maestro de excel/i;

describe("<AsignacionesUsuario />", () => {
  beforeEach(() => {
    refresh.mockReset();
    asignarRecurso.mockReset().mockResolvedValue({ ok: true, asignado: true });
    revocarRecurso.mockReset().mockResolvedValue({ ok: true, asignado: false });
  });

  it("grants the resource the switch names, for the user whose screen this is", async () => {
    const { user } = renderPantalla();

    await user.click(interruptor(ENLACE_SWITCH));

    expect(asignarRecurso).toHaveBeenCalledWith(7, "enlace", 4);
    expect(revocarRecurso).not.toHaveBeenCalled();
  });

  it("revokes an access the user already holds", async () => {
    const { user } = renderPantalla({ usuario: { ...USUARIO, procesadores: [9] } });

    await user.click(interruptor(PROCESADOR_SWITCH));

    expect(revocarRecurso).toHaveBeenCalledWith(7, "procesador", 9);
  });

  it("confirms the change with a toast and asks the server for the screen again", async () => {
    const { user } = renderPantalla();

    await user.click(interruptor(ENLACE_SWITCH));

    expect(await screen.findByText("Acceso a «Portal de Compras» concedido.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves the switch where it was while the request is still in flight", async () => {
    const { promesa, resolver } = pendiente<{ ok: true; asignado: boolean }>();
    asignarRecurso.mockReturnValue(promesa);
    const { user } = renderPantalla();

    await user.click(interruptor(ENLACE_SWITCH));

    /* The click is an intent, not a fact. Until the server answers, the switch
       shows the last state the server confirmed — which is "off". */
    expect(interruptor(ENLACE_SWITCH)).toHaveAttribute("aria-checked", "false");
    expect(interruptor(ENLACE_SWITCH)).toBeDisabled();
    expect(screen.getByText(/aplicando/i)).toBeInTheDocument();

    resolver({ ok: true, asignado: true });
    expect(await screen.findByText(/concedido/i)).toBeInTheDocument();
  });

  it("moves the switch only once the server has confirmed the grant", async () => {
    const { user } = renderPantalla();

    await user.click(interruptor(ENLACE_SWITCH));

    expect(interruptor(ENLACE_SWITCH)).toHaveAttribute("aria-checked", "true");
    expect(interruptor(ENLACE_SWITCH)).toBeEnabled();
  });

  it("shows what the server confirmed even when it contradicts the click", async () => {
    /* Nothing in part 1 answers this way today, and that is the point: if it
       ever did, the screen would report the row as it IS, not as it was asked
       to be. The intent is never what draws the switch. */
    asignarRecurso.mockResolvedValue({ ok: true, asignado: false });
    const { user } = renderPantalla();

    await user.click(interruptor(ENLACE_SWITCH));

    expect(interruptor(ENLACE_SWITCH)).toHaveAttribute("aria-checked", "false");
    expect(await screen.findByText("Acceso a «Portal de Compras» retirado.")).toBeInTheDocument();
  });

  it("shows the API's refusal as it arrived and leaves the switch exactly as it was", async () => {
    asignarRecurso.mockResolvedValue({
      ok: false,
      mensaje:
        "Ese enlace está dado de baja, así que no puedes darlo de alta a nadie. Puedes quitar accesos antiguos; para concederlos, reactívalo primero.",
    });
    const { user } = renderPantalla();

    await user.click(interruptor(ENLACE_SWITCH));

    expect(
      await screen.findByText(
        "Ese enlace está dado de baja, así que no puedes darlo de alta a nadie. Puedes quitar accesos antiguos; para concederlos, reactívalo primero.",
      ),
    ).toBeInTheDocument();
    /* A failed grant that left the switch on would show an access that does
       not exist — the one thing this screen must never do. */
    expect(interruptor(ENLACE_SWITCH)).toHaveAttribute("aria-checked", "false");
  });

  it("neither confirms nor refreshes when the change did not happen", async () => {
    asignarRecurso.mockResolvedValue({ ok: false, mensaje: "No se pudo." });
    const { user } = renderPantalla();

    await user.click(interruptor(ENLACE_SWITCH));

    expect(await screen.findByText("No se pudo.")).toBeInTheDocument();
    expect(screen.queryByText(/concedido/i)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the network sentence when the server was never reached", async () => {
    asignarRecurso.mockResolvedValue({
      ok: false,
      mensaje: "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.",
    });
    const { user } = renderPantalla();

    await user.click(interruptor(ENLACE_SWITCH));

    expect(
      await screen.findByText(
        "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.",
      ),
    ).toBeInTheDocument();
    expect(interruptor(ENLACE_SWITCH)).toHaveAttribute("aria-checked", "false");
  });

  it("prefers a newer server render over the answer it is holding", async () => {
    const { user, rerender } = renderPantalla();

    await user.click(interruptor(ENLACE_SWITCH));
    expect(interruptor(ENLACE_SWITCH)).toHaveAttribute("aria-checked", "true");

    /* Someone else revoked it; the Server Component read the row again. The
       fresher truth wins over the one this screen was told earlier. */
    rerender(<AsignacionesUsuario {...props({ usuario: { ...USUARIO, enlaces: [] } })} />);

    expect(interruptor(ENLACE_SWITCH)).toHaveAttribute("aria-checked", "false");
  });

  it("stops every other switch while one change is in flight", async () => {
    const { promesa, resolver } = pendiente<{ ok: true; asignado: boolean }>();
    asignarRecurso.mockReturnValue(promesa);
    const { user } = renderPantalla();

    await user.click(interruptor(ENLACE_SWITCH));

    /* One request at a time: a second toggle would race the first, and both
       would land on a screen that cannot yet say what either did. */
    expect(interruptor(PROCESADOR_SWITCH)).toBeDisabled();
    await user.click(interruptor(PROCESADOR_SWITCH));
    expect(asignarRecurso).toHaveBeenCalledTimes(1);

    resolver({ ok: true, asignado: true });
    expect(await screen.findByText(/concedido/i)).toBeInTheDocument();
  });

  it("draws each catalogue with the grants the server reported", () => {
    renderPantalla({ usuario: { ...USUARIO, enlaces: [4], procesadores: [] } });

    expect(interruptor(ENLACE_SWITCH)).toHaveAttribute("aria-checked", "true");
    expect(interruptor(PROCESADOR_SWITCH)).toHaveAttribute("aria-checked", "false");

    const seccionEnlaces = within(screen.getByRole("region", { name: /^enlaces$/i }));
    expect(seccionEnlaces.getByText("1 de 2 asignados")).toBeInTheDocument();
  });

  it("dims a deactivated resource and still lets an old access be taken away", async () => {
    const { user } = renderPantalla({ usuario: { ...USUARIO, enlaces: [11] } });

    const fila = interruptor(BAJA_SWITCH).closest("tr") as HTMLElement;
    /* Dimmed and labelled: the row stays visible because its grant is still
       real, and the reader has to be able to tell it is no longer usable. */
    expect(within(fila).getByText("Tablero antiguo")).toHaveAttribute("data-baja", "true");
    expect(within(fila).getByText("Dado de baja")).toBeInTheDocument();

    /* The API allows exactly this, so the screen must not block it: a grant
       left over from before the baja has to be removable. */
    expect(interruptor(BAJA_SWITCH)).toBeEnabled();
    await user.click(interruptor(BAJA_SWITCH));
    expect(revocarRecurso).toHaveBeenCalledWith(7, "enlace", 11);
  });

  it("does not offer a deactivated resource the user does not already hold", () => {
    renderPantalla();

    expect(interruptor(BAJA_SWITCH)).toBeDisabled();
    expect(
      screen.getByText("Dado de baja: no se puede asignar hasta que se reactive."),
    ).toBeInTheDocument();
  });

  it("says a deactivated person cannot receive new access, and still allows revoking", async () => {
    const { user } = renderPantalla({
      usuario: { ...USUARIO, activo: false, enlaces: [4] },
    });

    expect(
      screen.getByText(
        "Esta persona está dada de baja. Puedes retirarle accesos, pero no concederle nuevos hasta que se reactive.",
      ),
    ).toBeInTheDocument();
    expect(interruptor(PROCESADOR_SWITCH)).toBeDisabled();

    expect(interruptor(ENLACE_SWITCH)).toBeEnabled();
    await user.click(interruptor(ENLACE_SWITCH));
    expect(revocarRecurso).toHaveBeenCalledWith(7, "enlace", 4);
  });

  it("explains an empty enlaces catalogue instead of drawing an empty table", () => {
    renderPantalla({ enlaces: [] });

    expect(
      screen.getByText(
        "Registra enlaces en el catálogo de enlaces y podrás asignarlos desde aquí.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: ENLACE_SWITCH })).not.toBeInTheDocument();
  });

  it("explains an empty procesadores catalogue the same way", () => {
    renderPantalla({ procesadores: [] });

    expect(
      screen.getByText(
        "Registra procesadores en el catálogo de procesadores y podrás asignarlos desde aquí.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: PROCESADOR_SWITCH })).not.toBeInTheDocument();
  });
});
