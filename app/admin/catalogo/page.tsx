import { Topbar } from "@/components/topbar/topbar";
import { asignadosPorRecurso } from "@/lib/asignaciones/repository";
import { guardPageAdmin } from "@/lib/authz";
import { listarEnlaces } from "@/lib/enlaces/repository";
import { prisma } from "@/lib/prisma";
import { listarProcesadores } from "@/lib/procesadores/repository";
import { listarUsuarios } from "@/lib/usuarios/repository";

import { CatalogoAdmin } from "./catalogo-admin";

/**
 * Catálogo de recursos — the screen that replaces `/admin/enlaces` and
 * `/admin/procesadores`.
 *
 * WHY ONE SCREEN. The two were separate because the two TABLES are separate,
 * which is a fact about the database and never was one about the reader. An
 * administrator asking "what does the portal offer, and is it up?" had to visit
 * two screens and merge them by hand; asking "is this name already taken?" was
 * two searches. Nothing about the storage changes — `lib/enlaces` and
 * `lib/procesadores` are untouched, and so are both APIs.
 *
 * WHY `/admin/catalogo`. The literal `admin` prefix of every screen in the
 * panel, for the reason `/admin/enlaces` recorded: a route group `(admin)`
 * would have left the URL as `/catalogo`, competing with the collaborator's own
 * view of these same resources. The two old paths redirect here from
 * `next.config.ts`, so a bookmark still lands somewhere real.
 *
 * NO LAYOUT DOES THE GUARDING. `lib/authz/index.ts` explains that Next's Router
 * Cache reuses a layout across soft navigations, so a role revoked between two
 * admin screens would go unnoticed. Every admin page repeats the guard itself.
 *
 * WHY THE LISTS ARE READ HERE, NOT FETCHED FROM THE APIS. A Server Component
 * already holds the database and the request's identity; calling the portal's
 * own endpoints would mean building absolute URLs and forwarding the session
 * cookie by hand to reach the same rows through two extra round trips. These
 * are the SAME functions both route handlers call. The APIs are what the
 * BROWSER uses — every mutation on this screen goes through them.
 */

export const dynamic = "force-dynamic";

export default async function CatalogoAdminPage() {
  const acceso = await guardPageAdmin();

  /* Before the reads, so a refused reader never causes a query at all. */
  if (!acceso.allowed) {
    return acceso.screen;
  }

  /*
   * In parallel: they are two independent reads of two unrelated tables, and
   * awaiting them in sequence would add the slower one's latency to the faster
   * one's for no reason.
   */
  const [enlaces, procesadores, usuarios, asignadosEnlace, asignadosProcesador] = await Promise.all([
    listarEnlaces(prisma),
    listarProcesadores(prisma),
    listarUsuarios(prisma),
    asignadosPorRecurso(prisma, "enlace"),
    asignadosPorRecurso(prisma, "procesador"),
  ]);

  /*
   * One flat record keyed by catalogue `clave` — `enlace:7`, `procesador:4` —
   * because the two id spaces overlap and only the class tells them apart. The
   * client screen reads a missing key as an empty list: no users, count zero.
   */
  const asignados: Record<string, readonly number[]> = {};
  for (const [id, ids] of asignadosEnlace) {
    asignados[`enlace:${id}`] = ids;
  }
  for (const [id, ids] of asignadosProcesador) {
    asignados[`procesador:${id}`] = ids;
  }

  return (
    <main className="lx-main">
      {/* La misma barra que el portal: identidad, tema, la puerta al rol y la
          salida. El logo vuelve al portal, que hasta ahora era el único camino
          que estas pantallas no tenían. */}
      <Topbar usuario={acceso.usuario} />

      {/* El encabezado lo dibuja la pantalla cliente, y no esta página como en
          el resto del panel, porque las dos altas viven en su misma banda y son
          estado del cliente: abren cada una su diálogo. */}
      <CatalogoAdmin
        enlaces={enlaces}
        procesadores={procesadores}
        usuarios={usuarios}
        asignadosPorRecurso={asignados}
      />
    </main>
  );
}
