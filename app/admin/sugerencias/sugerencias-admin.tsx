"use client";

import { useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/button/button";
import { FilterChip, StatusChip } from "@/components/chip/chip";
import { Input } from "@/components/input/input";
import { EmptyState } from "@/components/states/empty-state";
import { Toast } from "@/components/toast/toast";
import { formatearFecha } from "@/lib/sugerencias/fechas";
import { ETIQUETA_ESTADO, TONO_ESTADO, textoDeAsiento } from "@/lib/sugerencias/etiquetas";
import type { SugerenciaAdminDTO } from "@/lib/sugerencias/repository";
import {
  ESTADOS_SUGERENCIA,
  type EstadoSugerencia,
  MINIMO_POR_GRUPO,
  TITULO_GRUPO_MAX,
} from "@/lib/sugerencias/schema";

import { armarBloques, resumenDeGrupo } from "./agrupacion";
import {
  AVISO_SIN_ACTUALIZAR,
  CONFIRMACION_QUITAR,
  OPCIONES_TODAS,
  RUTA_TODAS,
  agruparSugerencias,
  cambiarEstado,
  confirmacionDeCambio,
  confirmacionDeGrupo,
  obtenerTodas,
  quitarDeGrupo,
  type ResultadoGrupo,
} from "./sugerencias-client";
import styles from "./sugerencias.module.css";

/**
 * La gestión de sugerencias — the interactive half of items #15 and #16.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SWR HERE, `router.refresh()` ON THE OTHER ADMIN SCREENS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `enlaces-admin` and `procesadores-admin` keep no local copy: they call
 * `router.refresh()` after every action and let the Server Component re-read. It
 * is the right shape there, because a catalogue only ever changes when an
 * administrator on that very screen changes it — nothing arrives on its own.
 *
 * This list does. A collaborator sending a suggestion is a row appearing in front
 * of a reviewer who did nothing, which is exactly the case ADR 0007 wrote the
 * revalidation policy for, and `refresh()` alone would show it only when somebody
 * happened to press something. So this screen takes the collaborator box's shape
 * instead: server read for the first paint, SWR for the two clocks.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FILTER IS CLIENT-SIDE, OVER A LIST THAT IS ALREADY HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The endpoint answers with every suggestion and the chips narrow what is drawn.
 * That means no round trip per chip, no second SWR key per state, and — the part
 * that matters — no state parameter on a route whose scope is the thing item #13
 * asked us to be careful with. The counts beside each label are computed from the
 * same array, so they are the real numbers and not a second query that can
 * disagree with the list under it.
 *
 * `listarSugerencias` documents the lifespan of that decision: the day this table
 * is in the thousands, the filter moves to the server and the read takes a cursor.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A STATE CHANGE PATCHES ONE ENTRY. A GROUPING CHANGE REPLACES THE LIST.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Not an inconsistency — the two writes have different blast radii, and the cache
 * update mirrors that exactly.
 *
 * A review affects the row it named, so the 200 carries that row and `mutate`
 * swaps it in place, which keeps the list's order (the read is sorted by creation
 * date, and reviewing does not change when something was written).
 *
 * A grouping change can dissolve a group and free a suggestion NOBODY NAMED, so
 * both grouping routes answer with the whole list and `mutate` replaces the cache
 * wholesale. Patching entries from a partial answer would leave a group on screen
 * that the database had already deleted.
 *
 * Neither is optimistic. Nothing moves until the database says it moved, because
 * a reviewer who sees "Aprobada" is entitled to believe the author will see it
 * too.
 */

export interface SugerenciasAdminProps {
  /** What the Server Component read on this request: the first paint and SWR's `fallbackData`. */
  sugerenciasIniciales: readonly SugerenciaAdminDTO[];
}

/** The chip that shows everything — not a state, so it is not in the vocabulary. */
const TODOS = "todos" as const;

type Filtro = typeof TODOS | EstadoSugerencia;

const VACIO_TITULO = "Todavía no hay sugerencias";
const VACIO_DESCRIPCION =
  "Cuando alguien envíe una idea desde el buzón, aparecerá acá con su estado y su seguimiento.";

/**
 * The empty state of a FILTER is not the empty state of the box, and saying so
 * matters: "no hay sugerencias" under an active chip would read as "nobody has
 * sent anything" when in fact four are waiting one chip away.
 */
const SIN_COINCIDENCIAS_TITULO = "Ninguna sugerencia en ese estado";
const SIN_COINCIDENCIAS_DESCRIPCION =
  "Cambia el filtro para ver las demás. El listado completo sigue estando disponible en «Todas».";

/**
 * One suggestion, with the five buttons that move it and the checkbox that
 * selects it for grouping.
 *
 * The current state is a `StatusChip` in the header AND is disabled among the
 * buttons below: the chip reports where the suggestion is, the buttons offer
 * where it can go, and the one it is already in is not somewhere it can go. That
 * is also the client half of the repository's refusal of a same-state
 * transition — the server is what enforces it, this only avoids asking.
 */
function Tarjeta({
  sugerencia,
  seleccionada,
  onSeleccionar,
  onCambiar,
  onQuitarDeGrupo,
  ocupada,
}: {
  sugerencia: SugerenciaAdminDTO;
  seleccionada: boolean;
  onSeleccionar: (seleccionada: boolean) => void;
  onCambiar: (estado: EstadoSugerencia) => void;
  onQuitarDeGrupo: () => void;
  ocupada: boolean;
}) {
  return (
    <article className={styles.tarjeta}>
      <header className={styles.tarjetaHeader}>
        {/*
          * A native checkbox, dressed in the stylesheet — the same treatment
          * `enlaces.module.css` gives its <select> and the buzón gives its
          * <textarea>. The components layer ships no checkbox, and inventing one
          * for a single screen is a component nobody else asked for.
          */}
        <label className={styles.seleccion}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={seleccionada}
            disabled={ocupada}
            onChange={(evento) => onSeleccionar(evento.target.checked)}
          />
          {/* Visually the checkbox stands alone; assistive tech needs the name. */}
          <span className={styles.soloLectores}>Seleccionar «{sugerencia.titulo}»</span>
        </label>

        <h3 className={styles.tarjetaTitulo}>{sugerencia.titulo}</h3>

        <StatusChip tone={TONO_ESTADO[sugerencia.estado]}>
          {ETIQUETA_ESTADO[sugerencia.estado]}
        </StatusChip>
      </header>

      {/*
        * The author's own area and the destination area are two different facts —
        * the PRD lets someone write a suggestion for an area that is not theirs —
        * so both are named rather than one standing in for the other.
        */}
      <p className="lx-meta">
        {sugerencia.autor.nombre}
        {sugerencia.autor.area === "" ? "" : ` · ${sugerencia.autor.area}`} · Enviada el{" "}
        {formatearFecha(sugerencia.fechaCreacion)} · Para {sugerencia.areaDestino}
      </p>

      {/* `white-space: pre-line` in the stylesheet: the line breaks the author
          wrote are part of what they wrote. */}
      <p className={styles.descripcion}>{sugerencia.descripcion}</p>

      <div
        className={styles.acciones}
        role="group"
        aria-label={`Cambiar estado de ${sugerencia.titulo}`}
      >
        {ESTADOS_SUGERENCIA.map((estado) => (
          <Button
            key={estado}
            variant={estado === sugerencia.estado ? "primary" : "secondary"}
            disabled={ocupada || estado === sugerencia.estado}
            /* The label alone is ambiguous once five cards are on screen: every
               one of them has a button that says "Aprobada". */
            aria-label={`Marcar «${sugerencia.titulo}» como ${ETIQUETA_ESTADO[estado]}`}
            onClick={() => onCambiar(estado)}
          >
            {ETIQUETA_ESTADO[estado]}
          </Button>
        ))}

        {/*
          * The way out of a group, offered only where there is one to leave.
          * Item #16's correction path: without it, filing an idea into the wrong
          * bucket would be fixable only against the database.
          */}
        {sugerencia.grupo === null ? null : (
          <Button
            variant="text"
            disabled={ocupada}
            aria-label={`Quitar «${sugerencia.titulo}» del grupo`}
            onClick={onQuitarDeGrupo}
          >
            Quitar del grupo
          </Button>
        )}
      </div>

      {/*
        * The same trail the author sees on their own screen, from the same
        * helper. The administrator reads it before deciding, and it is the
        * "recorrido completo … consultable" of TECH-DESIGN.md — an ordered list
        * because the order IS the information.
        *
        * Grouping never adds a line here: ADR 0002 defines this ledger as one row
        * per state TRANSITION, and filing an idea into a bucket is not one.
        */}
      <div className={styles.historial}>
        <h4 className={`${styles.historialTitulo} lx-label`}>Seguimiento</h4>
        <ol className={styles.historialLista}>
          {sugerencia.historial.map((asiento) => (
            <li key={asiento.id} className={styles.asiento}>
              <span className={styles.transicion}>{textoDeAsiento(asiento)}</span>
              <span className="lx-meta">
                {formatearFecha(asiento.fechaCambio)} · {asiento.autor}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

/**
 * The bar that turns a selection into a group.
 *
 * It appears only once the selection reaches the minimum, and that is not a
 * cosmetic threshold: `crearGrupoSchema` refuses fewer than two and the endpoint
 * would answer 400. Showing an enabled control that the server is certain to
 * reject is a promise the screen cannot keep — so the bar's own existence is the
 * message that one card is not a group.
 */
function BarraDeAgrupacion({
  cantidad,
  agrupando,
  onAgrupar,
  onCancelar,
}: {
  cantidad: number;
  agrupando: boolean;
  onAgrupar: (titulo: string) => void;
  onCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState("");

  const listo = titulo.trim().length > 0;

  return (
    <form
      className={styles.barra}
      aria-label="Agrupar las sugerencias seleccionadas"
      /* `noValidate` for the reason every form here sets it: the browser's own
         bubbles are the browser's wording, and DESIGN.md asks for "copys en
         español, directos". */
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        if (listo && !agrupando) onAgrupar(titulo.trim());
      }}
    >
      <p className={styles.barraTexto}>
        <strong>{cantidad}</strong> sugerencias seleccionadas
      </p>

      {/* `Input` generates its own id so two fields sharing a label still get
          separate associations; callers deliberately cannot pass one. */}
      <Input
        label="Nombre del grupo"
        value={titulo}
        maxLength={TITULO_GRUPO_MAX}
        placeholder="Ej.: Tableros de peajes"
        disabled={agrupando}
        onChange={(evento) => setTitulo(evento.target.value)}
      />

      <div className={styles.barraAcciones}>
        <Button type="submit" variant="primary" disabled={!listo || agrupando}>
          {agrupando ? "Agrupando…" : "Agrupar"}
        </Button>
        <Button variant="text" disabled={agrupando} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function SugerenciasAdmin({ sugerenciasIniciales }: SugerenciasAdminProps) {
  const { data, error, mutate } = useSWR<readonly SugerenciaAdminDTO[]>(
    RUTA_TODAS,
    obtenerTodas,
    { ...OPCIONES_TODAS, fallbackData: sugerenciasIniciales },
  );

  const [filtro, setFiltro] = useState<Filtro>(TODOS);
  /** The ids ticked for grouping. */
  const [seleccion, setSeleccion] = useState<readonly number[]>([]);
  /** The id being reviewed, or `"grupo"` while a grouping write is in flight. */
  const [ocupado, setOcupado] = useState<number | "grupo" | null>(null);
  /** The API's own sentence, shown unchanged. */
  const [alerta, setAlerta] = useState<string | null>(null);
  /*
   * The nonce is what lets the same confirmation appear twice in a row: the Toast
   * restarts its lifetime on a new `key`, and two suggestions marked "Aprobada"
   * back to back otherwise carry an identical message and would show nothing the
   * second time.
   */
  const [confirmacion, setConfirmacion] = useState<{ mensaje: string; nonce: number } | null>(null);

  /* `fallbackData` guarantees a value from the first render, so this is a
     type-level fallback and not a state the reader can ever see. */
  const sugerencias = data ?? sugerenciasIniciales;

  function confirmar(mensaje: string) {
    setConfirmacion((previa) => ({ mensaje, nonce: (previa?.nonce ?? 0) + 1 }));
  }

  async function revisar(sugerencia: SugerenciaAdminDTO, estado: EstadoSugerencia) {
    if (ocupado !== null) return;

    setOcupado(sugerencia.id);
    setAlerta(null);

    const resultado = await cambiarEstado(sugerencia.id, estado);

    setOcupado(null);

    if (!resultado.ok) {
      /* Straight from `lib/api/errors`, which is written to be read by a person —
         including the 409 that says somebody else moved this row first. */
      setAlerta(resultado.mensaje);
      return;
    }

    /*
     * ════════════════════════════════════════════════════════════════════════
     *  `actuales` IS `undefined` UNTIL A REVALIDATION HAS LANDED
     * ════════════════════════════════════════════════════════════════════════
     *
     * `fallbackData` is NOT written into SWR's cache — it is what the hook
     * returns while the cache is empty — so the updater's argument is `undefined`
     * for as long as no fetch has resolved, which on this screen is the whole
     * first minute. Falling back to `[]` there would empty the inbox down to the
     * single row just reviewed and then quietly refill it a minute later. The
     * fallback is the server's own list, which is exactly what is on screen
     * whenever the cache is still empty. (Item #13 shipped this bug once and its
     * suite caught it; the same shape is used here on purpose.)
     */
    await mutate(
      (actuales) =>
        (actuales ?? sugerenciasIniciales).map((fila) =>
          fila.id === resultado.sugerencia.id ? resultado.sugerencia : fila,
        ),
      { revalidate: false },
    );

    confirmar(confirmacionDeCambio(ETIQUETA_ESTADO[estado]));
  }

  /**
   * The two grouping writes, which differ from a review in how their answer is
   * absorbed: the server sends the WHOLE list, so the cache is replaced rather
   * than patched. See the note at the top of this file.
   */
  async function aplicarGrupo(accion: () => Promise<ResultadoGrupo>, mensaje: string) {
    if (ocupado !== null) return;

    setOcupado("grupo");
    setAlerta(null);

    const resultado = await accion();

    setOcupado(null);

    if (!resultado.ok) {
      setAlerta(resultado.mensaje);
      return;
    }

    await mutate(resultado.sugerencias, { revalidate: false });

    /* The selection described rows whose grouping just changed; keeping the ticks
       would invite a second action against a list that has moved on. */
    setSeleccion([]);
    confirmar(mensaje);
  }

  function alternarSeleccion(id: number, seleccionada: boolean) {
    setSeleccion((previa) =>
      seleccionada ? [...previa, id] : previa.filter((elegido) => elegido !== id),
    );
  }

  const visibles =
    filtro === TODOS ? sugerencias : sugerencias.filter((fila) => fila.estado === filtro);

  const bloques = armarBloques(visibles, sugerencias);

  function tarjetaDe(sugerencia: SugerenciaAdminDTO) {
    return (
      <Tarjeta
        key={sugerencia.id}
        sugerencia={sugerencia}
        seleccionada={seleccion.includes(sugerencia.id)}
        ocupada={ocupado !== null}
        onSeleccionar={(marcada) => alternarSeleccion(sugerencia.id, marcada)}
        onCambiar={(estado) => void revisar(sugerencia, estado)}
        onQuitarDeGrupo={() =>
          void aplicarGrupo(() => quitarDeGrupo(sugerencia.id), CONFIRMACION_QUITAR)
        }
      />
    );
  }

  return (
    <>
      {/*
        * DESIGN.md "Chips de filtro": pill, activo = navy relleno. `FilterChip`
        * carries `aria-pressed`, which is what tells assistive tech which one is
        * on; the fill is only the visual half of that same fact.
        */}
      <div className={styles.filtros} role="group" aria-label="Filtrar por estado">
        <FilterChip
          label={`Todas (${sugerencias.length})`}
          selected={filtro === TODOS}
          onSelect={() => setFiltro(TODOS)}
        />
        {ESTADOS_SUGERENCIA.map((estado) => (
          <FilterChip
            key={estado}
            label={`${ETIQUETA_ESTADO[estado]} (${sugerencias.filter((fila) => fila.estado === estado).length})`}
            selected={filtro === estado}
            onSelect={() => setFiltro(estado)}
          />
        ))}
      </div>

      {seleccion.length >= MINIMO_POR_GRUPO ? (
        <BarraDeAgrupacion
          /* Remounted per selection size so the title field starts empty for each
             new group rather than carrying the previous name forward. */
          key={`barra-${seleccion.length}`}
          cantidad={seleccion.length}
          agrupando={ocupado === "grupo"}
          onAgrupar={(titulo) =>
            void aplicarGrupo(
              () => agruparSugerencias(titulo, seleccion),
              confirmacionDeGrupo(seleccion.length),
            )
          }
          onCancelar={() => setSeleccion([])}
        />
      ) : null}

      {alerta ? (
        <p className={styles.alerta} role="alert">
          {alerta}
        </p>
      ) : null}

      {error ? (
        /* "status" and not "alert": a background refresh nobody asked for did not
           land, and everything on screen is still usable. Ámbar and not red —
           DESIGN.md reserves red for errors and destructive actions. */
        <p className={styles.aviso} role="status">
          {AVISO_SIN_ACTUALIZAR}
        </p>
      ) : null}

      <section className={styles.listado} aria-labelledby="listado-sugerencias">
        <h2 id="listado-sugerencias" className={styles.listadoTitulo}>
          Sugerencias recibidas
        </h2>

        {sugerencias.length === 0 ? (
          <EmptyState title={VACIO_TITULO} description={VACIO_DESCRIPCION} />
        ) : bloques.length === 0 ? (
          <EmptyState title={SIN_COINCIDENCIAS_TITULO} description={SIN_COINCIDENCIAS_DESCRIPCION} />
        ) : (
          bloques.map((bloque) =>
            bloque.tipo === "suelta" ? (
              tarjetaDe(bloque.sugerencia)
            ) : (
              /*
               * "Las sugerencias agrupadas se muestran juntas" — a <section> with
               * its own heading, so the grouping is structure a screen reader can
               * navigate and not just a box drawn around some cards.
               */
              <section
                key={`grupo-${bloque.grupo.id}`}
                className={styles.grupo}
                aria-labelledby={`grupo-${bloque.grupo.id}-titulo`}
              >
                <header className={styles.grupoHeader}>
                  <h3 id={`grupo-${bloque.grupo.id}-titulo`} className={styles.grupoTitulo}>
                    {bloque.grupo.titulo}
                  </h3>
                  <span className="lx-meta">
                    {resumenDeGrupo(bloque.miembros.length, bloque.total)}
                  </span>
                </header>

                {bloque.miembros.map(tarjetaDe)}
              </section>
            ),
          )
        )}
      </section>

      {confirmacion ? (
        <Toast
          key={`toast-${confirmacion.nonce}`}
          message={confirmacion.mensaje}
          onDismiss={() => setConfirmacion(null)}
        />
      ) : null}
    </>
  );
}
