import Link from "next/link";

import { Topbar } from "@/components/topbar/topbar";
import { guardPage } from "@/lib/authz";
import { listarRecursosAsignados } from "@/lib/mis-recursos/repository";
import { prisma } from "@/lib/prisma";

import { MisRecursos } from "./mis-recursos";
import styles from "./portal.module.css";

/**
 * El portal — the screen a collaborator lands on, and backlog item #8.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS `/` AND NOT `/mis-recursos`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `proxy.ts` sends every request without a session to `/login` and returns it
 * here afterwards, so `/` is where a collaborator arrives. Putting the dashboard
 * anywhere else would mean landing them on a page whose only purpose is to point
 * at the one they wanted. It replaces the scaffold proof page of item #1, whose
 * job — showing that the tokens, the font and the theme resolve on a real route
 * — is now done by a route that also does something.
 *
 * WHY THE ROUTE GROUP `(portal)`. It changes no URL: this file still answers
 * `/`. It exists so the dashboard's own `loading.tsx` and `error.tsx` cover the
 * dashboard and nothing else. Placed at `app/`, those two files would also
 * become the boundaries of `/login` — a public screen that reads no database
 * and would inherit a skeleton shaped like a resource table. It is the same
 * reasoning `app/admin/catalogo` REJECTS a group: there the group would
 * have cost the `admin` prefix in the address bar, here the URL is already the
 * one we want and only the boundaries move.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE READ IS HERE AND THE REVALIDATION IS IN THE CLIENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This Server Component calls `listarRecursosAsignados` directly, exactly as the
 * admin screens call their own repositories: it already holds the database and
 * the request's identity, so going out to `GET /api/mis-recursos` would mean
 * building an absolute URL and forwarding the session cookie by hand to reach
 * the same rows through an extra round trip.
 *
 * The list is handed to `MisRecursos` as SWR's `fallbackData`, and from the
 * first paint onwards SWR owns it — revalidating against that very endpoint on
 * focus and every minute (ADR 0007). This is why part 1 built a GET the admin
 * screens never needed: those mutate and refresh themselves, this one goes stale
 * because of what someone ELSE did.
 *
 * `guardPage` and NOT `guardPageAdmin`: the portal is open to every active
 * collaborator (PRD), and the assignments themselves are the authorization —
 * they are what the read is filtered by. It runs BEFORE the read, so a refused
 * reader never causes a query.
 */

/**
 * Required by `lib/authz/index.ts` on every protected page. `auth()` reads
 * cookies and so forces dynamic rendering today, but that is a property of the
 * current code shape rather than a promise; a statically rendered protected
 * page would run its guard once at build time and never again.
 */
export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const acceso = await guardPage();

  if (!acceso.allowed) {
    return acceso.screen;
  }

  const recursos = await listarRecursosAsignados(prisma, acceso.usuario.id);

  return (
    <main className="lx-main">
      {/* The lockup, the theme toggle, the way out and — for an administrator —
          the door to the role screen (item #17). `preloadLogo` because this is
          the screen a reader lands on after signing in. */}
      <Topbar usuario={acceso.usuario} preloadLogo />

      <header className={styles.header}>
        <h1>Mis recursos</h1>
        <p className="lx-meta">
          Las aplicaciones, los agentes de IA y los procesadores que el Área de Innovación asignó a
          tu cuenta.
        </p>

        {/*
          * ══════════════════════════════════════════════════════════════════
          *  THE WAY INTO THE BUZÓN (ITEM #13), AND WHY IT IS HERE
          * ══════════════════════════════════════════════════════════════════
          *
          * The suggestions box is open to everyone — the PRD puts it outside
          * the assignment system entirely — so it needs a door that does not
          * depend on anything being assigned. This is the screen every
          * collaborator lands on after signing in, including the ones whose
          * dashboard is empty, which makes it the one place a link is certain
          * to be seen.
          *
          * STILL NOT IN THE TOPBAR, and now for a different reason. Item #17
          * extracted the shared `Topbar` this comment asked for, so the old
          * objection — three copies to edit — is gone. What the bar holds is the
          * session cluster: who you are, how the portal looks, the role screen
          * if you administer it, and the way out. The buzón is not about the
          * session; it is this screen's own invitation, and it belongs beside
          * the words that explain what the screen is.
          *
          * SECONDARY, not primary. DESIGN.md allows "una acción primaria (navy)
          * por vista"; this view's rows already carry the actions, and the navy
          * fill belongs to the send button on the screen this link leads to.
          */}
        <Link className={`lx-btn lx-btn-secondary ${styles.buzon}`} href="/sugerencias">
          Buzón de sugerencias
        </Link>
      </header>

      <MisRecursos recursosIniciales={recursos} />
    </main>
  );
}
