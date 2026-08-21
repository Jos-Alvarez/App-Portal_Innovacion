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

/** La administradora que mira la pantalla — la topbar dibuja su nombre. */
const USUARIA = { id: 1, correo: "rosa@limaexpresa.pe", nombre: "Rosa Díaz", esAdmin: true };

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
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: USUARIA });
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

  /*
   * The shared bar. It is repeated in every admin page rather than lifted into
   * `app/admin/layout.tsx`, because Next's Router Cache reuses a layout across
   * soft navigations and the bar has to be re-rendered by each page's own guard.
   * Asserting it here is what keeps one of the nine copies from being dropped.
   */
  it("wears the shared topbar, with its way back to the portal", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: USUARIA });

    render(await EnlacesAdminPage());

    expect(screen.getByText("Rosa Díaz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /portal de innovación/i })).toHaveAttribute("href", "/");
  });
});
