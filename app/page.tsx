import { Logo } from "@/components/logo/logo";
import { ThemeToggle } from "@/components/theme-toggle/theme-toggle";
import { guardPage } from "@/lib/authz";

import styles from "./page.module.css";

/**
 * The safety net of `lib/authz` (see its `index.ts`): the guard reads cookies
 * and would force dynamic rendering on its own today, but a protected route
 * that ever slipped back into the static build would run its check once and
 * never again.
 */
export const dynamic = "force-dynamic";

/**
 * Minimal proof that the scaffold runs and both palettes resolve — and the
 * first page to carry the per-request guard.
 *
 * The portal itself is open to every authenticated collaborator (PRD), so
 * `guardPage()` is the right level here: no role and no assignment, but the
 * account still has to exist and still be active in SQL Server on THIS request.
 * The check lives on the page and not on `app/layout.tsx` on purpose — a layout
 * is reused across soft navigations and would stop re-checking.
 */
export default async function HomePage() {
  const acceso = await guardPage();

  if (!acceso.allowed) {
    return acceso.screen;
  }

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        {/* The logo is here so the single-asset dark derivation is exercised by
            a real route; its own placements are the login and the topbar. */}
        <Logo preload />
        <p className="lx-label" style={{ color: "var(--navy-fg)" }}>
          Fundación UI
        </p>
        <h1>Portal de Innovación</h1>
        <p className="lx-meta">
          Scaffold, tokens de diseño, tipografía Archivo y cambio de tema sin parpadeo.
        </p>
        <ThemeToggle />
      </div>
    </main>
  );
}
