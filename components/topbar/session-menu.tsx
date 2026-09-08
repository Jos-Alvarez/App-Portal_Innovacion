"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle/theme-toggle";
import { esRutaActual } from "@/components/topbar/admin-nav";
import { SignOutButton } from "@/components/topbar/sign-out-button";

import styles from "./topbar.module.css";

/**
 * The session menu: who the portal thinks you are, and the two things you can do
 * to your own session, behind one trigger.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY IT EXISTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The theme switch and the way out used to sit loose in the bar. Behind one
 * trigger they stop competing with the panel nav for the same row, and the bar
 * fits at widths where it used to wrap: two controls plus a name are three
 * objects, a trigger is one.
 *
 * NO CARET. The reference design drew one and this trigger carried it for a
 * release; it was removed on request. The affordance a sighted reader loses is
 * the chevron; what remains is the disc and the name reading as one pressable
 * block, plus the pointer cursor and the hover fill. Nothing an assistive
 * technology relies on changed: `aria-haspopup="menu"` and `aria-expanded` are
 * what announce that this opens something, and they were never the caret's job.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE CONTROLS DID NOT MOVE HOUSE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ThemeToggle` and `SignOutButton` are still the only owners of their
 * behaviour — `useTheme` and `signOut` are not reimplemented here. What changed
 * is their SHAPE: both are now `.lx-menu-item` rows carrying visible labels and
 * a menu role. Re-deriving either one inside this file would have meant two
 * places that know how the portal signs out, which is exactly the duplication
 * item #17 existed to end.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  KEYBOARD
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A `role="menu"` is a promise, and the promise is arrow-key navigation with ONE
 * tab stop. Half-implementing it — an `aria-haspopup` over two tabbable buttons
 * — announces a menu and then behaves like a pair of loose controls, which is
 * worse for a screen-reader user than the two loose controls actually were.
 *
 * So: the trigger is the only tab stop, both entries carry `tabIndex={-1}`,
 * ArrowDown/ArrowUp/Home/End move between them and wrap, Escape closes and puts
 * focus back on the trigger, and Tab closes and lets the browser carry on out of
 * the bar. Opening with ArrowUp lands on the LAST entry, which is what makes
 * "Cerrar sesión" reachable in two keystrokes.
 *
 * Focus is moved by querying the panel's own DOM rather than by threading a ref
 * through each entry. The entries are two independent components that already
 * declare their role; asking the panel "which of your children are menu entries"
 * cannot fall out of sync with what it actually rendered, whereas a ref array
 * assembled by hand goes stale the day a third entry arrives.
 */

/** What counts as a stop for the arrow keys. Both roles are real menu entries. */
const SELECTOR_ENTRADAS = '[role="menuitem"], [role="menuitemcheckbox"]';

/**
 * Where the administrator door leads.
 *
 * IT LIVES HERE NOW. `admin-nav.tsx` used to close its list with this route,
 * because the PRD asks for the entry "junto al de cerrar sesión" and the last
 * entry of the bar was the nearest thing to that control. Inside this panel it
 * is not near the way out — it is in the same three-row menu as it, which is the
 * most literal reading that line has ever had.
 *
 * The move also splits the two lists by what they are. The nav holds the work an
 * administrator does with the catalogue, the same for all of them; this is who
 * holds the keys, which belongs beside the reader's own name.
 */
export const RUTA_ADMINISTRADORES = "/admin/administradores";

/** Where focus lands when the menu opens, which depends on what opened it. */
type FocoInicial = "primera" | "ultima";

/**
 * The one or two letters the avatar disc paints — first letter of the first name
 * and of the next word, which for "Rosa Díaz" is RD and for a single-word name
 * is just its initial.
 *
 * `Array.from` and not `[0]`, because a string index returns a UTF-16 code unit
 * and would split an accented or non-BMP first character in half.
 *
 * Exported because it is the kind of small rule that is easier to assert
 * directly — an empty name, one word, four words — than through the DOM of a bar
 * that renders eleven other things.
 */
export function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  return palabras.map((palabra) => Array.from(palabra)[0]!.toUpperCase()).join("");
}

export interface SessionMenuProps {
  /** The name the page's own guard re-read from SQL Server on this request. */
  nombre: string;
  /**
   * Whether to DRAW the administrator entry, and nothing else. The value comes
   * from the caller's own `guardPage`, which re-read it from SQL Server on this
   * request (ADR 0007); `/admin/administradores` guards itself either way, so a
   * collaborator who types the URL gets the Sin permiso screen regardless.
   */
  esAdmin?: boolean;
}

export function SessionMenu({ nombre, esAdmin = false }: SessionMenuProps) {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();

  const focoAlAbrir = useRef<FocoInicial>("primera");
  const contenedorRef = useRef<HTMLDivElement>(null);
  const disparadorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const idMenu = useId();
  const idDisparador = useId();

  const entradas = useCallback((): HTMLElement[] => {
    const menu = menuRef.current;

    return menu ? Array.from(menu.querySelectorAll<HTMLElement>(SELECTOR_ENTRADAS)) : [];
  }, []);

  const abrir = useCallback((foco: FocoInicial) => {
    focoAlAbrir.current = foco;
    setAbierto(true);
  }, []);

  /**
   * `devolverFoco` is false for a click outside: the reader has already put the
   * cursor somewhere else, and yanking focus back to the trigger would undo the
   * very thing they just did. It is true for Escape and for Tab, where the
   * trigger is where focus belongs.
   */
  const cerrar = useCallback((devolverFoco: boolean) => {
    setAbierto(false);
    if (devolverFoco) disparadorRef.current?.focus();
  }, []);

  /* Opening a menu moves focus into it — otherwise the keyboard is still on the
     trigger and the arrow keys have nothing to move between. */
  useEffect(() => {
    if (!abierto) return;

    const encontradas = entradas();
    const destino = focoAlAbrir.current === "ultima" ? encontradas.at(-1) : encontradas[0];

    destino?.focus();
  }, [abierto, entradas]);

  /**
   * A press anywhere else closes it. `pointerdown` and not `click`, so the panel
   * is gone before whatever is underneath reacts — with `click` a press on a nav
   * entry would navigate with the menu still painted over it for a frame.
   *
   * The listener exists only while the menu is open, which is also what keeps
   * the opening click from closing it: effects run after the click that set the
   * state, so there is no listener at the moment that one fires.
   */
  useEffect(() => {
    if (!abierto) return;

    function alApuntarFuera(evento: PointerEvent) {
      if (!contenedorRef.current?.contains(evento.target as Node)) setAbierto(false);
    }

    document.addEventListener("pointerdown", alApuntarFuera);
    return () => document.removeEventListener("pointerdown", alApuntarFuera);
  }, [abierto]);

  function alTeclearEnDisparador(evento: React.KeyboardEvent<HTMLButtonElement>) {
    switch (evento.key) {
      case "ArrowDown":
      case "Enter":
      case " ":
        /* Also stops the browser's own click for Enter and Space, which would
           otherwise run `onClick` right after this and close what just opened. */
        evento.preventDefault();
        abrir("primera");
        break;
      case "ArrowUp":
        evento.preventDefault();
        abrir("ultima");
        break;
      case "Escape":
        if (abierto) {
          evento.preventDefault();
          cerrar(true);
        }
        break;
    }
  }

  function alTeclearEnMenu(evento: React.KeyboardEvent<HTMLDivElement>) {
    const encontradas = entradas();
    if (encontradas.length === 0) return;

    const actual = encontradas.indexOf(document.activeElement as HTMLElement);
    const ultima = encontradas.length - 1;

    switch (evento.key) {
      case "ArrowDown":
        evento.preventDefault();
        encontradas[actual < 0 || actual === ultima ? 0 : actual + 1]!.focus();
        break;
      case "ArrowUp":
        evento.preventDefault();
        encontradas[actual <= 0 ? ultima : actual - 1]!.focus();
        break;
      case "Home":
        evento.preventDefault();
        encontradas[0]!.focus();
        break;
      case "End":
        evento.preventDefault();
        encontradas[ultima]!.focus();
        break;
      case "Escape":
        evento.preventDefault();
        cerrar(true);
        break;
      case "Tab":
        /* NOT prevented: Tab should leave the bar rather than be swallowed.
           Closing first means the browser carries on from the trigger, which is
           where the menu's single tab stop lives. */
        cerrar(true);
        break;
    }
  }

  return (
    <div className={styles.sesion} ref={contenedorRef}>
      <button
        type="button"
        id={idDisparador}
        ref={disparadorRef}
        className={styles.disparador}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => (abierto ? cerrar(false) : abrir("primera"))}
        onKeyDown={alTeclearEnDisparador}
      >
        {/*
         * The disc is the name in another shape, so it is `aria-hidden`: the
         * trigger's accessible name is the name itself, and announcing "R D Rosa
         * Díaz" helps nobody.
         */}
        <span className={styles.avatar} aria-hidden="true">
          {inicialesDe(nombre)}
        </span>
        <span className={styles.nombre}>{nombre}</span>
      </button>

      {abierto ? (
        <div
          id={idMenu}
          ref={menuRef}
          className={styles.menu}
          role="menu"
          aria-labelledby={idDisparador}
          onKeyDown={alTeclearEnMenu}
        >
          {/*
           * PRD: "El acceso a esta pantalla se ofrece desde un botón ubicado
           * junto al de cerrar sesión, visible solo para administradores".
           *
           * FIRST AND NOT LAST, which is the one thing this move changed about
           * its placement. It is the only DESTINATION in a panel whose other two
           * rows act on the session you are already in, and a menu that mixes
           * the two reads best with the going-somewhere on top — the convention
           * every account menu already teaches. The PRD's adjacency survives it:
           * the two are three rows apart in one small panel, closer than the bar
           * ever put them.
           */}
          {esAdmin ? (
            <>
              <Link
                href={RUTA_ADMINISTRADORES}
                role="menuitem"
                tabIndex={-1}
                className="lx-menu-item"
                /*
                 * The same `page`/omitted rule the nav uses: `aria-current="false"`
                 * is a valid value that some screen readers still announce.
                 */
                aria-current={esRutaActual(RUTA_ADMINISTRADORES, pathname) ? "page" : undefined}
                data-actual={esRutaActual(RUTA_ADMINISTRADORES, pathname)}
              >
                {/*
                 * Two people — the screen hands the role to somebody. Drawn
                 * inline for the same reason the door is: `currentColor` is what
                 * lets it follow the row's hover and dark-mode colours, and the
                 * portal ships no icon dependency.
                 */}
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Administradores
              </Link>

              {/*
               * A real `role="separator"`, not a styled border: it tells a screen
               * reader that the row above belongs to a different group than the
               * two below. It is not a menu entry, so the arrow keys skip it —
               * `SELECTOR_ENTRADAS` never matches it.
               */}
              <div className={styles.separadorMenu} role="separator" />
            </>
          ) : null}

          <ThemeToggle />
          <SignOutButton />
        </div>
      ) : null}
    </div>
  );
}
