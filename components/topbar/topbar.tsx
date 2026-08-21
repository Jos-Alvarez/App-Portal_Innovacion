import Link from "next/link";

import { LOGO_SIZE_TOPBAR, Logo } from "@/components/logo/logo";
import { ThemeToggle } from "@/components/theme-toggle/theme-toggle";
import { SignOutButton } from "@/components/topbar/sign-out-button";

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
 *  ON /admin/administradores THE DOOR POINTS AT THE PAGE YOU ARE ON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Left as it is, deliberately. Every navigation bar in the world behaves this
 * way, a reader loses nothing by following it, and the alternative — telling the
 * bar which route is current — means a prop every page has to pass correctly for
 * a wart nobody has ever complained about. If the bar ever grows a set of
 * entries rather than one, that is the moment to add `aria-current`.
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

/** Where the administrator door leads. Exported so the tests name it once. */
export const RUTA_ADMINISTRADORES = "/admin/administradores";

export function Topbar({ usuario, preloadLogo = false }: TopbarProps) {
  return (
    <div className={styles.topbar}>
      {/*
       * The lockup is the way back to the portal, which is the whole reason the
       * admin screens can wear this bar at all: before it they had no route home
       * except the browser's own back button, and `/admin/enlaces` reached by a
       * bookmark had none whatsoever. A logo that leads home is the convention
       * every reader already knows, so it needs no label of its own beyond the
       * two words it already carries.
       */}
      <Link className={styles.lockup} href="/">
        <Logo size={LOGO_SIZE_TOPBAR} preload={preloadLogo} />
        <span className={styles.separador} aria-hidden="true" />
        <span className={styles.marca}>Portal de Innovación</span>
      </Link>

      <div className={styles.sesion}>
        {/* The name the guard re-read from SQL Server on this request, not one
            carried in the session token. */}
        <span className="lx-meta">{usuario.nombre}</span>
        <ThemeToggle />

        {/*
         * PRD: "El acceso a esta pantalla se ofrece desde un botón ubicado junto
         * al de cerrar sesión, visible solo para administradores". Beside it, and
         * before it: the way out is the last thing in the bar on every screen, so
         * it does not move when the button next to it appears or disappears.
         *
         * `Link` and not an anchor: an internal navigation the client router
         * should handle without a full document load.
         */}
        {usuario.esAdmin ? (
          <Link className="lx-btn lx-btn-secondary" href={RUTA_ADMINISTRADORES}>
            Administradores
          </Link>
        ) : null}

        <SignOutButton />
      </div>
    </div>
  );
}
