import { Topbar } from "@/components/topbar/topbar";
import { guardPageAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { listarSugerencias } from "@/lib/sugerencias/repository";

import { SugerenciasAdmin } from "./sugerencias-admin";
import styles from "./sugerencias.module.css";

/**
 * `/admin/sugerencias` — la gestión de sugerencias, backlog item #15.
 *
 * WHY `/admin/sugerencias`. The literal `admin` prefix `app/admin/catalogo`
 * established, and the same reason applies with more force here: `/sugerencias`
 * is already taken by the collaborator's own box. Two screens over the same rows,
 * two audiences, two URLs a person can tell apart in the address bar.
 *
 * NO LAYOUT DOES THE GUARDING. `lib/authz/index.ts` explains that Next's Router
 * Cache reuses a layout across soft navigations, so a role revoked between two
 * admin screens would go unnoticed. Every admin page repeats the guard itself,
 * and this one is no exception.
 *
 * WHY THE LIST IS READ HERE, NOT FETCHED FROM `GET /api/sugerencias/todas`. A
 * Server Component already holds the database and the request's identity; calling
 * the portal's own endpoint would mean building an absolute URL and forwarding
 * the session cookie by hand to reach the same rows through an extra round trip.
 * It is the SAME `listarSugerencias` the route handler calls, and both are behind
 * the admin guard. The API is what the BROWSER uses — the state changes and the
 * revalidations both go through it.
 *
 * ITS OWN `loading.tsx` AND `error.tsx`, for the reason every admin screen has
 * its own: the skeleton has to have the geometry of THIS content, and the error
 * has to name what could not be loaded.
 */

/**
 * Required by `lib/authz/index.ts` on every protected page. `auth()` reads
 * cookies and so forces dynamic rendering today, but that is a property of the
 * current code shape rather than a promise; a statically rendered protected page
 * would run its guard once at build time and never again.
 */
export const dynamic = "force-dynamic";

export default async function SugerenciasAdminPage() {
  const acceso = await guardPageAdmin();

  /* Before the read, so a refused reader never causes a query at all. */
  if (!acceso.allowed) {
    return acceso.screen;
  }

  const sugerencias = await listarSugerencias(prisma);

  return (
    <main className="lx-main">
      {/* La misma barra que el portal: identidad, tema, la puerta al rol y la
          salida. El logo vuelve al portal, que hasta ahora era el único camino
          que estas pantallas no tenían. */}
      <Topbar usuario={acceso.usuario} />

      <header className={styles.header}>
        <p className="lx-label" style={{ color: "var(--navy-fg)" }}>
          Administración
        </p>
        <h1>Gestión de sugerencias</h1>
        <p className="lx-meta">
          Todas las ideas que envió el equipo. Cambiar el estado queda registrado con tu nombre y la
          fecha, y el autor lo ve en su propio buzón: los cambios se aplican al instante, no hay un
          botón de guardado general.
        </p>
      </header>

      <SugerenciasAdmin sugerenciasIniciales={sugerencias} />
    </main>
  );
}
