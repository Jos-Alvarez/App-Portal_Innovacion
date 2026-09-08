import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPageAdmin = vi.fn();
const listarAdministradores = vi.fn();

/* La mitad cliente pide el router al montarse; la navegación no es de lo que va este archivo. */
/* La topbar dibuja la navegacion del panel, que lee la ruta actual. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/admin/administradores",
}));

vi.mock("@/lib/authz", () => ({ guardPageAdmin: () => guardPageAdmin() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/admins/repository", () => ({
  listarAdministradores: (...args: unknown[]) => listarAdministradores(...args),
}));

import AdministradoresPage, { dynamic } from "./page";

/**
 * The server half of the administrator screen: it guards itself, it reads only
 * for a reader it accepted, and it hands the client half what only the server
 * knows.
 *
 * The authorization rules are not re-tested — `lib/authz` owns those — and
 * neither is the repository. What is asserted here is the wiring only this page
 * can get wrong, and one thing that matters more here than anywhere else: the
 * guard is what makes the PRD's "ningún colaborador puede acceder" true, since
 * the topbar button only decides what is SHOWN.
 */

const ADMINISTRADORA = {
  id: 3,
  correo: "rosa@corp.com",
  nombre: "Rosa Díaz",
  esAdmin: true,
};

const FILA = {
  id: 7,
  nombre: "Ana Quispe",
  correo: "ana@corp.com",
  area: "TI",
  activo: true,
};

describe("/admin/administradores", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    guardPageAdmin.mockReset();
    listarAdministradores.mockReset().mockResolvedValue([FILA]);
  });

  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("se protege a sí misma y no lee nada cuando rechaza al lector", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await AdministradoresPage());

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    expect(listarAdministradores).not.toHaveBeenCalled();
  });

  /* No basta con tener sesión: esta pantalla es exclusiva del administrador. */
  it("exige el guard de administrador, no el de sesión", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: ADMINISTRADORA });

    render(await AdministradoresPage());

    expect(guardPageAdmin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Gestión de administradores" })).toBeInTheDocument();
  });

  it("lista a quienes ya tienen el rol", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: ADMINISTRADORA });

    render(await AdministradoresPage());

    expect(screen.getByText("Ana Quispe")).toBeInTheDocument();
    expect(screen.getByText("ana@corp.com")).toBeInTheDocument();
  });

  it("marca a quien está mirando la pantalla", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: ADMINISTRADORA });
    listarAdministradores.mockResolvedValue([FILA, { ...FILA, id: 3, nombre: "Rosa Díaz" }]);

    render(await AdministradoresPage());

    expect(screen.getByText("Tú")).toBeInTheDocument();
  });

  /**
   * The client component cannot see the server's environment at all, so the
   * pinned account has to arrive as a prop or the screen would offer a button
   * whose only outcome is a refusal.
   */
  it("le pasa a la pantalla la cuenta de respaldo del entorno", async () => {
    vi.stubEnv("ADMIN_EMAIL", "ANA@corp.com");
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: ADMINISTRADORA });

    render(await AdministradoresPage());

    expect(screen.getByText("Fijada en la configuración")).toBeInTheDocument();
  });

  it("no fija a nadie cuando ADMIN_EMAIL no está configurado", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: ADMINISTRADORA });

    render(await AdministradoresPage());

    expect(screen.queryByText("Fijada en la configuración")).not.toBeInTheDocument();
  });

  it("dice en la cabecera cuál es la regla dura del portal", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: ADMINISTRADORA });

    render(await AdministradoresPage());

    expect(screen.getByText(/al menos una persona administradora/i)).toBeInTheDocument();
  });

  /*
   * The shared bar. It is repeated in every admin page rather than lifted into
   * `app/admin/layout.tsx`, because Next's Router Cache reuses a layout across
   * soft navigations and the bar has to be re-rendered by each page's own guard.
   * Asserting it here is what keeps one of the nine copies from being dropped.
   */
  it("lleva la topbar compartida, con su camino de vuelta al portal", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: ADMINISTRADORA });

    render(await AdministradoresPage());

    expect(screen.getByText("Rosa Díaz")).toBeInTheDocument();
    /* La salida vive detrás del menú de sesión; lo que la pantalla garantiza
       es que ese menú esté montado. `session-menu.test.tsx` cubre su interior. */
    expect(screen.getByRole("button", { name: "Rosa Díaz" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
    expect(screen.getByRole("link", { name: /portal de innovación/i })).toHaveAttribute("href", "/");
  });
});
