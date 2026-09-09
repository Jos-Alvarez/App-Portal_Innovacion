import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usePathname = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

import { ENLACES_PORTAL, PortalNav } from "./portal-nav";

/**
 * La barra del colaborador: las dos pantallas que el portal es para quien no
 * lo administra.
 *
 * Lo que este archivo tiene que probar es lo mismo que prueba `admin-nav`, con
 * una diferencia que importa: aquí una de las entradas es la RAÍZ, y una regla
 * de prefijos aplicada sin cuidado marcaría «Mis recursos» como actual en cada
 * pantalla del portal — incluida la que no es.
 */

beforeEach(() => {
  usePathname.mockReturnValue("/");
});

describe("<PortalNav />", () => {
  it("dibuja las dos pantallas del colaborador y ninguna del panel", () => {
    render(<PortalNav />);

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(ENLACES_PORTAL).toHaveLength(2);
  });

  it("dice «Mis recursos», la palabra que la administración usa para lo mismo", () => {
    render(<PortalNav />);

    const nav = within(screen.getByRole("navigation", { name: "Portal" }));
    expect(nav.getByRole("link", { name: "Mis recursos" })).toHaveAttribute("href", "/");
    expect(nav.getByRole("link", { name: "Buzón de sugerencias" })).toHaveAttribute(
      "href",
      "/sugerencias",
    );
  });

  it("marca la pantalla que se está leyendo, y solo esa", () => {
    usePathname.mockReturnValue("/sugerencias");

    render(<PortalNav />);

    expect(screen.getByRole("link", { name: "Buzón de sugerencias" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    /* `aria-current="false"` es un valor válido que algunos lectores anuncian:
       en las demás la marca no está, no está en falso. */
    expect(screen.getByRole("link", { name: "Mis recursos" })).not.toHaveAttribute("aria-current");
  });

  it("la raíz se marca a sí misma y no a todo el portal", () => {
    /* Si el prefijo se aplicara sin cuidado, «/» encabezaría cada ruta y
       «Mis recursos» quedaría resaltado incluso dentro del buzón. */
    usePathname.mockReturnValue("/sugerencias");

    render(<PortalNav />);

    expect(screen.getByRole("link", { name: "Mis recursos" })).not.toHaveAttribute("aria-current");
  });

  it("ninguna entrada se apropia de una pantalla que no es suya", () => {
    usePathname.mockReturnValue("/procesadores/4");

    render(<PortalNav />);

    for (const { etiqueta } of ENLACES_PORTAL) {
      expect(screen.getByRole("link", { name: etiqueta })).not.toHaveAttribute("aria-current");
    }
  });

  it("sin ruta conocida no inventa una actual", () => {
    usePathname.mockReturnValue(null);

    render(<PortalNav />);

    for (const { etiqueta } of ENLACES_PORTAL) {
      expect(screen.getByRole("link", { name: etiqueta })).not.toHaveAttribute("aria-current");
    }
  });
});
