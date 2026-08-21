import { Topbar } from "@/components/topbar/topbar";
import { guardPageAdmin } from "@/lib/authz";
import { listarProcesadores } from "@/lib/procesadores/repository";
import { prisma } from "@/lib/prisma";

import { ProcesadoresAdmin } from "./procesadores-admin";
import styles from "./procesadores.module.css";

/**
 * Catálogo de procesadores — the administration screen of backlog item #6.
 *
 * WHY `/admin/procesadores`. A literal `admin` prefix, mirroring
 * `/admin/enlaces`: every screen under it is administrator-only and needs a
 * home a reader can see in the address bar. A route group `(admin)` would have
 * left the URL as `/procesadores`, competing with the collaborator's own view
 * of this same catalogue in items #8 and #10.
 *
 * NO LAYOUT DOES THE GUARDING. `lib/authz/index.ts` explains that Next's Router
 * Cache reuses a layout across soft navigations, so a role revoked between two
 * admin screens would go unnoticed. Every admin page repeats the guard itself.
 *
 * WHY THE LIST IS READ HERE, NOT FETCHED FROM `GET /api/procesadores`. A Server
 * Component already holds the database and the request's identity; calling the
 * portal's own endpoint would mean building an absolute URL and forwarding the
 * session cookie by hand to reach the same rows through an extra round trip.
 * It is the SAME `listarProcesadores` the route handler calls. The API is what
 * the BROWSER uses — every mutation on this screen goes through it.
 */

export const dynamic = "force-dynamic";

export default async function ProcesadoresAdminPage() {
  const acceso = await guardPageAdmin();

  /* Before the read, so a refused reader never causes a query at all. */
  if (!acceso.allowed) {
    return acceso.screen;
  }

  const procesadores = await listarProcesadores(prisma);

  return (
    <main className={styles.main}>
      {/* La misma barra que el portal: identidad, tema, la puerta al rol y la
          salida. El logo vuelve al portal, que hasta ahora era el único camino
          que estas pantallas no tenían. */}
      <Topbar usuario={acceso.usuario} />

      <header className={styles.header}>
        <p className="lx-label" style={{ color: "var(--navy-fg)" }}>
          Administración
        </p>
        <h1>Catálogo de procesadores</h1>
        <p className="lx-meta">
          Cada procesador declara cuántos archivos admite y de qué tamaño: el servicio de
          procesamiento hace cumplir esos límites. Los cambios se aplican al guardarlos: no hay un
          botón de guardado general.
        </p>
      </header>

      <ProcesadoresAdmin procesadores={procesadores} />
    </main>
  );
}
