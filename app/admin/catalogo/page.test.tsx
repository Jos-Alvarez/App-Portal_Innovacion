import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPageAdmin = vi.fn();
const listarEnlaces = vi.fn();
const listarProcesadores = vi.fn();
const asignadosPorRecurso = vi.fn();
const listarUsuarios = vi.fn();

/* La pantalla cliente pide el router al montarse. */
/* La topbar dibuja la navegacion del panel, que lee la ruta actual. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/admin/catalogo",
}));

vi.mock("@/lib/authz", () => ({ guardPageAdmin: () => guardPageAdmin() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/enlaces/repository", () => ({ listarEnlaces: () => listarEnlaces() }));
vi.mock("@/lib/procesadores/repository", () => ({
  listarProcesadores: () => listarProcesadores(),
}));
vi.mock("@/lib/asignaciones/repository", () => ({
  asignadosPorRecurso: (...args: unknown[]) => asignadosPorRecurso(...args),
}));
vi.mock("@/lib/usuarios/repository", () => ({ listarUsuarios: () => listarUsuarios() }));

import CatalogoAdminPage from "./page";

/**
 * The page's own two obligations, plus the one the merge added.
 *
 * `lib/authz` is explicit that a layout may decide what to SHOW but never what
 * is REACHABLE, so the check has to be here — and a denial has to stop before
 * either catalogue is read, not merely hide it afterwards. The authorization
 * RULES themselves are not re-tested: `lib/authz` already owns those.
 *
 * The third obligation is that BOTH reads happen: a page that quietly served
 * only the enlaces would look perfectly healthy on screen.
 */

/** La administradora que mira la pantalla — la topbar dibuja su nombre. */
const USUARIA = { id: 1, correo: "rosa@limaexpresa.pe", nombre: "Rosa Díaz", esAdmin: true };

const ENLACE = {
  id: 7,
  nombre: "Facturación electrónica",
  descripcion: null,
  url: "https://facturacion.limaexpresa.pe",
  tipo: "app",
  activo: false,
};

const PROCESADOR = {
  id: 4,
  nombre: "Maestro de Excel",
  descripcion: null,
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx",
  tamanoMax: 26_214_400,
  entradasMin: 1,
  entradasMax: null,
  tamanoMaxTotal: null,
  salidaEsperada: "archivo",
  activo: true,
};

describe("/admin/catalogo", () => {
  beforeEach(() => {
    guardPageAdmin.mockReset();
    listarEnlaces.mockReset().mockResolvedValue([]);
    listarProcesadores.mockReset().mockResolvedValue([]);
    asignadosPorRecurso.mockReset().mockResolvedValue(new Map());
    listarUsuarios.mockReset().mockResolvedValue([]);
  });

  it("guards itself, and reads nothing when the reader is refused", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await CatalogoAdminPage());

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    /* Ninguno de los dos catálogos sale de la base para quien no puede verlo. */
    expect(listarEnlaces).not.toHaveBeenCalled();
    expect(listarProcesadores).not.toHaveBeenCalled();
    expect(asignadosPorRecurso).not.toHaveBeenCalled();
    expect(listarUsuarios).not.toHaveBeenCalled();
  });

  it("shows both catalogues to an administrator, bajas included", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: USUARIA });
    listarEnlaces.mockResolvedValue([ENLACE]);
    listarProcesadores.mockResolvedValue([PROCESADOR]);
    asignadosPorRecurso
      .mockResolvedValueOnce(new Map([[7, [11, 12]]]))
      .mockResolvedValueOnce(new Map());

    render(await CatalogoAdminPage());

    expect(screen.getByRole("heading", { name: /catálogo de recursos/i })).toBeInTheDocument();
    /* Las dos tablas de la base, en una sola lista en pantalla. */
    expect(screen.getByText("Facturación electrónica")).toBeInTheDocument();
    expect(screen.getByText("Maestro de Excel")).toBeInTheDocument();
    expect(screen.getByText("Dado de baja")).toBeInTheDocument();
    /* El conteo de asignados de cada tabla llega hasta su fila. */
    expect(screen.getByText("2 usuarios")).toBeInTheDocument();
    expect(screen.getByText("0 usuarios")).toBeInTheDocument();
  });

  /*
   * La barra compartida. Se repite en cada página del panel en vez de subirla a
   * `app/admin/layout.tsx`, porque el Router Cache de Next reutiliza un layout
   * entre navegaciones suaves y la barra tiene que volver a dibujarse bajo el
   * guard de cada página. Afirmarlo aquí es lo que evita perder una de las copias.
   */
  it("wears the shared topbar, whose brand is a title and not a door", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: true, usuario: USUARIA });

    render(await CatalogoAdminPage());

    expect(screen.getByText("Rosa Díaz")).toBeInTheDocument();
    /* La salida vive detrás del menú de sesión; lo que la pantalla garantiza
       es que ese menú esté montado. `session-menu.test.tsx` cubre su interior. */
    expect(screen.getByRole("button", { name: "Rosa Díaz" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
    /* La marca es un título, no una puerta: `/` ya no es la casa de quien
       administra — lo redirige al panel — y la barra le da sus cuatro
       pantallas. `components/topbar/topbar.tsx` lo explica. */
    expect(screen.getByText("Portal de Innovación")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /portal de innovación/i })).not.toBeInTheDocument();
  });
});
