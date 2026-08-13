"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/button/button";
import { StatusChip } from "@/components/chip/chip";
import { EmptyState } from "@/components/states/empty-state";
import { StatusDot } from "@/components/status-dot/status-dot";
import { Table, type TableColumn } from "@/components/table/table";
import { Toast } from "@/components/toast/toast";
import type { ProcesadorDTO } from "@/lib/procesadores/repository";
import type { ActualizarProcesador, CrearProcesador } from "@/lib/procesadores/schema";

import { ProcesadorForm } from "./procesador-form";
import {
  crearProcesador,
  darDeBajaProcesador,
  editarProcesador,
  restaurarProcesador,
  type ResultadoProcesador,
} from "./procesadores-client";
import {
  ETIQUETA_SALIDA,
  TONO_SALIDA,
  describirEntradas,
  describirFormatos,
  describirTamanos,
} from "./etiquetas";
import styles from "./procesadores.module.css";

/**
 * The interactive half of the procesadores catalogue.
 *
 * THE LIST IS NOT STATE HERE. `procesadores` arrives from the Server Component
 * that read the database, and a successful action calls `router.refresh()`
 * rather than patching a local array — so the row shown afterwards is the row
 * the database holds, and no second copy of the catalogue can drift out of
 * date. `refresh()` and not `revalidatePath` because the `next/cache` helpers
 * only run inside a Server Action, and ADR 0003 chose REST route handlers.
 *
 * Every action applies on its own and confirms with a Toast — DESIGN.md: "sin
 * 'guardar cambios' globales".
 *
 * THE TABLE SHOWS THE EXECUTION CONTRACT, NOT JUST THE NAME. ADR 0002 makes
 * this row the single source of truth for how many files an execution admits
 * and how big they may be, so the columns say it: the caps in megabytes, and an
 * absent cap written as "Sin tope" rather than shown as an empty cell.
 */

export interface ProcesadoresAdminProps {
  /** The whole catalogue, bajas included — an administrator undoes what they took down. */
  procesadores: readonly ProcesadorDTO[];
}

const TOAST_ALTA = "Procesador agregado al catálogo.";
const TOAST_EDICION = "Cambios guardados.";
const TOAST_BAJA = "Procesador dado de baja.";
const TOAST_RESTAURACION = "Procesador restaurado.";

export function ProcesadoresAdmin({ procesadores }: ProcesadoresAdminProps) {
  const router = useRouter();

  /** The row being edited, or `null` while the panel is an alta. */
  const [editando, setEditando] = useState<ProcesadorDTO | null>(null);
  /** The row whose baja is waiting to be confirmed. */
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** The API's own sentence, shown unchanged. */
  const [alerta, setAlerta] = useState<string | null>(null);
  /*
   * The nonce is what lets the same confirmation appear twice in a row: the
   * Toast restarts its lifetime on a new `key`, and two consecutive bajas
   * otherwise carry an identical message and would show nothing the second time.
   */
  const [confirmacion, setConfirmacion] = useState<{ mensaje: string; nonce: number } | null>(null);

  async function aplicar(accion: () => Promise<ResultadoProcesador>, mensaje: string) {
    if (enviando) return;

    setEnviando(true);
    setAlerta(null);

    const resultado = await accion();

    setEnviando(false);

    if (!resultado.ok) {
      /* Straight from `lib/api/errors`, which is written to be read by a person. */
      setAlerta(resultado.mensaje);
      return;
    }

    setEditando(null);
    setConfirmando(null);
    setConfirmacion((previa) => ({ mensaje, nonce: (previa?.nonce ?? 0) + 1 }));
    router.refresh();
  }

  function guardar(datos: CrearProcesador | ActualizarProcesador) {
    const enEdicion = editando;

    if (enEdicion === null) {
      void aplicar(() => crearProcesador(datos as CrearProcesador), TOAST_ALTA);
      return;
    }

    /*
     * A change set, not the whole row: the form already subtracted the stored
     * values, which is what keeps a size nobody touched out of the body — see
     * `edicion.ts` on why the megabyte conversion depends on it.
     */
    void aplicar(() => editarProcesador(enEdicion.id, datos as ActualizarProcesador), TOAST_EDICION);
  }

  function empezarEdicion(procesador: ProcesadorDTO) {
    setAlerta(null);
    setConfirmando(null);
    setEditando(procesador);
  }

  function acciones(procesador: ProcesadorDTO) {
    /*
     * The confirmation is inline, in the row itself: there is no Modal in the
     * components layer, and asking in place keeps the name of the procesador
     * being taken down beside the answer.
     */
    if (confirmando === procesador.id) {
      return (
        <div className={styles.filaAcciones}>
          <span className={styles.confirmacion}>¿Dar de baja «{procesador.nombre}»?</span>
          <Button
            variant="text"
            className={styles.destructivo}
            disabled={enviando}
            onClick={() => {
              void aplicar(() => darDeBajaProcesador(procesador.id), TOAST_BAJA);
            }}
          >
            Sí, dar de baja
          </Button>
          <Button
            variant="text"
            aria-label={`Cancelar la baja de ${procesador.nombre}`}
            disabled={enviando}
            onClick={() => setConfirmando(null)}
          >
            Cancelar
          </Button>
        </div>
      );
    }

    return (
      <div className={styles.filaAcciones}>
        {/* Every row repeats these words, so the name is what tells them apart
            for anyone navigating by button. */}
        <Button
          variant="text"
          aria-label={`Editar ${procesador.nombre}`}
          disabled={enviando}
          onClick={() => empezarEdicion(procesador)}
        >
          Editar
        </Button>
        {procesador.activo ? (
          <Button
            variant="text"
            className={styles.destructivo}
            aria-label={`Dar de baja ${procesador.nombre}`}
            disabled={enviando}
            onClick={() => {
              setAlerta(null);
              setConfirmando(procesador.id);
            }}
          >
            Dar de baja
          </Button>
        ) : (
          /* Restoring destroys nothing, so it applies straight away. */
          <Button
            variant="text"
            aria-label={`Restaurar ${procesador.nombre}`}
            disabled={enviando}
            onClick={() => {
              void aplicar(() => restaurarProcesador(procesador.id), TOAST_RESTAURACION);
            }}
          >
            Restaurar
          </Button>
        )}
      </div>
    );
  }

  const columnas: readonly TableColumn<ProcesadorDTO>[] = [
    {
      key: "nombre",
      header: "Procesador",
      cell: (procesador) => (
        <span className={styles.nombre}>
          <span className={styles.nombreTexto}>{procesador.nombre}</span>
          {procesador.descripcion ? (
            <span className="lx-meta">{procesador.descripcion}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "clave",
      header: "Clave",
      cell: (procesador) => <code className={styles.clave}>{procesador.claveProcesador}</code>,
    },
    {
      key: "formatos",
      header: "Formatos",
      cell: (procesador) => <span>{describirFormatos(procesador.formatosAceptados)}</span>,
    },
    {
      key: "contrato",
      header: "Archivos y tamaños",
      cell: (procesador) => (
        <span className={styles.limites}>
          <span>{describirEntradas(procesador)}</span>
          <span className="lx-meta">{describirTamanos(procesador)}</span>
        </span>
      ),
    },
    {
      key: "salida",
      header: "Resultado anunciado",
      cell: (procesador) => (
        <StatusChip tone={TONO_SALIDA[procesador.salidaEsperada]}>
          {ETIQUETA_SALIDA[procesador.salidaEsperada]}
        </StatusChip>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      cell: (procesador) => (
        <StatusDot tone={procesador.activo ? "ok" : "neutral"}>
          {procesador.activo ? "Activo" : "Dado de baja"}
        </StatusDot>
      ),
    },
    {
      key: "acciones",
      header: "Acciones",
      align: "end",
      cell: acciones,
    },
  ];

  return (
    <>
      {/* Remounting on the row's identity resets the fields to that row, which
          is React's own way of doing it and needs no synchronising effect. */}
      <ProcesadorForm
        key={editando?.id ?? "nuevo"}
        procesador={editando}
        enviando={enviando}
        onSubmit={guardar}
        onCancelar={() => setEditando(null)}
      />

      {alerta ? (
        <p className={styles.alerta} role="alert">
          {alerta}
        </p>
      ) : null}

      {procesadores.length === 0 ? (
        <EmptyState
          title="Todavía no hay procesadores en el catálogo"
          description="Agrega el primero con el formulario de arriba y aparecerá aquí, listo para que el Área de Innovación lo asigne a los colaboradores."
        />
      ) : (
        <div className={styles.tabla}>
          <Table
            caption="Catálogo de procesadores del portal"
            columns={columnas}
            rows={procesadores}
            rowKey={(procesador) => String(procesador.id)}
          />
        </div>
      )}

      {confirmacion ? (
        <Toast
          key={confirmacion.nonce}
          message={confirmacion.mensaje}
          onDismiss={() => setConfirmacion(null)}
        />
      ) : null}
    </>
  );
}
