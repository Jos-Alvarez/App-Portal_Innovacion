import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

/* La nav del panel es un componente cliente y lee la ruta actual; acá no hay
   router. Su propio archivo de pruebas cubre el resaltado. */
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { RUTA_ADMINISTRADORES, Topbar } from "./topbar";

/**
 * The shared topbar item #17 extracted, and the one decision it makes: whether
 * to draw the administrator door.
 *
 * That decision is about SHOWING, never about REACHING. `lib/authz/index.ts`
 * allows a component to hide an admin link and forbids it from being the only
 * thing deciding access — every `/admin/*` page and route guards itself, which
 * is what the page tests cover. So what is asserted here is what a reader sees,
 * and the fact that hiding the button hides nothing else.
 */

const COLABORADORA = { nombre: "Ana Quispe", esAdmin: false };
const ADMINISTRADORA = { nombre: "Rosa Díaz", esAdmin: true };

describe("<Topbar />", () => {
  it("muestra el nombre que el guard leyó en esta petición", () => {
    render(<Topbar usuario={COLABORADORA} />);

    expect(screen.getByText("Ana Quispe")).toBeInTheDocument();
  });

  it("lleva la marca del portal", () => {
    render(<Topbar usuario={COLABORADORA} />);

    expect(screen.getByText("Portal de Innovación")).toBeInTheDocument();
  });

  /**
   * The way home, and the reason the admin screens can wear this bar: before it
   * they had no route back to the portal at all — `/admin/enlaces` reached from
   * a bookmark left the reader with the browser's back button and nothing else.
   */
  it("vuelve al portal desde el logo y la marca, que son un solo enlace", () => {
    render(<Topbar usuario={COLABORADORA} />);

    const inicio = screen.getByRole("link", { name: /portal de innovación/i });

    expect(inicio).toHaveAttribute("href", "/");
    expect(within(inicio).getByRole("img")).toBeInTheDocument();
  });

  it("deja el cambio de tema al alcance de cualquiera", () => {
    render(<Topbar usuario={COLABORADORA} />);

    expect(screen.getByRole("button", { name: /modo (oscuro|claro)/i })).toBeInTheDocument();
  });

  it("ofrece cerrar sesión a cualquiera", () => {
    render(<Topbar usuario={COLABORADORA} />);

    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  /* PRD: "un botón ubicado junto al de cerrar sesión, visible solo para administradores". */
  it("no le muestra la puerta de administradores a un colaborador", () => {
    render(<Topbar usuario={COLABORADORA} />);

    expect(screen.queryByRole("link", { name: /administradores/i })).not.toBeInTheDocument();
  });

  it("se la muestra a una administradora", () => {
    render(<Topbar usuario={ADMINISTRADORA} />);

    expect(screen.getByRole("link", { name: "Administradores" })).toHaveAttribute(
      "href",
      RUTA_ADMINISTRADORES,
    );
  });

  /* Las seis pantallas del panel, alcanzables sin escribir una URL a mano. */
  it("ofrece las seis pantallas de administración", () => {
    render(<Topbar usuario={ADMINISTRADORA} />);

    const nav = screen.getByRole("navigation", { name: "Administración" });

    expect(within(nav).getAllByRole("link")).toHaveLength(6);

    for (const etiqueta of [
      "Enlaces",
      "Procesadores",
      "Asignaciones",
      "Sugerencias",
      "Analítica",
      "Administradores",
    ]) {
      expect(within(nav).getByRole("link", { name: etiqueta })).toBeInTheDocument();
    }
  });

  /* Mostrar no es autorizar: cada `/admin/*` corre su propio guard igual. */
  it("no le muestra ninguna de las seis a un colaborador", () => {
    render(<Topbar usuario={COLABORADORA} />);

    expect(screen.queryByRole("navigation", { name: "Administración" })).not.toBeInTheDocument();
  });

  /**
   * The PRD places the entry BESIDE the way out, and it still is: the nav ends on
   * Administradores and the nav itself is the last thing before sign-out. Keeping
   * sign-out last means the way out does not move when the nav appears or
   * disappears.
   *
   * Asserted through the DOM and not through the array's order, because that
   * order is exactly what a well-meaning alphabetical sort would change.
   */
  it("deja Administradores junto a cerrar sesión, y cerrar sesión al final", () => {
    render(<Topbar usuario={ADMINISTRADORA} />);

    const enlace = screen.getByRole("link", { name: "Administradores" });
    const salir = screen.getByRole("button", { name: /cerrar sesión/i });
    const nav = screen.getByRole("navigation", { name: "Administración" });

    expect(enlace.compareDocumentPosition(salir) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nav.lastElementChild).toBe(enlace);
    expect(nav.nextElementSibling).toBe(salir);
  });

  it("lleva el logo de Lima Expresa, que el PRD pide dentro del portal", () => {
    const { container } = render(<Topbar usuario={COLABORADORA} />);

    expect(container.querySelector("img")).toBeInTheDocument();
  });
});
