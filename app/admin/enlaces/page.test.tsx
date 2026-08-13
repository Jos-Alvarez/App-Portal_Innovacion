import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPageAdmin = vi.fn();
const listarEnlaces = vi.fn();

/* The page renders the client screen, which asks for the router on mount. */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/lib/authz", () => ({ guardPageAdmin: () => guardPageAdmin() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/enlaces/repository", () => ({ listarEnlaces: () => listarEnlaces() }));

import EnlacesAdminPage from "./page";

/**
 * The page's own two obligations.
 *
 * `lib/authz` is explicit that a layout may decide what to SHOW but never what
 * is REACHABLE, so the check has to be here — and a denial has to stop before
 * the catalogue is read, not merely hide it afterwards. The authorization RULES
 * themselves are not re-tested: `lib/authz` already owns those.
 */

describe("/admin/enlaces", () => {
  beforeEach(() => {
    guardPageAdmin.mockReset();
    listarEnlaces.mockReset().mockResolvedValue([]);
  });

  it("guards itself, and reads nothing when the reader is refused", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await EnlacesAdminPage());

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    /* The catalogue never leaves the database for someone not allowed to see it. */
    expect(listarEnlaces).not.toHaveBeenCalled();
  });

  it("shows the whole catalogue to an administrator, bajas included", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: { id: 1, esAdmin: true } });
    listarEnlaces.mockResolvedValue([
      {
        id: 7,
        nombre: "Facturación electrónica",
        descripcion: null,
        url: "https://facturacion.limaexpresa.pe",
        tipo: "app",
        activo: false,
      },
    ]);

    render(await EnlacesAdminPage());

    expect(screen.getByRole("heading", { name: /catálogo de enlaces/i })).toBeInTheDocument();
    expect(screen.getByText("Facturación electrónica")).toBeInTheDocument();
    expect(screen.getByText("Dado de baja")).toBeInTheDocument();
  });
});
