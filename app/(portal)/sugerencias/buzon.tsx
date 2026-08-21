"use client";

import { useState } from "react";
import useSWR from "swr";

import { StatusChip } from "@/components/chip/chip";
import { EmptyState } from "@/components/states/empty-state";
import { Toast } from "@/components/toast/toast";
import { ETIQUETA_ESTADO, TONO_ESTADO, textoDeAsiento } from "@/lib/sugerencias/etiquetas";
import type { SugerenciaDTO } from "@/lib/sugerencias/repository";
import type { CrearSugerencia } from "@/lib/sugerencias/schema";

import { SugerenciaForm } from "./sugerencia-form";
import {
  AVISO_SIN_ACTUALIZAR,
  CONFIRMACION_ENVIO,
  OPCIONES_SUGERENCIAS,
  RUTA_SUGERENCIAS,
  enviarSugerencia,
  formatearFecha,
  obtenerSugerencias,
} from "./sugerencias-client";
import styles from "./sugerencias.module.css";

/**
 * El buzón de sugerencias — the whole of item #13 on the collaborator's side:
 * the form that sends, and the list of what you sent with its trail.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE SERVER READ AND THE CLIENT CACHE BOTH EXIST
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The same arrangement as the dashboard, for the same two reasons. `page.tsx`
 * reads the list directly and hands it down as `sugerenciasIniciales`, so the
 * screen paints filled instead of empty; SWR then owns it, revalidating on focus
 * and every minute, so a state an administrator changed on another screen shows
 * up here without a reload.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A SUCCESSFUL SEND UPDATES THE LIST WITHOUT ASKING THE SERVER AGAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The 201 carries the registered suggestion — the real row, with its real id,
 * its state and its ledger already opened — so there is nothing a refetch would
 * discover. `mutate` prepends it with `revalidate: false`.
 *
 * PREPENDS, not appends, and that is not cosmetic: the server orders this list
 * newest first, so inserting at the head is what keeps the local list in the
 * same order the next revalidation will bring. Appending would put the new
 * suggestion at the bottom and then silently teleport it to the top a minute
 * later.
 *
 * This is NOT an optimistic update. Nothing appears until the server has
 * answered 201, because the one thing this screen must never do is show someone
 * their idea safely filed when it was not written.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THREE DIFFERENT FAILURES, THREE DIFFERENT TREATMENTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * They are genuinely different events and DESIGN.md treats them differently:
 *
 * - The SEND failed → red alert next to the form, with the server's own
 *   sentence, and everything the reader typed still in the fields. Something
 *   they asked for did not happen.
 * - A background REFRESH failed → amber notice above the list. Nobody asked for
 *   it and everything on screen is still true; it may just be a minute old.
 * - The send SUCCEEDED → toast. DESIGN.md: "Toast ... confirma toda acción sin
 *   navegación (guardar, asignar, enviar, agrupar)".
 */

export interface BuzonProps {
  /** What the Server Component read on this request: the first paint and SWR's `fallbackData`. */
  sugerenciasIniciales: readonly SugerenciaDTO[];
  /** The author's own area, used to prefill the form's destination. */
  areaPropia: string;
}

const VACIO_TITULO = "Todavía no enviaste ninguna sugerencia";

/**
 * The empty state of a box that is open to everyone — so it explains what the
 * box is FOR, not who grants access to it.
 *
 * This is the one screen in the portal where DESIGN.md's usual empty copy
 * ("explicación de quién asigna") would be wrong: nothing here is assigned, and
 * telling someone to ask the Área de Innovación for access to a form that is
 * already in front of them would be nonsense. DESIGN.md anticipates exactly this
 * and says so in the same line: "El buzón es solo para ideas nuevas."
 */
const VACIO_DESCRIPCION =
  "Este espacio es para tus ideas de mejora, para tu área o para otra. Escribe la primera con el " +
  "formulario de arriba y podrás seguir su estado desde aquí.";

function Tarjeta({ sugerencia }: { sugerencia: SugerenciaDTO }) {
  return (
    <article className={styles.tarjeta}>
      <header className={styles.tarjetaHeader}>
        <h3 className={styles.tarjetaTitulo}>{sugerencia.titulo}</h3>
        <StatusChip tone={TONO_ESTADO[sugerencia.estado]}>
          {ETIQUETA_ESTADO[sugerencia.estado]}
        </StatusChip>
      </header>

      <p className="lx-meta">
        Enviada el {formatearFecha(sugerencia.fechaCreacion)} · Para {sugerencia.areaDestino}
      </p>

      {/* `white-space: pre-line` in the stylesheet: the reader's own line breaks
          are part of what they wrote and are not the browser's to collapse. */}
      <p className={styles.descripcion}>{sugerencia.descripcion}</p>

      {/*
        * La trazabilidad visible que pide el ítem #13. An ordered list because
        * the order IS the information — this is a sequence of events, and a
        * screen reader announcing "list of 3 items" without that would lose it.
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

export function Buzon({ sugerenciasIniciales, areaPropia }: BuzonProps) {
  const { data, error, mutate } = useSWR<readonly SugerenciaDTO[]>(
    RUTA_SUGERENCIAS,
    obtenerSugerencias,
    { ...OPCIONES_SUGERENCIAS, fallbackData: sugerenciasIniciales },
  );

  const [enviando, setEnviando] = useState(false);
  const [alerta, setAlerta] = useState<string | null>(null);

  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  /*
   * ══════════════════════════════════════════════════════════════════════════
   *  ONE COUNTER DRIVES BOTH REMOUNTS
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Remounting the form is how the fields are cleared after a successful send —
   * and only after one. A failed send leaves every character the reader typed
   * exactly where it was, which is the entire reason the form does not reset
   * itself: the component that knows whether the send worked is this one.
   *
   * The Toast needs the same signal for the opposite purpose: it restarts its
   * lifetime on a new `key`, so two sends in a row show two confirmations
   * instead of one that never reappears. Both are "how many sends have
   * succeeded", so both read this counter rather than keeping a nonce of their
   * own beside it.
   *
   * THE PREFIXES ARE NOT DECORATION. `key` is scoped to a parent's children, and
   * these two elements are siblings in the same fragment — an unprefixed counter
   * gives them the SAME key after the first send, which React reports as
   * "Encountered two children with the same key" and resolves by dropping or
   * duplicating one of them.
   */
  const [envios, setEnvios] = useState(0);

  async function enviar(datos: CrearSugerencia) {
    setEnviando(true);
    setAlerta(null);

    const resultado = await enviarSugerencia(datos);

    setEnviando(false);

    if (!resultado.ok) {
      setAlerta(resultado.mensaje);
      return;
    }

    /*
     * The 201 carries the registered row, so there is nothing left to fetch.
     *
     * ══════════════════════════════════════════════════════════════════════
     *  `actuales` IS `undefined` UNTIL A REVALIDATION HAS LANDED
     * ══════════════════════════════════════════════════════════════════════
     *
     * `fallbackData` is NOT written into SWR's cache — it is what the hook
     * returns while the cache is empty. So the updater's argument is `undefined`
     * for as long as no fetch has resolved, which on this screen is the entire
     * first minute. Falling back to `[]` there would have replaced the whole
     * list with the one suggestion just sent, and then the next revalidation
     * would have quietly put the others back: everything you had ever written
     * vanishing for a minute, right after you pressed a button.
     *
     * So the fallback is the server's own list, which is exactly what is on
     * screen whenever the cache is still empty. The updater form is kept for the
     * other case: once a revalidation HAS landed, `actuales` is fresher than any
     * value this closure captured.
     */
    await mutate((actuales) => [resultado.sugerencia, ...(actuales ?? sugerenciasIniciales)], {
      revalidate: false,
    });

    setConfirmacion(CONFIRMACION_ENVIO);
    setEnvios((anterior) => anterior + 1);
  }

  /* `fallbackData` guarantees a value from the first render, so this is a
     type-level fallback and not a state the reader can ever see. */
  const sugerencias = data ?? sugerenciasIniciales;

  return (
    <>
      <SugerenciaForm
        key={`envio-${envios}`}
        areaPropia={areaPropia}
        enviando={enviando}
        onSubmit={enviar}
      />

      {alerta ? (
        <p className={styles.alerta} role="alert">
          {alerta}
        </p>
      ) : null}

      {error ? (
        /*
         * "status" and not "alert": a background refresh nobody asked for did
         * not land, and everything on screen is still usable. Ámbar and not red —
         * DESIGN.md reserves red for errors and destructive actions.
         */
        <p className={styles.aviso} role="status">
          {AVISO_SIN_ACTUALIZAR}
        </p>
      ) : null}

      <section className={styles.listado} aria-labelledby="mis-sugerencias">
        <h2 id="mis-sugerencias" className={styles.listadoTitulo}>
          Mis sugerencias
        </h2>

        {sugerencias.length === 0 ? (
          <EmptyState title={VACIO_TITULO} description={VACIO_DESCRIPCION} />
        ) : (
          sugerencias.map((sugerencia) => <Tarjeta key={sugerencia.id} sugerencia={sugerencia} />)
        )}
      </section>

      {confirmacion ? (
        <Toast
          key={`toast-${envios}`}
          message={confirmacion}
          onDismiss={() => setConfirmacion(null)}
        />
      ) : null}
    </>
  );
}
