import { guardPageAdmin } from "@/lib/authz";
import { listarEnlaces } from "@/lib/enlaces/repository";
import { prisma } from "@/lib/prisma";

import { EnlacesAdmin } from "./enlaces-admin";
import styles from "./enlaces.module.css";

/**
 * Catálogo de enlaces — the administration screen of backlog item #5.
 *
 * WHY `/admin/enlaces`. A literal `admin` prefix rather than a route group,
 * because the screens that follow — procesadores (#6), asignaciones (#7),
 * sugerencias (#15), administradores (#17) — are all administrator-only and
 * need a home a reader can see in the address bar. A group `(admin)` would have
 * left the URL as `/enlaces`, competing with the collaborator's own view of the
 * same catalogue in item #8.
 *
 * NO LAYOUT DOES THE GUARDING. There is deliberately no `app/admin/layout.tsx`
 * carrying the check: `lib/authz/index.ts` explains that Next's Router Cache
 * reuses a layout across soft navigations, so a role revoked between two admin
 * screens would go unnoticed. Every admin page repeats the guard itself.
 *
 * WHY THE LIST IS READ HERE, NOT FETCHED FROM `GET /api/enlaces`. A Server
 * Component already holds the database and the request's identity; calling the
 * portal's own endpoint would mean building an absolute URL and forwarding the
 * session cookie by hand to reach the same rows through an extra round trip.
 * It is the SAME `listarEnlaces` the route handler calls. The API is what the
 * BROWSER uses — every mutation on this screen goes through it.
 */

export const dynamic = "force-dynamic";

export default async function EnlacesAdminPage() {
  const acceso = await guardPageAdmin();

  /* Before the read, so a refused reader never causes a query at all. */
  if (!acceso.allowed) {
    return acceso.screen;
  }

  const enlaces = await listarEnlaces(prisma);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className="lx-label" style={{ color: "var(--navy-fg)" }}>
          Administración
        </p>
        <h1>Catálogo de enlaces</h1>
        <p className="lx-meta">
          Aplicaciones y agentes de IA del portal. Los cambios se aplican al guardarlos: no hay un
          botón de guardado general.
        </p>
      </header>

      <EnlacesAdmin enlaces={enlaces} />
    </main>
  );
}
