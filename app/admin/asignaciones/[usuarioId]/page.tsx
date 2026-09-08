import Link from "next/link";

import { StatusChip } from "@/components/chip/chip";
import { EmptyState } from "@/components/states/empty-state";
import { StatusDot } from "@/components/status-dot/status-dot";
import { Topbar } from "@/components/topbar/topbar";
import { idRutaSchema } from "@/lib/asignaciones/schema";
import { type AuthorizedUsuario, guardPageAdmin } from "@/lib/authz";
import { listarEnlaces } from "@/lib/enlaces/repository";
import { prisma } from "@/lib/prisma";
import { listarProcesadores } from "@/lib/procesadores/repository";
import { leerUsuarioConAsignaciones } from "@/lib/usuarios/repository";

import { AsignacionesUsuario } from "../asignaciones-usuario";
import styles from "../asignaciones.module.css";

/**
 * The accesses of one person — backlog item #7's working screen.
 *
 * NO LAYOUT DOES THE GUARDING. `lib/authz/index.ts` explains that Next's Router
 * Cache reuses a layout across soft navigations, so an administrator role
 * revoked while someone walks from the picker to this page would go unnoticed.
 * Both pages repeat the guard; there is no `app/admin/layout.tsx`.
 *
 * WHY THREE READS INSTEAD OF ONE. The account's grants come as bare
 * identifiers; the two catalogues come whole, from the same `listarEnlaces` and
 * `listarProcesadores` the catalogue screens use. A single joined query would
 * return only the resources already granted, and the half this screen needs
 * most is the other one: everything still available to grant. None of it is
 * fetched from the portal's own API — a Server Component already holds the
 * database and the request's identity. The API is what the BROWSER uses, and
 * every switch on this screen goes through it.
 *
 * `force-dynamic` and `router.refresh()` are what make ADR 0007's promise
 * visible here: this page re-reads SQL Server on every request, so what a
 * switch shows is what the database said moments ago, never a cached grant.
 */

export const dynamic = "force-dynamic";

/** Next 16 hands dynamic route params to the page as a promise. */
interface Contexto {
  params: Promise<{ usuarioId: string }>;
}

/**
 * "There is no such person", for both ways of getting there: an id that is not
 * a number, and a number that matches no row. To the reader they are the same
 * thing — the link they followed is out of date.
 *
 * It takes the reader because it wears the bar too: this is a real screen
 * somebody can land on from a stale bookmark, and a screen with no way out is
 * the last place to drop one.
 */
function PersonaNoEncontrada({ usuario }: { usuario: AuthorizedUsuario }) {
  return (
    <main className="lx-main">
      <Topbar usuario={usuario} />

      <header className={styles.header}>
        <Link href="/admin/asignaciones" className={styles.volver}>
          ← Volver a la lista de personas
        </Link>
      </header>
      <EmptyState
        title="Esa persona ya no está en el portal"
        description="Puede que la cuenta se haya quitado o que el enlace esté desactualizado. Vuelve a la lista para ver quién está al día."
      />
    </main>
  );
}

export default async function AsignacionesDeUsuarioPage({ params }: Contexto) {
  const acceso = await guardPageAdmin();

  /* Before any read, so a refused reader never causes a query at all. */
  if (!acceso.allowed) {
    return acceso.screen;
  }

  const { usuarioId } = await params;
  /* The same schema the API parses its path with: an id of 99999999999 is
     answered here rather than by SQL Server as an overflow. */
  const id = idRutaSchema.safeParse(usuarioId);

  if (!id.success) {
    return <PersonaNoEncontrada usuario={acceso.usuario} />;
  }

  const usuario = await leerUsuarioConAsignaciones(prisma, id.data);

  if (usuario === null) {
    return <PersonaNoEncontrada usuario={acceso.usuario} />;
  }

  /* Only now: two catalogues nobody could be assigned from would be two
     pointless queries. */
  const [enlaces, procesadores] = await Promise.all([
    listarEnlaces(prisma),
    listarProcesadores(prisma),
  ]);

  return (
    <main className="lx-main">
      {/* La misma barra que el portal: identidad, tema, la puerta al rol y la
          salida. El «volver» de abajo sigue siendo el camino a la lista; el logo
          es el camino al portal. */}
      <Topbar usuario={acceso.usuario} />

      <header className={styles.header}>
        <Link href="/admin/asignaciones" className={styles.volver}>
          ← Volver a la lista de personas
        </Link>
        <div className={styles.identidad}>
          <h1>{usuario.nombre}</h1>
          {usuario.esAdmin ? <StatusChip tone="navy">Administrador</StatusChip> : null}
          {usuario.activo ? null : <StatusDot tone="neutral">Dada de baja</StatusDot>}
        </div>
        {/* Two spans and not one interpolated string: the e-mail is the account's
            identity and stays selectable and readable on its own. */}
        <p className="lx-meta">
          <span>{usuario.correo}</span>
          {usuario.area.trim().length > 0 ? <span>{` · ${usuario.area}`}</span> : null}
        </p>
        <p className="lx-meta">
          Cada interruptor se aplica de inmediato y se confirma solo: no hay un botón de guardado
          general. El acceso queda activo o retirado en la siguiente acción de esa persona.
        </p>
      </header>

      <AsignacionesUsuario usuario={usuario} enlaces={enlaces} procesadores={procesadores} />
    </main>
  );
}
