"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { esRutaActual } from "@/components/topbar/rutas";

import styles from "./topbar.module.css";

/**
 * The collaborator's navigation: the two screens the portal is, for somebody
 * who does not administer it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE BUZÓN MOVED UP HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `app/(portal)/page.tsx` argued the opposite and was right at the time: the
 * bar held only the session cluster — who you are, how the portal looks, the
 * way out — and the buzón is not about the session, so it lived beside the
 * words that explain the screen.
 *
 * What changed is that the bar stopped being only a session cluster. The panel
 * got its four entries and an administrator can now see WHERE THEY ARE from
 * the top of any screen; a collaborator got nothing, and their two screens —
 * their resources and the buzón — were reachable only from inside one of them.
 * The bar is a set of destinations now, and a reader who is in the buzón had no
 * way to see that «Mis recursos» is where they came from.
 *
 * DRAWN FOR COLLABORATORS ONLY. An administrator's bar already carries the four
 * screens they work with all day, and adding these two would make six entries
 * competing in one row — with «Sugerencias» (every suggestion in the portal)
 * sitting next to «Buzón de sugerencias» (your own), which name the same word
 * for two different powers. The administrator keeps the lockup as the way home
 * and `page.tsx` keeps the buzón link in the body for them, which is where it
 * already was.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT SHOWS, IT DOES NOT AUTHORIZE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nothing here decides what is REACHABLE — the same rule `admin-nav.tsx`
 * states. Both destinations run `guardPage` on their own request, and both are
 * open to every active collaborator anyway, so this bar hides nothing and
 * grants nothing.
 *
 * The current route is read here rather than passed in, for the reason
 * `admin-nav.tsx` records: `usePathname` cannot be passed wrong, and a page
 * that named the wrong route would highlight a screen the reader is not on.
 */

/**
 * The portal, as a collaborator meets it.
 *
 * «Mis recursos» and not «Mis herramientas»: the portal offers apps, agentes de
 * IA and procesadores, and only the last of the three is a tool in any ordinary
 * sense. «Recursos» is also the word the administration side already uses for
 * the same rows — the Catálogo de recursos is where these come from — so the
 * two halves of the product name the same thing the same way.
 */
export const ENLACES_PORTAL = [
  { href: "/", etiqueta: "Mis recursos" },
  { href: "/sugerencias", etiqueta: "Buzón de sugerencias" },
] as const;

export function PortalNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Portal">
      {ENLACES_PORTAL.map(({ href, etiqueta }) => {
        const actual = esRutaActual(href, pathname);

        return (
          <Link
            key={href}
            href={href}
            className={styles.navLink}
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
