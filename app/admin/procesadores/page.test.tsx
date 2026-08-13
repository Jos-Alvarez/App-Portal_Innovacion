import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPageAdmin = vi.fn();
const listarProcesadores = vi.fn();

/* The page renders the client screen, which asks for the router on mount. */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: { id: 1, esAdmin: true } });
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
});
