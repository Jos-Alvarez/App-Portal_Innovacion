import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

const usePathname = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

import { inicialesDe, RUTA_ADMINISTRADORES, SessionMenu } from "./session-menu";

/**
 * The session menu — the trigger, the panel, and the keyboard contract a
 * `role="menu"` signs up for.
 *
 * WHAT IS ASSERTED HERE IS THE MENU, NOT ITS ENTRIES. Whether the theme actually
 * flips and whether signing out reaches `/login` belong to
 * `theme-toggle.test.tsx` and `sign-out-button.test.tsx`, which own that
 * behaviour. Repeating it here would mean two files failing for one bug and
 * neither of them naming it.
 *
 * The keyboard cases are the reason this file is long. A menu that opens on
 * click and does nothing else still LOOKS right in a screenshot — the failure is
 * invisible until someone reaches it without a mouse, which is exactly the kind
 * of regression a test has to catch instead of a reader.
 */

const NOMBRE = "Rosa Díaz";

beforeEach(() => {
  usePathname.mockReset().mockReturnValue("/");
});

/**
 * El disparador, por su nombre accesible COMPLETO.
 *
 * Lleva el nombre y el rol, que es exactamente lo que pinta: el disco de
 * iniciales y la flecha son decoración y están `aria-hidden`, pero el rol es
 * información nueva y WCAG 2.5.3 pide que la etiqueta visible esté contenida en
 * el nombre accesible. Buscarlo entero es lo que afirma esa regla.
 */
function disparador() {
  return screen.getByRole("button", { name: new RegExp(NOMBRE) });
}

/**
 * The panel's entries in DOM order — both roles, because the theme switch is a
 * `menuitemcheckbox` and the way out is a `menuitem`, and the arrow keys must
 * treat them as one list.
 */
function entradas(): HTMLElement[] {
  return Array.from(
    screen
      .getByRole("menu")
      .querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]'),
  );
}

describe("<SessionMenu />", () => {
  it("arranca cerrado y lo dice", () => {
    render(<SessionMenu nombre={NOMBRE} />);

    expect(disparador()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  /* El disco es el nombre en otra forma: anunciarlo dos veces no ayuda a nadie. */
  it("pinta las iniciales sin anunciarlas", () => {
    render(<SessionMenu nombre={NOMBRE} />);

    expect(screen.getByText("RD")).toHaveAttribute("aria-hidden", "true");
    /* El disco es el nombre en otra forma: anunciar "R D Rosa Díaz" no le
       agrega nada a nadie, así que no entra en el nombre accesible. */
    expect(disparador()).toHaveAccessibleName(`${NOMBRE} Colaborador`);
  });

  /**
   * EL ROL SÍ ENTRA, y es lo contrario del disco: no repite el nombre, es
   * información nueva — la misma que ve quien mira la pantalla. Taparlo con
   * `aria-hidden` dejaría el nombre accesible en "Rosa Díaz" mientras la
   * etiqueta visible dice "Rosa Díaz Administrador", y WCAG 2.5.3 pide lo
   * contrario: que la visible esté CONTENIDA en la accesible, o quien maneja el
   * portal por voz no puede pedir lo que lee.
   */
  it("dice el rol en el nombre accesible, no solo en pantalla", () => {
    render(<SessionMenu nombre={NOMBRE} esAdmin />);

    expect(disparador()).toHaveAccessibleName(`${NOMBRE} Administrador`);
  });

  it("la flecha no entra en el nombre: `aria-expanded` ya dice si está abierto", () => {
    render(<SessionMenu nombre={NOMBRE} />);

    expect(disparador()).toHaveAttribute("aria-expanded", "false");
    expect(disparador()).toHaveAccessibleName(`${NOMBRE} Colaborador`);
  });

  it("abre el menú con el tema y la salida adentro", async () => {
    render(<SessionMenu nombre={NOMBRE} />);

    await userEvent.setup().click(disparador());

    const menu = screen.getByRole("menu");

    expect(disparador()).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Modo oscuro" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  /* El panel se nombra con el disparador y el disparador apunta al panel. */
  it("enlaza el disparador y el panel en los dos sentidos", async () => {
    render(<SessionMenu nombre={NOMBRE} />);

    await userEvent.setup().click(disparador());

    const menu = screen.getByRole("menu");

    expect(disparador()).toHaveAttribute("aria-controls", menu.id);
    expect(menu).toHaveAttribute("aria-labelledby", disparador().id);
  });

  it("vuelve a cerrarlo con un segundo clic", async () => {
    const user = userEvent.setup();
    render(<SessionMenu nombre={NOMBRE} />);

    await user.click(disparador());
    await user.click(disparador());

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  /**
   * `pointerdown` fuera y no `click`: el panel tiene que desaparecer antes de que
   * reaccione lo que está debajo, o un clic sobre una entrada de la nav navega
   * con el menú todavía pintado encima por un frame.
   */
  it("se cierra al apuntar fuera", async () => {
    const user = userEvent.setup();
    render(
      <>
        <SessionMenu nombre={NOMBRE} />
        <button type="button">Afuera</button>
      </>,
    );

    await user.click(disparador());
    await user.click(screen.getByRole("button", { name: "Afuera" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  /**
   * PRD: "El acceso a esta pantalla se ofrece desde un botón ubicado junto al de
   * cerrar sesión, visible solo para administradores". Salió de la barra y entró
   * acá, que es el mismo panel donde vive la salida.
   */
  describe("puerta de administradores", () => {
    it("se la ofrece a una administradora, apuntando a su pantalla", async () => {
      render(<SessionMenu nombre={NOMBRE} esAdmin />);

      await userEvent.setup().click(disparador());

      expect(screen.getByRole("menuitem", { name: "Administradores" })).toHaveAttribute(
        "href",
        RUTA_ADMINISTRADORES,
      );
    });

    /* Mostrar no es autorizar: `/admin/administradores` corre su propio guard. */
    it("no se la dibuja a un colaborador", async () => {
      render(<SessionMenu nombre={NOMBRE} />);

      await userEvent.setup().click(disparador());

      expect(screen.queryByRole("menuitem", { name: "Administradores" })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Cerrar sesión" })).toBeInTheDocument();
    });

    /*
     * Es el único destino del panel; las otras dos filas actúan sobre la sesión
     * en la que ya estás. Un menú que mezcla las dos cosas se lee mejor con el
     * "ir a" arriba, que es la convención de todo menú de cuenta.
     */
    it("la pone primera, antes del tema y de la salida", async () => {
      render(<SessionMenu nombre={NOMBRE} esAdmin />);

      await userEvent.setup().click(disparador());

      expect(entradas()[0]).toHaveAccessibleName("Administradores");
      expect(entradas()).toHaveLength(3);
    });

    /* Un menú que no dice dónde estás obliga a abrirlo, mirar y cerrarlo. */
    it("se marca como actual cuando esa es la pantalla que se está leyendo", async () => {
      usePathname.mockReturnValue(RUTA_ADMINISTRADORES);

      render(<SessionMenu nombre={NOMBRE} esAdmin />);

      await userEvent.setup().click(disparador());

      expect(screen.getByRole("menuitem", { name: "Administradores" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    /* `aria-current="false"` es un valor válido que algunos lectores anuncian. */
    it("omite el atributo cuando se está leyendo otra pantalla", async () => {
      usePathname.mockReturnValue("/admin/catalogo");

      render(<SessionMenu nombre={NOMBRE} esAdmin />);

      await userEvent.setup().click(disparador());

      expect(screen.getByRole("menuitem", { name: "Administradores" })).not.toHaveAttribute(
        "aria-current",
      );
    });

    /*
     * El separador dice que la fila de arriba es otro grupo. No es una entrada,
     * así que las flechas lo saltan: si contara como parada, habría un paso
     * muerto en el medio del menú.
     */
    it("separa el destino de las acciones sin agregar una parada", async () => {
      const user = userEvent.setup();
      render(<SessionMenu nombre={NOMBRE} esAdmin />);

      await user.click(disparador());

      expect(screen.getByRole("separator")).toBeInTheDocument();

      await user.keyboard("{ArrowDown}");

      expect(screen.getByRole("menuitemcheckbox")).toHaveFocus();
    });

    it("no dibuja separador cuando no hay nada que separar", async () => {
      render(<SessionMenu nombre={NOMBRE} />);

      await userEvent.setup().click(disparador());

      expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    });
  });

  describe("teclado", () => {
    /* Abrir un menú mueve el foco adentro: si se queda en el disparador, las
       flechas no tienen entre qué moverse. */
    it("al abrir con clic deja el foco en la primera entrada", async () => {
      render(<SessionMenu nombre={NOMBRE} />);

      await userEvent.setup().click(disparador());

      expect(entradas()[0]).toHaveFocus();
    });

    it("abre con la flecha abajo en la primera entrada", async () => {
      const user = userEvent.setup();
      render(<SessionMenu nombre={NOMBRE} />);

      disparador().focus();
      await user.keyboard("{ArrowDown}");

      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(entradas()[0]).toHaveFocus();
    });

    /* Abrir hacia arriba deja "Cerrar sesión" a dos teclas del disparador. */
    it("abre con la flecha arriba en la última entrada", async () => {
      const user = userEvent.setup();
      render(<SessionMenu nombre={NOMBRE} />);

      disparador().focus();
      await user.keyboard("{ArrowUp}");

      expect(entradas().at(-1)).toHaveFocus();
      expect(screen.getByRole("menuitem", { name: "Cerrar sesión" })).toHaveFocus();
    });

    it("abre con Enter sin cerrarlo en el mismo gesto", async () => {
      const user = userEvent.setup();
      render(<SessionMenu nombre={NOMBRE} />);

      disparador().focus();
      await user.keyboard("{Enter}");

      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("abre con la barra espaciadora sin cerrarlo en el mismo gesto", async () => {
      const user = userEvent.setup();
      render(<SessionMenu nombre={NOMBRE} />);

      disparador().focus();
      await user.keyboard(" ");

      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("baja y sube entre las entradas", async () => {
      const user = userEvent.setup();
      render(<SessionMenu nombre={NOMBRE} />);

      await user.click(disparador());
      await user.keyboard("{ArrowDown}");

      expect(entradas()[1]).toHaveFocus();

      await user.keyboard("{ArrowUp}");

      expect(entradas()[0]).toHaveFocus();
    });

    /* Las flechas dan la vuelta: en un menú de dos entradas, no hacerlo deja al
       lector golpeando contra un borde invisible. */
    it("da la vuelta en los dos extremos", async () => {
      const user = userEvent.setup();
      render(<SessionMenu nombre={NOMBRE} />);

      await user.click(disparador());
      await user.keyboard("{ArrowUp}");

      expect(entradas().at(-1)).toHaveFocus();

      await user.keyboard("{ArrowDown}");

      expect(entradas()[0]).toHaveFocus();
    });

    it("salta a los extremos con Home y End", async () => {
      const user = userEvent.setup();
      render(<SessionMenu nombre={NOMBRE} />);

      await user.click(disparador());
      await user.keyboard("{End}");

      expect(entradas().at(-1)).toHaveFocus();

      await user.keyboard("{Home}");

      expect(entradas()[0]).toHaveFocus();
    });

    /* Escape cierra y devuelve el foco: dejarlo en un elemento que ya no existe
       manda al lector al principio del documento. */
    it("cierra con Escape y devuelve el foco al disparador", async () => {
      const user = userEvent.setup();
      render(<SessionMenu nombre={NOMBRE} />);

      await user.click(disparador());
      await user.keyboard("{Escape}");

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(disparador()).toHaveFocus();
    });

    /* Tab no se traga: cierra y deja que el navegador siga desde el disparador,
       que es el único tab stop del menú. */
    it("cierra con Tab en vez de atrapar el foco", async () => {
      const user = userEvent.setup();
      render(<SessionMenu nombre={NOMBRE} />);

      await user.click(disparador());
      await user.keyboard("{Tab}");

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    /**
     * El único tab stop es el disparador. Si una entrada fuera tabulable, el menú
     * anunciaría una cosa y se comportaría como otra.
     */
    it("deja las entradas fuera del recorrido de tabulación", async () => {
      render(<SessionMenu nombre={NOMBRE} />);

      await userEvent.setup().click(disparador());

      for (const entrada of entradas()) {
        expect(entrada).toHaveAttribute("tabindex", "-1");
      }
    });
  });

  /**
   * Convención de una entrada marcable: el menú NO se cierra al pulsarla. Estás
   * moviendo un interruptor, no eligiendo un destino, y todo el sentido de
   * `aria-checked` es que puedas ver el resultado.
   */
  it("sigue abierto después de cambiar el tema", async () => {
    const user = userEvent.setup();
    render(<SessionMenu nombre={NOMBRE} />);

    await user.click(disparador());
    await user.click(screen.getByRole("menuitemcheckbox"));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox")).toHaveAttribute("aria-checked", "true");
  });
});

/**
 * The rule the avatar disc paints. Asserted here rather than through the menu's
 * DOM because the interesting cases — one word, four words, stray spaces, an
 * accented initial — are cheap to state directly and expensive to stage through
 * a component that renders a trigger and a panel around them.
 */
describe("inicialesDe()", () => {
  it("toma la primera letra de los dos primeros nombres", () => {
    expect(inicialesDe("Rosa Díaz")).toBe("RD");
  });

  /* Un nombre de cuatro palabras no pinta cuatro letras: el disco mide 32px. */
  it("se queda en dos aunque haya más palabras", () => {
    expect(inicialesDe("Jose Rolando Alvarez Fernandez")).toBe("JR");
  });

  it("resuelve un nombre de una sola palabra", () => {
    expect(inicialesDe("Ana")).toBe("A");
  });

  /* Espacios de más o de menos no deben producir una letra vacía. */
  it("no se confunde con espacios sobrantes ni con un nombre vacío", () => {
    expect(inicialesDe("  Ana   Quispe  ")).toBe("AQ");
    expect(inicialesDe("   ")).toBe("");
  });

  it("pasa a mayúscula una inicial acentuada sin partirla", () => {
    expect(inicialesDe("Ángela Ñuñez")).toBe("ÁÑ");
  });
});
