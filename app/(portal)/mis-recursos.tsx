"use client";

import Link from "next/link";
import useSWR from "swr";

import { StatusChip } from "@/components/chip/chip";
import { EmptyState } from "@/components/states/empty-state";
import { Table, type TableColumn } from "@/components/table/table";
import type { RecursoAsignado } from "@/lib/mis-recursos/repository";

import { ETIQUETA_RECURSO, TONO_RECURSO } from "./etiquetas";
import {
  AVISO_SIN_ACTUALIZAR,
  OPCIONES_MIS_RECURSOS,
  RUTA_MIS_RECURSOS,
  obtenerMisRecursos,
} from "./mis-recursos-client";
import styles from "./portal.module.css";

/**
 * The collaborator's list of assigned resources — the live half of the
 * dashboard.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE SERVER READ AND THE CLIENT CACHE BOTH EXIST
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `page.tsx` reads `listarRecursosAsignados` directly and hands the result down
 * as `recursosIniciales`; this component gives that array to SWR as
 * `fallbackData` and lets SWR own everything after the first paint.
 *
 * Neither half is redundant.
 *
 * The server read is what removes the spinner. This is the screen a
 * collaborator lands on after logging in, and a Server Component already holds
 * the database connection and the request's identity — fetching `/api/mis-
 * recursos` from the browser instead would mean painting an empty dashboard and
 * then filling it, on the one screen where the reader's whole reason for being
 * here is to see a list.
 *
 * The client cache is what keeps the list honest afterwards. A server render is
 * a photograph of one instant; ADR 0007 promises that a revoked resource
 * "desaparece del dashboard en la siguiente interacción". Without SWR, a tab
 * left open for an afternoon would still be showing the morning's grants.
 *
 * This is also why part 1 built a GET the admin screens (#5 to #7) never needed:
 * they mutate and call `router.refresh()`, so their data is never stale for
 * longer than an action takes. This screen mutates nothing and can still go
 * stale, because the change comes from someone else's screen entirely.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A FAILED REFRESH NEVER BLANKS A WORKING DASHBOARD
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `data` is whatever SWR last resolved successfully — the server's list until a
 * revalidation replaces it — and `error` is the last failure. They coexist on
 * purpose: when a refresh fails, SWR hands back the previous `data` AND the
 * error, so the table keeps rendering rows that are still perfectly usable while
 * a line above it says the list may be out of date.
 *
 * The fetcher's job is to make that distinction possible: it throws on every
 * failure rather than answering an empty list, so "the server could not be
 * reached" is never mistaken for "you have nothing assigned". See
 * `mis-recursos-client.ts`.
 */

export interface MisRecursosProps {
  /**
   * What the Server Component read from SQL Server on this request. It is the
   * first paint and SWR's `fallbackData`, not component state — nothing here
   * ever writes to this list.
   */
  recursosIniciales: readonly RecursoAsignado[];
}

const VACIO_TITULO = "Todavía no tienes recursos asignados";

/**
 * ONE MESSAGE FOR TWO CAUSES, AND IT IS NOT A SHORTCUT.
 *
 * An empty list means either that nobody has assigned this collaborator
 * anything, or that there is nothing in the catalogues to assign. From here the
 * two are indistinguishable — and they should stay that way:
 *
 * - The reader's next step is identical in both cases: ask the Área de
 *   Innovación. A message that split them would ask them to understand an
 *   internal state before doing the same thing either way.
 * - Telling them apart would require this screen to know how many resources
 *   exist, which is a count of the administrative catalogue. That is a read
 *   this endpoint deliberately does not make and does not expose: the size of
 *   the portal is not something an unassigned collaborator is entitled to.
 *
 * So the copy describes the reader's situation, never the system's. DESIGN.md's
 * empty state asks for exactly that — "explicación de quién asigna" — and the
 * contact action stays off, as `EmptyState` documents, because how one reaches
 * the Área de Innovación is still not defined anywhere.
 */
const VACIO_DESCRIPCION =
  "El Área de Innovación asigna las aplicaciones, los agentes de IA y los procesadores del " +
  "portal. En cuanto te asignen alguno, aparecerá aquí.";

/**
 * The action of one row.
 *
 * An `app` and an `agente` are opened the same way — the repository's own
 * comment says so — so the only branch here is between opening an address and
 * going to a screen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ITEM #10 REPLACED A LABEL WITH A LINK, AND THE TWO ARE NOT THE SAME KIND OF
 *  DESTINATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Until this item shipped, a procesador row said "Disponible próximamente" as
 * plain text: the execution screen did not exist, and a link to it would have
 * 404ed while a disabled button would have read as a permission the reader did
 * not have. Both are now moot — the screen exists at `/procesadores/{id}`.
 *
 * WHY THIS ONE IS `Link` AND THE ENLACE IS AN ANCHOR. They are different
 * journeys, not two spellings of one. An enlace leaves the portal for an
 * external address, in a new tab, through a route that answers 302 — so it must
 * be a real anchor the browser navigates. A procesador stays inside the portal,
 * in this tab, on a page the client router can render without a document load.
 * Using an anchor here would throw away the router; using `Link` there would
 * not survive the redirect.
 *
 * WHY NOT A NEW TAB EITHER. The execution screen is where the reader works for
 * up to two minutes and receives a download; sending them to a second tab would
 * separate that work from the portal they came from, and the screen already
 * carries its own way back.
 */
function accion(recurso: RecursoAsignado) {
  if (recurso.tipo === "procesador") {
    return (
      <Link
        className="lx-btn lx-btn-secondary"
        href={`/procesadores/${recurso.id}`}
        /* Every row's action says the same word; the name is what tells them
           apart for anyone navigating by link. */
        aria-label={`Ejecutar ${recurso.nombre}`}
      >
        Ejecutar
      </Link>
    );
  }

  return (
    /*
     * AN ANCHOR, AND ONLY AN ANCHOR. The route answers 302 to the enlace's own
     * address after authorising the grant and recording the apertura, so the
     * browser has to follow it as a navigation. A button that awaited a JSON
     * call and then called `window.open` would spend the click's transient
     * activation and be cancelled by the popup blocker — the reason
     * `app/api/enlaces/[id]/abrir/route.ts` is a redirect in the first place.
     *
     * The href is the PORTAL's route, never the destination: the external
     * address is not in the API's response, is not in this component's props,
     * and must not be reconstructed here. Every open goes through the guard,
     * which is what makes a revocation apply to this very click.
     *
     * `noopener` is not optional — without it the opened page holds a handle to
     * this one through `window.opener` and can navigate the portal's tab
     * elsewhere (reverse tabnabbing).
     *
     * Secondary and not primary: DESIGN.md allows "una acción primaria (navy)
     * por vista", and a table of ten rows would otherwise carry ten of them.
     */
    <a
      className="lx-btn lx-btn-secondary"
      href={`/api/enlaces/${recurso.id}/abrir`}
      target="_blank"
      rel="noopener noreferrer"
      /* Every row's action says "Abrir"; the name is what tells them apart for
         anyone navigating by link, and the new tab is worth announcing. */
      aria-label={`Abrir ${recurso.nombre} en una pestaña nueva`}
    >
      Abrir
    </a>
  );
}

const COLUMNAS: readonly TableColumn<RecursoAsignado>[] = [
  {
    key: "nombre",
    header: "Recurso",
    cell: (recurso) => (
      <span className={styles.nombre}>
        <span className={styles.nombreTexto}>{recurso.nombre}</span>
        {recurso.descripcion ? <span className="lx-meta">{recurso.descripcion}</span> : null}
      </span>
    ),
  },
  {
    key: "tipo",
    header: "Tipo",
    cell: (recurso) => (
      <StatusChip tone={TONO_RECURSO[recurso.tipo]}>{ETIQUETA_RECURSO[recurso.tipo]}</StatusChip>
    ),
  },
  {
    key: "accion",
    header: "Acción",
    align: "end",
    cell: accion,
  },
];

export function MisRecursos({ recursosIniciales }: MisRecursosProps) {
  const { data, error } = useSWR<readonly RecursoAsignado[]>(
    RUTA_MIS_RECURSOS,
    obtenerMisRecursos,
    { ...OPCIONES_MIS_RECURSOS, fallbackData: recursosIniciales },
  );

  /* `fallbackData` guarantees a value from the first render, so this is a
     type-level fallback and not a state the reader can ever see. */
  const recursos = data ?? recursosIniciales;

  return (
    <>
      {error ? (
        /*
         * "status" and not "alert": a background refresh nobody asked for did
         * not land, and everything on screen is still usable. An alert would
         * interrupt a screen reader mid-sentence to report a non-event.
         *
         * Ámbar and not red. DESIGN.md reserves red for errors and destructive
         * actions; the list is not wrong, it may be a minute old. Amber is the
         * tone for exactly that difference.
         */
        <p className={styles.aviso} role="status">
          {AVISO_SIN_ACTUALIZAR}
        </p>
      ) : null}

      {recursos.length === 0 ? (
        <EmptyState title={VACIO_TITULO} description={VACIO_DESCRIPCION} />
      ) : (
        <>
          {/*
            * The note that used to sit under this table — explaining that
            * procesadores were assigned but not yet runnable — went away with
            * item #10, along with the wait it was apologising for. Every row in
            * this list now has an action that works.
            */}
          <div className={styles.tabla}>
            <Table
              caption="Recursos asignados a tu cuenta"
              columns={COLUMNAS}
              rows={recursos}
              /* ADR 0002 keeps enlaces and procesadores in different tables, so
                 an id can repeat across them: the pair is the identity. */
              rowKey={(recurso) => `${recurso.tipo}-${recurso.id}`}
            />
          </div>
        </>
      )}
    </>
  );
}
