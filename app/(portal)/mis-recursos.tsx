"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { FilterChip, StatusChip } from "@/components/chip/chip";
import { EmptyState } from "@/components/states/empty-state";
import type { RecursoAsignado, TipoRecursoAsignado } from "@/lib/mis-recursos/repository";

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
 * error, so the grid keeps rendering cards that are still perfectly usable while
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
 * The action of one card.
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
        className={`lx-btn ${styles.tarjetaAccion}`}
        href={`/procesadores/${recurso.id}`}
        /* Every card's action says the same word; the name is what tells them
           apart for anyone navigating by link. */
        aria-label={`Usar ${recurso.nombre}`}
      >
        {/* «Usar» y no «Ejecutar»: la pantalla a la que lleva llama a SU acción
            «Procesar», así que «Ejecutar» acá era una tercera palabra para el
            mismo viaje. Este botón dice a qué se va, el de allá qué hace. */}
        Usar
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
     * NO ES NAVY, y por la regla de siempre: DESIGN.md admite "una acción
     * primaria (navy) por vista", y una grilla de diez tarjetas llevaría diez.
     * El relleno suave de `.tarjetaAccion` le da el peso que un contorno fino
     * no le daba sin reclamar ese lugar; `portal.module.css` lo argumenta.
     */
    <a
      className={`lx-btn ${styles.tarjetaAccion}`}
      href={`/api/enlaces/${recurso.id}/abrir`}
      target="_blank"
      rel="noopener noreferrer"
      /* Every card's action says "Abrir"; the name is what tells them apart for
         anyone navigating by link, and the new tab is worth announcing. */
      aria-label={`Abrir ${recurso.nombre} en una pestaña nueva`}
    >
      Abrir
    </a>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  POR QUÉ ESTO DEJÓ DE SER UNA TABLA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una tabla sirve para COMPARAR filas por sus columnas: se lee en vertical, una
 * columna a la vez, y gana cuando hay muchas filas y la pregunta es «cuál de
 * todas». Esta pantalla no es eso. El colaborador tiene tres o cuatro recursos,
 * ya sabe cuál quiere, y lo que necesita de cada uno es qué hace y cómo entrar
 * — dos cosas que en la tabla quedaban apretadas en una celda y en un botón al
 * otro extremo de la fila.
 *
 * La tarjeta las pone juntas y le da a cada recurso el tamaño de un objeto en
 * vez del de un renglón. Y como el catálogo tiene tres clases con significados
 * distintos, cada tarjeta lleva el color de la suya en el borde superior: el
 * tipo se reconoce antes de leer el chip.
 *
 * SIN ICONOS DECORATIVOS. DESIGN.md los admite «solo como iconografía funcional
 * discreta (⇄, 🔒, ⚠); no decorativos», así que el único glifo de la pantalla
 * es el `↗` de la acción que se va del portal — dice a dónde lleva el clic, no
 * adorna la tarjeta.
 */

/** El orden en que se muestran las clases, para que los filtros no bailen. */
const ORDEN_TIPOS: readonly TipoRecursoAsignado[] = ["app", "agente", "procesador"];

/** Los filtros en plural, que es como se nombra un conjunto y no un elemento. */
const ETIQUETA_FILTRO: Record<TipoRecursoAsignado, string> = {
  app: "Aplicaciones",
  agente: "Agentes de IA",
  procesador: "Procesadores",
};

const TODOS = "todos" as const;
type Filtro = typeof TODOS | TipoRecursoAsignado;

export function MisRecursos({ recursosIniciales }: MisRecursosProps) {
  const { data, error } = useSWR<readonly RecursoAsignado[]>(
    RUTA_MIS_RECURSOS,
    obtenerMisRecursos,
    { ...OPCIONES_MIS_RECURSOS, fallbackData: recursosIniciales },
  );

  /* `fallbackData` guarantees a value from the first render, so this is a
     type-level fallback and not a state the reader can ever see. */
  const recursos = data ?? recursosIniciales;

  const [filtro, setFiltro] = useState<Filtro>(TODOS);

  /*
   * LOS FILTROS SALEN DE LA LISTA, NO DE LA LISTA DE TIPOS POSIBLES. Un chip
   * que no puede devolver nada es una promesa vacía: quien tiene dos apps no
   * necesita que el portal le ofrezca filtrar por procesadores para descubrir
   * que no tiene ninguno. Y como cada chip existe solo si hay al menos una
   * tarjeta suya, ningún filtro puede dejar la grilla vacía — por eso esta
   * pantalla no necesita un estado de «sin resultados».
   */
  const tiposPresentes = ORDEN_TIPOS.filter((tipo) =>
    recursos.some((recurso) => recurso.tipo === tipo),
  );

  /*
   * Una revalidación puede llevarse el último recurso de la clase filtrada
   * mientras el lector la tiene elegida — un acceso que alguien revocó del otro
   * lado. Sin esto el chip desaparecería y la grilla quedaría vacía sin que
   * nada explique por qué. React's "adjust state when a prop changes", durante
   * el render.
   */
  if (filtro !== TODOS && !tiposPresentes.includes(filtro)) {
    setFiltro(TODOS);
  }

  const visibles =
    filtro === TODOS ? recursos : recursos.filter((recurso) => recurso.tipo === filtro);

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
            * Los chips aparecen solo cuando hay más de una clase que separar:
            * con tres apps y nada más, «Todos» y «Aplicaciones» devuelven lo
            * mismo, y un filtro que no filtra es un control que hay que leer
            * para descubrir que no hacía falta.
            *
            * DESIGN.md "Chips de filtro": pill, activo = navy relleno.
            * `FilterChip` lleva el `aria-pressed` que le dice a la tecnología
            * asistiva cuál está puesto.
            */}
          {tiposPresentes.length > 1 ? (
            <div className={styles.filtros} role="group" aria-label="Filtrar por tipo de recurso">
              <FilterChip
                label="Todos"
                selected={filtro === TODOS}
                onSelect={() => setFiltro(TODOS)}
              />
              {tiposPresentes.map((tipo) => (
                <FilterChip
                  key={tipo}
                  label={ETIQUETA_FILTRO[tipo]}
                  selected={filtro === tipo}
                  onSelect={() => setFiltro(tipo)}
                />
              ))}
            </div>
          ) : null}

          <ul className={styles.grilla} aria-label="Recursos asignados a tu cuenta">
            {visibles.map((recurso) => (
              <li
                /* ADR 0002 keeps enlaces and procesadores in different tables, so
                   an id can repeat across them: the pair is the identity. */
                key={`${recurso.tipo}-${recurso.id}`}
                className={styles.tarjeta}
                /* De acá sale el color del borde superior: la clase se reconoce
                   antes de leer el chip. */
                data-tipo={recurso.tipo}
              >
                {/* `h2` bajo el «Hola, …» de la página: la grilla es una lista de
                    secciones navegables por encabezado, no un párrafo en negrita.
                    Abre la tarjeta porque es lo que el lector busca — el tipo lo
                    adelanta el color del borde y lo confirma el chip del pie. */}
                <h2 className={styles.tarjetaNombre}>{recurso.nombre}</h2>

                {recurso.descripcion ? (
                  <p className={styles.tarjetaDescripcion}>{recurso.descripcion}</p>
                ) : null}

                {/* `margin-top: auto` en el CSS lo empuja abajo, así que todas las
                    acciones quedan alineadas aunque las descripciones midan
                    distinto. */}
                {/*
                  * EL TIPO CIERRA LA TARJETA, junto a la acción.
                  *
                  * Antes acá iba una frase — «Se abre en una pestaña nueva» —
                  * que el botón ya dice mejor: el `↗` lo muestra y su
                  * `aria-label` lo escribe para quien no lo ve. Esa línea
                  * gastaba el pie en repetir lo que estaba al lado.
                  *
                  * El chip sí gana con el cambio de lugar. Arriba competía con
                  * el nombre por la primera mirada; abajo confirma lo que el
                  * color del borde ya adelantó, y deja que la tarjeta empiece
                  * por lo que el lector vino a buscar.
                  */}
                <div className={styles.tarjetaPie}>
                  <StatusChip tone={TONO_RECURSO[recurso.tipo]}>
                    {ETIQUETA_RECURSO[recurso.tipo]}
                  </StatusChip>
                  {accion(recurso)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
