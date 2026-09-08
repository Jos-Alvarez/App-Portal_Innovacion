import Link from "next/link";

import { StatusChip } from "@/components/chip/chip";
import { EmptyState } from "@/components/states/empty-state";
import { StatusDot } from "@/components/status-dot/status-dot";
import { Topbar } from "@/components/topbar/topbar";
import { guardPageAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { type UsuarioListadoDTO, listarUsuarios } from "@/lib/usuarios/repository";

import styles from "./asignaciones.module.css";

/**
 * Asignaciones por usuario — the person picker of backlog item #7.
 *
 * TWO SCREENS, NOT ONE WITH A DROPDOWN. Choosing a person without navigating
 * would mean either holding every account's grants in the browser at once — one
 * row per account per resource, for a list that only grows — or fetching one
 * account's grants on selection, which needs a `GET .../asignaciones` that part
 * 1 deliberately did NOT build. Making the choice a URL gives each person a
 * page that can be linked, reloaded and re-read from the database on every
 * request, which is also what makes `router.refresh()` mean anything.
 *
 * NO LAYOUT DOES THE GUARDING. `lib/authz/index.ts` explains that Next's Router
 * Cache reuses a layout across soft navigations, so a role revoked between two
 * admin screens would go unnoticed. Every admin page repeats the guard itself.
 */

export const dynamic = "force-dynamic";

/** DESIGN.md: an absent value is written out, never left as a blank cell. */
function describirArea(area: string): string {
  return area.trim().length > 0 ? area : "Sin área";
}

/** What this person holds, in words. Zero is a sentence, not two noughts. */
function describirAccesos({ enlacesAsignados, procesadoresAsignados }: UsuarioListadoDTO): string {
  if (enlacesAsignados === 0 && procesadoresAsignados === 0) {
    return "Sin accesos asignados";
  }

  const enlaces = `${enlacesAsignados} ${enlacesAsignados === 1 ? "enlace" : "enlaces"}`;
  const procesadores = `${procesadoresAsignados} ${
    procesadoresAsignados === 1 ? "procesador" : "procesadores"
  }`;

  return `${enlaces} · ${procesadores}`;
}

export default async function AsignacionesPage() {
  const acceso = await guardPageAdmin();

  /* Before the read, so a refused reader never causes a query at all. */
  if (!acceso.allowed) {
    return acceso.screen;
  }

  const usuarios = await listarUsuarios(prisma);

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
        <h1>Asignaciones por usuario</h1>
        <p className="lx-meta">
          Elige a una persona para dar o quitar sus accesos a enlaces y procesadores. Cada cambio se
          aplica de inmediato: no hay un botón de guardado general.
        </p>
      </header>

      {usuarios.length === 0 ? (
        /*
         * There is no screen anywhere in this portal that creates a person: the
         * `usuario` row is written by the Entra ID login (ADR 0009), and by
         * nothing else. So the useful thing to say here is not "no hay datos"
         * but what actually makes someone appear.
         */
        <EmptyState
          title="Todavía no hay personas en el portal"
          description="Las cuentas se crean solas la primera vez que alguien entra al portal con su correo corporativo. Pide a esa persona que inicie sesión una vez y aparecerá aquí para asignarle accesos."
        />
      ) : (
        <div className={styles.personas}>
          {usuarios.map((usuario) => (
            <Link
              key={usuario.id}
              href={`/admin/asignaciones/${usuario.id}`}
              className={styles.persona}
            >
              <span className={styles.personaNombre} data-baja={usuario.activo ? undefined : "true"}>
                {usuario.nombre}
                {usuario.esAdmin ? <StatusChip tone="navy">Administrador</StatusChip> : null}
              </span>
              <span className="lx-meta">{usuario.correo}</span>
              <span className="lx-meta">{describirArea(usuario.area)}</span>
              {/* The count is shown for a deactivated account too, and that is
                  the point of showing it: those grants are still there and are
                  exactly what the assignment screen exists to strip. */}
              <span className="lx-meta">{describirAccesos(usuario)}</span>
              {usuario.activo ? null : <StatusDot tone="neutral">Dada de baja</StatusDot>}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
