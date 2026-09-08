"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./topbar.module.css";

/**
 * The panel's navigation: the five day-to-day administration screens, in one
 * place.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS NOW AND NOT BEFORE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Item #17 put ONE door in the topbar — `/admin/administradores` — because the
 * PRD asks for that button by name and beside the sign-out. The other five
 * screens were reachable only by typing their URL, which was tolerable while
 * they were being built and stopped being tolerable once the panel was
 * complete: an administrator had no way to discover that `/admin/asignaciones`
 * exists, and no way back to it after leaving. Those five are what remains here;
 * the door item #17 opened now lives in the session menu.
 *
 * `topbar.tsx` recorded the trigger in writing: "If the bar ever grows a set of
 * entries rather than one, that is the moment to add `aria-current`." This is
 * that moment, so the attribute is here.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT SHOWS, IT DOES NOT AUTHORIZE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nothing here decides what is REACHABLE. Every `/admin/*` page runs
 * `guardPageAdmin` on its own request and every route runs `guardRouteAdmin`,
 * because `lib/authz/index.ts` is explicit that a component may decide what to
 * SHOW and may never be the only thing deciding what is reachable. A
 * collaborator who types one of these URLs gets DESIGN.md's Sin permiso screen
 * whether or not this bar was ever rendered.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE CURRENT ROUTE IS READ HERE AND NOT PASSED AS A PROP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `topbar.tsx` weighed a prop when there was one entry and rejected it: "a prop
 * every page has to pass correctly for a wart nobody has ever complained
 * about". With a set of entries the wart is gone but the objection is stronger —
 * nine call sites would each have to name their own route, and a page that names
 * the wrong one would highlight a screen the reader is not on.
 *
 * `usePathname` cannot be passed wrong. It costs this one small client
 * component, which is why the nav is split out instead of turning the whole
 * `Topbar` — and the logo it carries — into client code.
 *
 * The match is by prefix so that `/admin/asignaciones/7`, a screen of its own,
 * still marks Asignaciones as current. The prefixes are disjoint, so no path can
 * match two entries.
 */

/**
 * The four day-to-day screens of the panel, in the order the work tends to
 * happen: build the catalogue, hand it out, read what comes back, measure it.
 *
 * ADMINISTRADORES IS NOT HERE, AND ITS ABSENCE IS DELIBERATE. It used to close
 * this list, because the PRD asks for its entry "junto al de cerrar sesión" and
 * the last entry was the one nearest that control. It has since moved INTO the
 * session menu, where it sits in the same small panel as the way out — which is
 * as literal as that line has ever been satisfied. `session-menu.tsx` owns it
 * now, `RUTA_ADMINISTRADORES` included.
 *
 * The two lists are not interchangeable. This one is the work you do with the
 * catalogue and it is the same for every administrator; the other is who holds
 * the keys, which is why it belongs beside the reader's own name rather than
 * among the screens they visit all day.
 */
export const ENLACES_ADMIN = [
  /* Enlaces y Procesadores eran dos entradas y ahora son una: la separación
     era la de las dos tablas, no la de la pregunta que se hace quien mira
     — «qué ofrece el portal» —. `app/admin/catalogo/page.tsx` lo explica. */
  { href: "/admin/catalogo", etiqueta: "Catálogo" },
  { href: "/admin/asignaciones", etiqueta: "Asignaciones" },
  { href: "/admin/sugerencias", etiqueta: "Sugerencias" },
  { href: "/admin/analitica", etiqueta: "Analítica" },
] as const;

/** Whether a bar entry is the screen being read, `/admin/asignaciones/7` included. */
export function esRutaActual(href: string, pathname: string | null): boolean {
  if (pathname === null) return false;

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.adminNav} aria-label="Administración">
      {ENLACES_ADMIN.map(({ href, etiqueta }) => {
        const actual = esRutaActual(href, pathname);

        return (
          <Link
            key={href}
            href={href}
            className={styles.adminLink}
            /*
             * `page` and not `true`: the reader is on that page, which is the
             * value assistive technology reads as "this is where you are".
             * Omitted entirely on the others — `aria-current="false"` is a valid
             * value that some screen readers still announce.
             */
            aria-current={actual ? "page" : undefined}
            data-actual={actual}
          >
            {etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
