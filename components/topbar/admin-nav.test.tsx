import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usePathname = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

import { AdminNav, ENLACES_ADMIN, esRutaActual } from "./admin-nav";

/**
 * La navegación del panel: las seis pantallas de `/admin/*` y cuál de ellas se
 * está leyendo.
 *
 * WHAT IS NOT TESTED HERE. Whether these screens are REACHABLE — that is
 * `lib/authz`'s and each page's own guard, and this bar decides nothing about
 * it. `topbar.test.tsx` owns the placement of the nav inside the bar and the
 * fact that a collaborator never sees it.
 */

beforeEach(() => {
  usePathname.mockReset().mockReturnValue("/admin/enlaces");
});

describe("esRutaActual", () => {
  it("reconoce la ruta exacta", () => {
    expect(esRutaActual("/admin/enlaces", "/admin/enlaces")).toBe(true);
  });

  /*
   * `/admin/asignaciones/7` es una pantalla propia del ítem #7. Sin el prefijo,
   * un administrador editando los accesos de alguien vería la barra sin nada
   * resaltado, como si estuviera fuera del panel.
   */
  it("reconoce una pantalla hija como parte de su sección", () => {
    expect(esRutaActual("/admin/asignaciones", "/admin/asignaciones/7")).toBe(true);
  });

  /*
   * El corte tiene que ser en la barra y no en el texto: si no,
   * `/admin/enlaces-viejos` — o cualquier ruta futura que empiece igual —
   * resaltaría Enlaces.
   */
  it("no confunde una ruta que solo empieza parecido", () => {
    expect(esRutaActual("/admin/enlaces", "/admin/enlaces-viejos")).toBe(false);
  });

  it("no resalta nada fuera del panel", () => {
    expect(esRutaActual("/admin/enlaces", "/")).toBe(false);
  });

  /* `usePathname` puede no tener valor todavía; eso no es una ruta. */
  it("tolera no saber en qué ruta está", () => {
    expect(esRutaActual("/admin/enlaces", null)).toBe(false);
  });
});

describe("<AdminNav />", () => {
  it("dibuja una entrada por pantalla del panel", () => {
    render(<AdminNav />);

    expect(screen.getAllByRole("link")).toHaveLength(ENLACES_ADMIN.length);
    expect(ENLACES_ADMIN).toHaveLength(6);
  });

  it("apunta cada entrada a su ruta", () => {
    render(<AdminNav />);

    for (const { href, etiqueta } of ENLACES_ADMIN) {
      expect(screen.getByRole("link", { name: etiqueta })).toHaveAttribute("href", href);
    }
  });

  /* Item #17 dejó escrita la condición: un conjunto de entradas pide `aria-current`. */
  it("marca con aria-current la pantalla que se está leyendo, y solo esa", () => {
    usePathname.mockReturnValue("/admin/analitica");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Analítica" })).toHaveAttribute("aria-current", "page");

    for (const etiqueta of ["Enlaces", "Procesadores", "Asignaciones", "Sugerencias"]) {
      expect(screen.getByRole("link", { name: etiqueta })).not.toHaveAttribute("aria-current");
    }
  });

  /*
   * `aria-current="false"` es un valor válido que algunos lectores de pantalla
   * anuncian igual, así que en las demás el atributo no existe en vez de valer
   * "false".
   */
  it("omite el atributo en las demás en vez de ponerlo en false", () => {
    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Sugerencias" })).not.toHaveAttribute("aria-current");
  });

  it("resalta la sección desde una pantalla hija", () => {
    usePathname.mockReturnValue("/admin/asignaciones/7");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Asignaciones" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("se anuncia como la navegación de administración", () => {
    render(<AdminNav />);

    expect(screen.getByRole("navigation", { name: "Administración" })).toBeInTheDocument();
  });

  /*
   * El PRD pide la entrada de Administradores "junto al de cerrar sesión", y la
   * nav va justo antes de ese botón: la última entrada es la que queda al lado.
   * Ordenar esta lista alfabéticamente rompería esa línea del PRD en silencio.
   */
  it("deja Administradores al final de la lista", () => {
    expect(ENLACES_ADMIN.at(-1)?.href).toBe("/admin/administradores");
  });

  /* Prefijos disjuntos: ninguna ruta puede resaltar dos entradas a la vez. */
  it("no tiene dos entradas que puedan coincidir con la misma ruta", () => {
    for (const { href } of ENLACES_ADMIN) {
      const coincidencias = ENLACES_ADMIN.filter((otra) => esRutaActual(otra.href, href));

      expect(coincidencias).toHaveLength(1);
    }
  });
});
