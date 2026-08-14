import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPageAdmin = vi.fn();
const leerUsuarioConAsignaciones = vi.fn();
const listarEnlaces = vi.fn();
const listarProcesadores = vi.fn();

/* The page renders the client screen, which asks for the router on mount. */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/lib/authz", () => ({ guardPageAdmin: () => guardPageAdmin() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/usuarios/repository", () => ({
  leerUsuarioConAsignaciones: (...args: unknown[]) => leerUsuarioConAsignaciones(...args),
}));
vi.mock("@/lib/enlaces/repository", () => ({ listarEnlaces: () => listarEnlaces() }));
vi.mock("@/lib/procesadores/repository", () => ({ listarProcesadores: () => listarProcesadores() }));

import AsignacionesDeUsuarioPage from "./page";

/**
 * The screen of one person: guard, identifier, and the three reads that make
 * up a grant — the account, and both catalogues it can be granted from.
 */

const ENLACE = {
  id: 4,
  nombre: "Portal de Compras",
  descripcion: null,
  url: "https://compras.limaexpresa.pe",
  tipo: "app",
  activo: true,
};

const USUARIO = {
  id: 7,
  nombre: "Ana Quispe",
  correo: "ana.quispe@limaexpresa.pe",
  area: "Operaciones",
  esAdmin: false,
  activo: true,
  enlaces: [4],
  procesadores: [],
};

function contexto(usuarioId: string) {
  return { params: Promise.resolve({ usuarioId }) };
}

describe("/admin/asignaciones/[usuarioId]", () => {
  beforeEach(() => {
    guardPageAdmin.mockReset().mockResolvedValue({ allowed: true, usuario: { id: 1, esAdmin: true } });
    leerUsuarioConAsignaciones.mockReset().mockResolvedValue(USUARIO);
    listarEnlaces.mockReset().mockResolvedValue([ENLACE]);
    listarProcesadores.mockReset().mockResolvedValue([]);
  });

  it("guards itself, and reads nothing when the reader is refused", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await AsignacionesDeUsuarioPage(contexto("7")));

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    expect(leerUsuarioConAsignaciones).not.toHaveBeenCalled();
    expect(listarEnlaces).not.toHaveBeenCalled();
  });

  it("shows the person and their accesses, with both catalogues to choose from", async () => {
    render(await AsignacionesDeUsuarioPage(contexto("7")));

    expect(leerUsuarioConAsignaciones).toHaveBeenCalledWith({}, 7);
    expect(screen.getByRole("heading", { name: "Ana Quispe" })).toBeInTheDocument();
    expect(screen.getByText("ana.quispe@limaexpresa.pe")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /acceso al enlace portal de compras/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("says the person is gone instead of drawing an empty screen", async () => {
    leerUsuarioConAsignaciones.mockResolvedValue(null);

    render(await AsignacionesDeUsuarioPage(contexto("404")));

    expect(screen.getByText("Esa persona ya no está en el portal")).toBeInTheDocument();
    /* No point reading two catalogues nobody can be assigned from. */
    expect(listarEnlaces).not.toHaveBeenCalled();
  });

  it("refuses an identifier that is not one, without asking the database", async () => {
    render(await AsignacionesDeUsuarioPage(contexto("no-soy-un-id")));

    expect(screen.getByText("Esa persona ya no está en el portal")).toBeInTheDocument();
    expect(leerUsuarioConAsignaciones).not.toHaveBeenCalled();
  });
});
