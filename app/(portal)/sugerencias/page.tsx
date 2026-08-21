import Link from "next/link";

import { LOGO_SIZE_TOPBAR, Logo } from "@/components/logo/logo";
import { ThemeToggle } from "@/components/theme-toggle/theme-toggle";
import { guardPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { leerAreaDelAutor, listarSugerenciasDeAutor } from "@/lib/sugerencias/repository";

import { Buzon } from "./buzon";
import styles from "./sugerencias.module.css";

/**
 * `/sugerencias` — el buzón, and the whole of backlog item #13's screen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `guardPage` AND NOT `guardPageResource`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The backlog is explicit — "Acceso general: no requiere asignación" — and the
 * PRD says the same at length: the individual grants an administrator manages
 * "se limita a decidir quién accede a cada app/agente/procesador", and the
 * suggestions box is outside that entirely. So this page asks for an active
 * session and nothing more, exactly as the dashboard does.
 *
 * It still guards itself. `lib/authz/index.ts` is explicit that a layout-level
 * check is not enough, and "everyone" here means every ACTIVE collaborator: a
 * deactivated account is refused on the very next request, which is the
 * immediacy ADR 0007 exists to promise.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO READS, BOTH AFTER THE GUARD, BOTH SCOPED TO THE READER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The list is handed to `Buzon` as SWR's `fallbackData` — same arrangement as
 * the dashboard, and for the same reason: this Server Component already holds
 * the database connection and the request's identity, so going out to
 * `GET /api/sugerencias` would mean building an absolute URL and forwarding the
 * session cookie by hand to reach the same rows through an extra round trip.
 *
 * Both reads take `acceso.usuario.id`, which the guard re-read from SQL Server
 * on this request. Neither can be pointed at another author: `listarSugerencias-
 * DeAutor` has no "all" mode, and the area read returns one column of one row.
 *
 * They run in parallel because neither needs the other's answer, and the page
 * cannot paint until both are in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ITS OWN `loading.tsx` AND `error.tsx`, INSIDE THE `(portal)` GROUP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The group's boundaries are shaped for the dashboard — a skeleton of table
 * rows, an error that says "no pudimos cargar tus recursos" — and this screen is
 * neither. Nested boundaries in this folder take precedence, exactly as
 * `procesadores/[id]` does for the same reason.
 */

/**
 * Required by `lib/authz/index.ts` on every protected page. `auth()` reads
 * cookies and so forces dynamic rendering today, but that is a property of the
 * current code shape rather than a promise; a statically rendered protected page
 * would run its guard once at build time and never again.
 */
export const dynamic = "force-dynamic";

export default async function SugerenciasPage() {
  const acceso = await guardPage();

  if (!acceso.allowed) {
    return acceso.screen;
  }

  const [sugerencias, areaPropia] = await Promise.all([
    listarSugerenciasDeAutor(prisma, acceso.usuario.id),
    leerAreaDelAutor(prisma, acceso.usuario.id),
  ]);

  return (
    <main className={styles.main}>
      {/* DESIGN.md "Logo": "topbar (58px + separador vertical + 'Portal de
          Innovación')". The lockup is composition, so it lives here and not in
          the Logo component. */}
      <div className={styles.topbar}>
        <Logo size={LOGO_SIZE_TOPBAR} />
        <span className={styles.separador} aria-hidden="true" />
        <span className={styles.marca}>Portal de Innovación</span>

        <div className={styles.sesion}>
          {/* The name the guard re-read from SQL Server on this request, not one
              carried in the session token. */}
          <span className="lx-meta">{acceso.usuario.nombre}</span>
          <ThemeToggle />
        </div>
      </div>

      {/* `Link` and not an anchor: this is an internal navigation and the client
          router should handle it without a full document load. */}
      <Link className={`lx-btn lx-btn-text ${styles.volver}`} href="/">
        ← Volver al portal
      </Link>

      <header className={styles.header}>
        <h1>Buzón de sugerencias</h1>
        <p className="lx-meta">
          Comparte una idea de mejora para ti, para tu área o para otra. El Área de Innovación las
          revisa y su estado queda visible aquí.
        </p>
      </header>

      <Buzon sugerenciasIniciales={sugerencias} areaPropia={areaPropia} />
    </main>
  );
}
