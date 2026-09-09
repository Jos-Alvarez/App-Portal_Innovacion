import { LOGO_SIZE_TOPBAR, Logo } from "@/components/logo/logo";
import { AdminNav } from "@/components/topbar/admin-nav";
import { PortalNav } from "@/components/topbar/portal-nav";
import { SessionMenu } from "@/components/topbar/session-menu";

import styles from "./topbar.module.css";

/**
 * The portal's topbar — DESIGN.md "Logo": "topbar (58px + separador vertical +
 * 'Portal de Innovación')", plus everything the session cluster now holds.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS FINALLY EXISTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Three screens carried a byte-identical copy of this lockup, and item #8 said
 * why that was tolerable and when it would stop being: "extracting a shared
 * topbar is worth doing — item #17 adds a second button beside the theme toggle
 * and will need it". This is that item. With the copies in place, adding the
 * sign-out button and the administrator door would have meant editing the same
 * markup three times, and forgetting one of them would ship a portal whose way
 * out appears and disappears depending on which screen you are on.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT SHOWS, IT DOES NOT AUTHORIZE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `esAdmin` decides whether the administrator button is DRAWN, and it decides
 * nothing else. `lib/authz/index.ts` is explicit that a component may "call a
 * guard to decide what to SHOW (hiding an admin link, for instance)" and may
 * "never be the only thing deciding what is REACHABLE" — so `/admin/*` guards
 * itself on every page and every route, and a collaborator who types the URL
 * gets DESIGN.md's Sin permiso screen whether or not this button was rendered.
 *
 * The value comes from the caller's own `guardPage`, which re-read it from SQL
 * Server on this request (ADR 0007). Nothing here reads a session token, and
 * there is no role in one to read.
 *
 * NOT A LAYOUT. Putting this in `app/(portal)/layout.tsx` — or, now that every
 * admin screen wears it too, in `app/admin/layout.tsx` — would be the obvious
 * home, and it is the one thing `lib/authz/index.ts` forbids: Next's Router
 * Cache reuses a layout's rendered output across soft navigations, so a role
 * revoked between two screens would keep the administrator button on screen —
 * and, worse, would keep showing a name the database no longer agrees with. As a
 * component rendered by each page, it is re-rendered with each page's own guard.
 * That is why the same three lines are repeated in nine files rather than
 * written once: the repetition is the mechanism, not an oversight.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE DOOR BECAME A SET, AND WITH IT `aria-current`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Item #17 shipped a single entry and wrote down the condition for changing it:
 * "If the bar ever grows a set of entries rather than one, that is the moment to
 * add `aria-current`." Item #19 completed the panel and left most of its screens
 * reachable only by typing a URL, so the set exists and the attribute came with
 * it — in `admin-nav.tsx`, which is a client component precisely so it can read
 * the current route itself instead of taking it from nine call sites that could
 * each pass it wrong.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  BACK TO ONE ROW
 * ══════════════════════════════════════════════════════════════════════════
 *
 * For one release the nav took a declared second row of its own so that a
 * narrow viewport could never push the reader's name off the logo's line. It
 * cost the bar most of its height and stacked two competing left edges, and the
 * reference design does it in one row: lockup, then the panel's entries, then
 * the session cluster against the far edge.
 *
 * So the nav moved up beside the lockup and the second row became what it should
 * always have been — a fallback the viewport triggers, not a layout the
 * stylesheet declares. The entries also dropped their borders; `topbar.module.css`
 * says why.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHERE THE ADMINISTRATOR DOOR WENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It is no longer in this bar at all. `AdminNav` holds the five screens an
 * administrator works with all day; `/admin/administradores` — who holds the
 * keys — moved into the session menu, where it shares one small panel with the
 * way out. The PRD asks for that entry "junto al de cerrar sesión", and three
 * rows apart in one menu is the closest the two have ever been.
 *
 * `session-menu.tsx` owns the route constant and the reasoning.
 */

export interface TopbarProps {
  /** Identity and role as the page's own guard re-read them, this request. */
  usuario: {
    nombre: string;
    esAdmin: boolean;
  };
  /**
   * Preload the logo — for the screen a reader lands on, where it is the largest
   * thing above the fold. Only one screen per navigation should claim it.
   */
  preloadLogo?: boolean;
}

export function Topbar({ usuario, preloadLogo = false }: TopbarProps) {
  return (
    <div className={styles.topbar}>
      {/*
       * ══════════════════════════════════════════════════════════════════════
       *  EL LOCKUP DEJÓ DE SER UNA PUERTA
       * ══════════════════════════════════════════════════════════════════════
       *
       * Fue un enlace a `/` mientras esa era la casa de todo el mundo, y ese era
       * su argumento: las pantallas del panel no tenían más vuelta que el botón
       * de atrás del navegador, y un logo que lleva a casa es la convención que
       * cualquiera ya conoce.
       *
       * Las dos mitades de ese argumento se cayeron a la vez. `/` ya no es la
       * casa de quien administra — lo redirige al panel, ver `rutas.ts` —, así
       * que apuntar ahí lo mandaría de vuelta al lugar del que viene. Y la
       * vuelta a casa ya no falta: cada audiencia tiene su barra, y la del
       * colaborador abre con «Mis recursos», que es exactamente ese enlace con
       * su nombre puesto.
       *
       * Sin destino que le pertenezca y sin hueco que tapar, lo que queda es lo
       * que siempre fue a la vista: el nombre del producto.
       */}
      <div className={styles.lockup}>
        <Logo size={LOGO_SIZE_TOPBAR} preload={preloadLogo} />
        <span className={styles.separador} aria-hidden="true" />
        <span className={styles.marca}>Portal de Innovación</span>
      </div>

      {/*
       * One bar, two audiences. An administrator gets the four screens of the
       * panel (the fifth — Administradores — is in the session menu); everybody
       * else gets the two the portal is for them. Never both: six entries in one
       * row would compete, and «Sugerencias» beside «Buzón de sugerencias» names
       * one word for two different powers. `portal-nav.tsx` explains the split.
       */}
      {usuario.esAdmin ? <AdminNav /> : <PortalNav />}

      {/*
       * The session cluster, now a single trigger: who the portal thinks you are,
       * with the administrator door, the theme switch and the way out behind it.
       * Pinned to the far end of the row, whether or not the nav before it was
       * drawn.
       *
       * `esAdmin` decides what the menu DRAWS and nothing else — the same rule
       * that governs the nav above.
       *
       * The name is the guard's, re-read from SQL Server on this request, not one
       * carried in the session token.
       */}
      <SessionMenu nombre={usuario.nombre} esAdmin={usuario.esAdmin} />
    </div>
  );
}
