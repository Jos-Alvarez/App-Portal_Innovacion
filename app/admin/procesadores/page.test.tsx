import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPageAdmin = vi.fn();
const listarProcesadores = vi.fn();

/* The page renders the client screen, which asks for the router on mount. */
/* La topbar dibuja la navegacion del panel, que lee la ruta actual. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/admin/procesadores",
}));

vi.mock("@/lib/authz", () => ({ guardPageAdmin: () => guardPageAdmin() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/procesadores/repository", () => ({
  listarProcesadores: () => listarProcesadores(),
}));

import ProcesadoresAdminPage from "./page";

/**
 * The page's own two obligations.
 *
 * `lib/authz` is explicit that a layout may decide what to SHOW but never what
 * is REACHABLE, so the check has to be here — and a denial has to stop before
 * the catalogue is read, not merely hide it afterwards. The authorization RULES
 * themselves are not re-tested: `lib/authz` already owns those.
 */

/** La administradora que mira la pantalla — la topbar dibuja su nombre. */
const USUARIA = { id: 1, correo: "rosa@limaexpresa.pe", nombre: "Rosa Díaz", esAdmin: true };

describe("/admin/procesadores", () => {
  beforeEach(() => {
    guardPageAdmin.mockReset();
    listarProcesadores.mockReset().mockResolvedValue([]);
  });

  it("guards itself, and reads nothing when the reader is refused", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await ProcesadoresAdminPage());

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    /* The catalogue never leaves the database for someone not allowed to see it. */
    expect(listarProcesadores).not.toHaveBeenCalled();
  });

  it("shows the whole catalogue to an administrator, bajas included", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: USUARIA });
    listarProcesadores.mockResolvedValue([
      {
        id: 4,
        nombre: "Maestro de Excel",
        descripcion: null,
        claveProcesador: "maestro-excel",
        formatosAceptados: "xlsx,csv",
        tamanoMax: 26_214_400,
        entradasMin: 1,
        entradasMax: null,
        tamanoMaxTotal: null,
        salidaEsperada: "zip",
        activo: false,
      },
    ]);

    render(await ProcesadoresAdminPage());

    expect(screen.getByRole("heading", { name: /catálogo de procesadores/i })).toBeInTheDocument();
    expect(screen.getByText("Maestro de Excel")).toBeInTheDocument();
    expect(screen.getByText("Dado de baja")).toBeInTheDocument();
  });

  /*
   * The shared bar. It is repeated in every admin page rather than lifted into
   * `app/admin/layout.tsx`, because Next's Router Cache reuses a layout across
   * soft navigations and the bar has to be re-rendered by each page's own guard.
   * Asserting it here is what keeps one of the nine copies from being dropped.
   */
  it("wears the shared topbar, with its way back to the portal", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: USUARIA });

    render(await ProcesadoresAdminPage());

    expect(screen.getByText("Rosa Díaz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /portal de innovación/i })).toHaveAttribute("href", "/");
  });
});
