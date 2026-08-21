import { Topbar } from "@/components/topbar/topbar";
import { listarAdministradores } from "@/lib/admins/repository";
import { normalizeEmail } from "@/lib/auth/identity";
import { guardPageAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

import { AdministradoresAdmin } from "./administradores-admin";
import styles from "./administradores.module.css";

/**
 * `/admin/administradores` — la gestión de administradores, backlog item #17.
 *
 * WHY `/admin/administradores`. The literal `admin` prefix every management
 * screen uses, and here it is doubly right: the screen is about the `admin` role
 * itself, and the PRD blocks it for everybody else — "ningún colaborador ve ni
 * puede acceder a esta opción".
 *
 * NO LAYOUT DOES THE GUARDING. `lib/authz/index.ts` explains that Next's Router
 * Cache reuses a layout across soft navigations, so a role revoked between two
 * admin screens would go unnoticed. Every admin page repeats the guard itself —
 * and on THIS screen that is not a formality: an administrator who revokes their
 * own role is refused the very next request they make, which is exactly what
 * TECH-DESIGN asks for and what the topbar button alone could never deliver.
 *
 * WHY THE LIST IS READ HERE AND NOT FETCHED. A Server Component already holds
 * the database and the request's identity; calling the portal's own endpoint
 * would mean building an absolute URL and forwarding the session cookie by hand
 * to reach the same rows through an extra round trip. `/api/admins` is what the
 * BROWSER uses — the two writes and the directory search go through it.
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

export default async function AdministradoresPage() {
  const acceso = await guardPageAdmin();

  /* Before the read, so a refused reader never causes a query at all. */
  if (!acceso.allowed) {
    return acceso.screen;
  }

  const administradores = await listarAdministradores(prisma);

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
        <h1>Gestión de administradores</h1>
        <p className="lx-meta">
          Busca a una persona en el directorio de la empresa para darle el rol, o quítaselo a quien
          ya lo tiene. El portal siempre conserva al menos una persona administradora.
        </p>
      </header>

      <AdministradoresAdmin
        administradores={administradores}
        /*
         * The id the guard re-read from SQL Server on this request. The screen
         * uses it to say "tú" and to ask a different question before a
         * self-revocation; the RULE that protects the last administrator is the
         * transaction's, and it does not ask who is calling.
         */
        usuarioActualId={acceso.usuario.id}
        /*
         * Read here rather than in the client component, which cannot see the
         * server's environment at all. An unset `ADMIN_EMAIL` normalizes to `""`,
         * which pins nobody — the same safe direction `isAdminEmail` takes.
         */
        correoFijado={normalizeEmail(process.env.ADMIN_EMAIL)}
      />
    </main>
  );
}
