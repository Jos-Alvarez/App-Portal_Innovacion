import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

/* La nav del panel es un componente cliente y lee la ruta actual; acá no hay
   router. Su propio archivo de pruebas cubre el resaltado. */
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { Topbar } from "./topbar";

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

  /**
   * El tema y la salida ya no viven sueltos en la barra: cuelgan del menú de
   * sesión, y lo que la barra garantiza es que ese menú esté ahí para cualquiera.
   * Lo que hay adentro lo cubre `session-menu.test.tsx`.
   */
  it("le da a cualquiera el menú de sesión, cerrado", () => {
    render(<Topbar usuario={COLABORADORA} />);

    const disparador = screen.getByRole("button", { name: "Ana Quispe" });

    expect(disparador).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  /* Las cuatro pantallas de todos los días, alcanzables sin escribir una URL.
     Eran cinco hasta que Enlaces y Procesadores se fundieron en Catálogo. */
  it("ofrece las cuatro pantallas de administración", () => {
    render(<Topbar usuario={ADMINISTRADORA} />);

    const nav = screen.getByRole("navigation", { name: "Administración" });

    expect(within(nav).getAllByRole("link")).toHaveLength(4);

    for (const etiqueta of ["Catálogo", "Asignaciones", "Sugerencias", "Analítica"]) {
      expect(within(nav).getByRole("link", { name: etiqueta })).toBeInTheDocument();
    }
  });

  /**
   * La puerta de administradores ya NO está en la barra. El PRD la pide "junto al
   * de cerrar sesión" y ahí es donde está ahora: dentro del menú de sesión, que
   * `session-menu.test.tsx` cubre. Que vuelva a aparecer acá sería la regresión.
   */
  it("no deja la puerta de administradores en la barra", () => {
    render(<Topbar usuario={ADMINISTRADORA} />);

    expect(screen.queryByRole("link", { name: /administradores/i })).not.toBeInTheDocument();
  });

  /* Mostrar no es autorizar: cada `/admin/*` corre su propio guard igual. */
  it("no le muestra ninguna al colaborador", () => {
    render(<Topbar usuario={COLABORADORA} />);

    expect(screen.queryByRole("navigation", { name: "Administración" })).not.toBeInTheDocument();
  });

  /**
   * El orden de la fila: primero la nav del panel, después el grupo de sesión
   * contra el borde opuesto.
   *
   * Afirmado por posición en el DOM y no por CSS, porque el orden de lectura que
   * sigue un lector de pantalla es el del DOM y ninguna propiedad `order` lo está
   * simulando.
   */
  it("pone la nav antes del menú de sesión", () => {
    render(<Topbar usuario={ADMINISTRADORA} />);

    const disparador = screen.getByRole("button", { name: "Rosa Díaz" });
    const nav = screen.getByRole("navigation", { name: "Administración" });

    expect(nav.compareDocumentPosition(disparador) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nav.nextElementSibling).toBe(disparador.parentElement);
  });

  /**
   * Con el menú cerrado, ni el tema ni la salida están en el DOM. Es lo que
   * separa un menú de un grupo de controles escondido con CSS: si estuvieran
   * renderizados, un lector de pantalla los recorrería igual.
   */
  it("no deja el tema ni la salida sueltos en la barra", () => {
    render(<Topbar usuario={COLABORADORA} />);

    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitemcheckbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Cerrar sesión")).not.toBeInTheDocument();
  });

  it("lleva el logo de Lima Expresa, que el PRD pide dentro del portal", () => {
    const { container } = render(<Topbar usuario={COLABORADORA} />);

    expect(container.querySelector("img")).toBeInTheDocument();
  });
});

