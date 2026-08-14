import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPageAdmin = vi.fn();
const listarUsuarios = vi.fn();

vi.mock("@/lib/authz", () => ({ guardPageAdmin: () => guardPageAdmin() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/usuarios/repository", () => ({ listarUsuarios: () => listarUsuarios() }));

import AsignacionesPage from "./page";

/**
 * The picker's own obligations: guard itself, and say something useful when
 * there is nobody to assign to.
 *
 * `lib/authz` is explicit that a layout may decide what to SHOW but never what
 * is REACHABLE, so the check has to be here — and a denial has to stop before
 * the accounts are read, not merely hide them afterwards. The authorization
 * RULES themselves are not re-tested: `lib/authz` already owns those.
 */

const ANA = {
  id: 7,
  nombre: "Ana Quispe",
  correo: "ana.quispe@limaexpresa.pe",
  area: "Operaciones",
  esAdmin: false,
  activo: true,
  enlacesAsignados: 2,
  procesadoresAsignados: 1,
};

describe("/admin/asignaciones", () => {
  beforeEach(() => {
    guardPageAdmin.mockReset();
    listarUsuarios.mockReset().mockResolvedValue([]);
  });

  it("guards itself, and reads nobody when the reader is refused", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await AsignacionesPage());

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    expect(listarUsuarios).not.toHaveBeenCalled();
  });

  it("gives every account its own assignment screen to open", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: { id: 1, esAdmin: true } });
    listarUsuarios.mockResolvedValue([ANA]);

    render(await AsignacionesPage());

    expect(screen.getByRole("link", { name: /ana quispe/i })).toHaveAttribute(
      "href",
      "/admin/asignaciones/7",
    );
  });

  it("says how much each person already holds, and which accounts are not ordinary ones", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: { id: 1, esAdmin: true } });
    listarUsuarios.mockResolvedValue([
      ANA,
      {
        id: 8,
        nombre: "Beto Ríos",
        correo: "beto.rios@limaexpresa.pe",
        area: "",
        esAdmin: true,
        activo: false,
        enlacesAsignados: 0,
        procesadoresAsignados: 0,
      },
    ]);

    render(await AsignacionesPage());

    expect(screen.getByText("2 enlaces · 1 procesador")).toBeInTheDocument();
    /* An account with nothing reads as a sentence, never as "0 · 0". */
    expect(screen.getByText("Sin accesos asignados")).toBeInTheDocument();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByText("Dada de baja")).toBeInTheDocument();
    /* Entra ID does not always report a department. */
    expect(screen.getByText("Sin área")).toBeInTheDocument();
  });

  it("explains that accounts appear on their own, because no screen creates one", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: { id: 1, esAdmin: true } });
    listarUsuarios.mockResolvedValue([]);

    render(await AsignacionesPage());

    expect(screen.getByText("Todavía no hay personas en el portal")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Las cuentas se crean solas la primera vez que alguien entra al portal con su correo corporativo. Pide a esa persona que inicie sesión una vez y aparecerá aquí para asignarle accesos.",
      ),
    ).toBeInTheDocument();
  });
});
