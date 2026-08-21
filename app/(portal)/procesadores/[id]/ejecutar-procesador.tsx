"use client";

import { type ChangeEvent, useState } from "react";

import { Button } from "@/components/button/button";
import { Toast } from "@/components/toast/toast";
import type { ProcesadorDTO } from "@/lib/procesadores/repository";
import { enMegabytes } from "@/lib/procesadores/tamanos";

import {
  contratoDe,
  descargar,
  ejecutarProcesador,
  revisarSeleccion,
} from "./ejecutar-client";
import styles from "./procesador.module.css";

/**
 * The upload screen — the half of item #10 a collaborator actually sees, and
 * the thing the dashboard's "Disponible próximamente" was standing in for.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FORM IS BUILT FROM THE ROW, NEVER FROM A CONSTANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0002 makes the `procesador` row "la única fuente de verdad de la
 * cardinalidad", and ADR 0006 says the portal builds the upload interface by
 * reading it "sin conocer el código del módulo". So every affordance on this
 * screen comes from a column:
 *
 *   entradas_max === 1     → a single-file input, no `multiple`
 *   formatos_aceptados     → the `accept` filter and the sentence above it
 *   tamano_max             → the per-file limit shown, in MB
 *   tamano_max_total       → the combined limit, shown only when there is one
 *   salida_esperada        → what the reader is told to expect back
 *
 * There is no list of processors anywhere in this component, and adding one
 * would defeat the entire design: a new procesador is a row plus a Python
 * module, and this screen is supposed to already work for it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FOUR STATES, AND WHICH ONES LIVE HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * DESIGN.md requires four states of every data view. Three of them belong to
 * the page around this component and not to this component: `loading.tsx` is
 * the skeleton while the row is read, `error.tsx` is the failure of that read,
 * and the guard renders Sin permiso for a procesador that is not assigned.
 * There is no empty state, because a screen that exists for one row is never
 * empty — if the row is gone, the guard already refused.
 *
 * What lives here is the fifth state DESIGN.md names separately: "errores de
 * procesador: banner rojo con título 700 + motivo específico (formato / tamaño
 * / contenido) + Reintentar".
 */

export interface EjecutarProcesadorProps {
  procesador: ProcesadorDTO;
}

const TITULO_ERROR = "No pudimos procesar tus archivos";

/**
 * Shown while the service works. Two minutes is a long time to look at a
 * button that has merely gone grey, so the wait is named rather than implied —
 * and the number is the real deadline, so a reader who has been waiting 90
 * seconds knows the portal has not forgotten them.
 */
const AVISO_PROCESANDO =
  "Estamos procesando tus archivos. Puede tardar hasta dos minutos: no cierres esta pestaña.";

const CONFIRMACION = "Listo. Tu resultado se descargó.";

/** ADR 0002: `salida_esperada` "es declarativo para la UI" and nothing else. */
const SALIDA: Record<ProcesadorDTO["salidaEsperada"], string> = {
  archivo: "Recibirás un archivo con el resultado.",
  /*
   * "normalmente" is not hedging for its own sake. The service packages
   * according to how many files the module actually returned, so a row that
   * declares `zip` and a module that returns one file produce a single file —
   * "una discrepancia entre lo declarado y lo real no rompe la ejecución". The
   * copy announces what to expect; it does not promise what will arrive.
   */
  zip: "Normalmente recibirás un ZIP con los resultados.",
};

/** "xlsx o csv" — an enumeration a person reads, not a comma-joined list. */
function enumerar(valores: readonly string[]): string {
  if (valores.length <= 1) {
    return valores[0] ?? "";
  }

  return `${valores.slice(0, -1).join(", ")} o ${valores[valores.length - 1]}`;
}

/** "un archivo", "hasta 3 archivos", "entre 2 y 5 archivos", "2 archivos o más". */
function cardinalidad(min: number, max: number | null): string {
  if (max !== null && min === max) {
    return min === 1 ? "un archivo" : `${min} archivos`;
  }

  if (max === null) {
    return min === 1 ? "uno o más archivos" : `${min} archivos o más`;
  }

  return min === 1 ? `hasta ${max} archivos` : `entre ${min} y ${max} archivos`;
}

interface ErrorDeEjecucion {
  mensaje: string;
  /**
   * Whether sending the same files again could produce a different outcome.
   *
   * A failure that came back from the server might: the service was busy, the
   * network dropped, the execution ran long. A failure the browser found in the
   * selection cannot — the files are the problem, and the answer is to choose
   * others.
   *
   * So Reintentar is shown for the first and withheld for the second. DESIGN.md
   * asks for the button on a processor error banner, and this is the one place
   * that is read narrowly rather than literally: a button that re-runs a check
   * whose answer cannot have changed is a button that produces the same banner
   * and teaches the reader it does nothing. The affordance in that case is the
   * file field itself, which clears the banner the moment the selection changes.
   */
  reintentable: boolean;
}

export function EjecutarProcesador({ procesador }: EjecutarProcesadorProps) {
  const [archivos, setArchivos] = useState<readonly File[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<ErrorDeEjecucion | null>(null);
  /**
   * How many executions have succeeded on this screen.
   *
   * A COUNTER AND NOT A TIMESTAMP. The value's only job is to be different from
   * the last one so the toast remounts and plays again on a second run, and
   * `Date.now()` would do that too — but it is impure, and React's own lint
   * refuses it inside a component for a reason that applies here: a re-render
   * that re-evaluated it would produce a new key and a toast nobody triggered.
   * A count derived from the previous count cannot.
   */
  const [ejecuciones, setEjecuciones] = useState(0);

  const contrato = contratoDe(procesador);
  const multiple = procesador.entradasMax !== 1;

  function alElegir(evento: ChangeEvent<HTMLInputElement>) {
    setArchivos(Array.from(evento.target.files ?? []));
    /* A new selection makes any previous verdict about the old one obsolete. */
    setError(null);
  }

  async function enviar() {
    const problema = revisarSeleccion(archivos, contrato);

    if (problema) {
      setError({ mensaje: problema, reintentable: false });
      return;
    }

    setError(null);
    setProcesando(true);

    const resultado = await ejecutarProcesador(procesador.id, archivos);

    setProcesando(false);

    if (!resultado.ok) {
      setError({ mensaje: resultado.mensaje, reintentable: true });
      return;
    }

    descargar(resultado.archivo, resultado.nombre);
    setEjecuciones((previas) => previas + 1);
  }

  return (
    <section className={styles.ejecucion} aria-busy={procesando}>
      <div className={styles.contrato}>
        <h2 className="lx-label">Lo que recibe este procesador</h2>
        <ul className={styles.reglas}>
          <li>
            {/* Capitalised by position, not by a CSS transform: the sentence
                starts here and the values come from the row. */}
            Acepta {cardinalidad(procesador.entradasMin, procesador.entradasMax)}
            {contrato.formatos.length > 0 ? ` en formato ${enumerar(contrato.formatos)}` : ""}.
          </li>
          <li>Cada archivo puede pesar hasta {enMegabytes(procesador.tamanoMax)}.</li>
          {procesador.tamanoMaxTotal !== null ? (
            <li>Entre todos no pueden pasar de {enMegabytes(procesador.tamanoMaxTotal)}.</li>
          ) : null}
          <li>{SALIDA[procesador.salidaEsperada]}</li>
        </ul>
      </div>

      <div className={styles.campo}>
        <label className={styles.etiqueta} htmlFor="archivos">
          {multiple ? "Archivos" : "Archivo"}
        </label>
        <input
          id="archivos"
          className={styles.archivo}
          type="file"
          /* Built from the row: a procesador of exactly one file must not offer
             a control that lets the reader pick five and be refused. */
          multiple={multiple}
          /*
             A HINT, NOT A GATE. `accept` filters the picker's default view and
             is trivially bypassed by choosing "all files"; every browser allows
             it. The check that matters runs on submit, and the one that decides
             runs in the service.
           */
          accept={contrato.formatos.map((formato) => `.${formato}`).join(",")}
          onChange={alElegir}
          disabled={procesando}
        />
        {archivos.length > 0 ? (
          <p className="lx-meta">
            {archivos.length === 1
              ? `1 archivo seleccionado · ${enMegabytes(archivos[0].size)}`
              : `${archivos.length} archivos seleccionados · ${enMegabytes(
                  archivos.reduce((suma, archivo) => suma + archivo.size, 0),
                )} en total`}
          </p>
        ) : null}
      </div>

      {error ? (
        /*
         * "alert" and not "status": this interrupts on purpose. The reader
         * pressed a button and is waiting for a file; a refusal is the answer
         * to something they did, which is exactly the case the assertive live
         * region exists for. The dashboard's stale-list notice is the opposite
         * case and uses "status" for that reason.
         */
        <div className={styles.banner} role="alert">
          <p className={styles.bannerTitulo}>{TITULO_ERROR}</p>
          <p className={styles.bannerMotivo}>{error.mensaje}</p>
          {error.reintentable ? (
            <Button variant="secondary" onClick={enviar} disabled={procesando}>
              Reintentar
            </Button>
          ) : null}
        </div>
      ) : null}

      {procesando ? (
        <p className={styles.progreso} role="status">
          {AVISO_PROCESANDO}
        </p>
      ) : null}

      <div className={styles.acciones}>
        <Button
          variant="primary"
          onClick={enviar}
          /* DESIGN.md: "Deshabilitado: opacity .5 + cursor not-allowed (nunca
             ocultarlo)" — the button stays visible while it cannot be used. */
          disabled={procesando || archivos.length === 0}
        >
          {procesando ? "Procesando…" : "Procesar"}
        </Button>
      </div>

      {ejecuciones > 0 ? (
        /* Keyed on the count so two runs produce two toasts rather than one
           that never comes back. */
        <Toast key={ejecuciones} message={CONFIRMACION} />
      ) : null}
    </section>
  );
}
