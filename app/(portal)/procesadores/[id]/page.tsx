import Link from "next/link";
import { notFound } from "next/navigation";

import { Topbar } from "@/components/topbar/topbar";
import { guardPageResource } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { leerProcesador } from "@/lib/procesadores/repository";
import { idProcesadorSchema } from "@/lib/procesadores/schema";

import { EjecutarProcesador } from "./ejecutar-procesador";
import styles from "./procesador.module.css";

/**
 * `/procesadores/{id}` — where a collaborator runs a procesador they have been
 * assigned, and the destination the dashboard's rows were missing.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS PAGE EXISTS AT ALL, RATHER THAN A DIALOG ON THE DASHBOARD
 * ══════════════════════════════════════════════════════════════════════════
 *
 * An execution takes up to two minutes, produces a download, and has an error
 * state DESIGN.md gives its own specification to. A modal over the dashboard
 * would have put all three inside something a stray click dismisses — and it
 * would have no address, so a collaborator could not be sent one, could not
 * bookmark one, and could not return to the one they were using after a reload.
 *
 * An addressable page also makes the authorization real in the way ADR 0007
 * asks for: a direct URL to a procesador that is not assigned is refused ON THE
 * SERVER with DESIGN.md's Sin permiso screen, which is exactly the acceptance
 * criterion TECH-DESIGN lists — "acceso por URL directa a un procesador no
 * asignado → pantalla 403, verificado en servidor, no solo ocultamiento". A
 * dialog that never had a URL could not have been tested for it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ORDER, AND WHY THE GUARD IS NOT LAST
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. parse the id     — a segment that is not an identifier names no row
 *   2. guard            — the assignment, re-read from SQL Server on this request
 *   3. read the row     — only now, and only because the guard allowed it
 *
 * `guardPageResource` and not `guardPage`: the portal is open to every active
 * collaborator, but this screen is not the portal — it is one resource, and the
 * assignment is what grants it. The guard also refuses a procesador with
 * `activo = false`, which is how a baja in the admin catalogue closes this
 * screen without anything here checking a flag.
 */

/**
 * Required by `lib/authz/index.ts` on every protected page. `auth()` reads
 * cookies and so forces dynamic rendering today, but that is a property of the
 * current code shape rather than a promise; a statically rendered protected
 * page would run its guard once at build time and never again.
 */
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProcesadorPage({ params }: Props) {
  const id = idProcesadorSchema.safeParse((await params).id);

  /*
   * BEFORE THE GUARD, AND IT DISCLOSES NOTHING. A segment that is not a number
   * names no row, so there is no question for the guard to answer. `notFound()`
   * and not the Sin permiso screen: a malformed address is malformed for
   * everybody, including an administrator, and answering 403 to it would
   * suggest something is there.
   */
  if (!id.success) {
    notFound();
  }

  const acceso = await guardPageResource({ tipo: "procesador", id: id.data });

  if (!acceso.allowed) {
    return acceso.screen;
  }

  const procesador = await leerProcesador(prisma, id.data);

  /* The guard passed, so the row existed a moment ago: it went away in between. */
  if (procesador === null) {
    notFound();
  }

  return (
    <main className="lx-main">
      {/* The shared bar item #17 extracted: identity, theme, the role screen for
          an administrator, and the way out. */}
      <Topbar usuario={acceso.usuario} />

      {/* `Link` and not an anchor: this is an internal navigation and the client
          router should handle it without a full document load. */}
      <Link className={`lx-btn lx-btn-text ${styles.volver}`} href="/">
        ← Volver al portal
      </Link>

      <header className={styles.header}>
        <h1>{procesador.nombre}</h1>
        {procesador.descripcion ? <p className="lx-meta">{procesador.descripcion}</p> : null}
      </header>

      <EjecutarProcesador procesador={procesador} />
    </main>
  );
}
