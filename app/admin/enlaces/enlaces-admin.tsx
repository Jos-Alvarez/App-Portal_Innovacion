"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/button/button";
import { StatusChip } from "@/components/chip/chip";
import { EmptyState } from "@/components/states/empty-state";
import { StatusDot } from "@/components/status-dot/status-dot";
import { Table, type TableColumn } from "@/components/table/table";
import { Toast } from "@/components/toast/toast";
import type { EnlaceDTO } from "@/lib/enlaces/repository";
import type { CrearEnlace } from "@/lib/enlaces/schema";

import { EnlaceForm } from "./enlace-form";
import {
  crearEnlace,
  darDeBajaEnlace,
  editarEnlace,
  restaurarEnlace,
  type ResultadoEnlace,
} from "./enlaces-client";
import { ETIQUETA_TIPO, TONO_TIPO } from "./etiquetas";
import styles from "./enlaces.module.css";

/**
 * The interactive half of the catalogue screen.
 *
 * THE LIST IS NOT STATE HERE. `enlaces` arrives from the Server Component that
 * read the database, and a successful action calls `router.refresh()` rather
 * than patching a local array — so the row shown afterwards is the row the
 * database holds, and no second copy of the catalogue can drift out of date.
 *
 * WHY `refresh()` AND NOT `revalidatePath`. The `next/cache` helpers only run
 * inside a Server Action, and ADR 0003 chose REST route handlers instead;
 * calling one from a handler throws. `refresh()` re-renders the Server
 * Components and merges the payload without discarding the form's own state.
 *
 * Every action applies on its own and confirms with a Toast — DESIGN.md: "sin
 * 'guardar cambios' globales".
 */

export interface EnlacesAdminProps {
  /** The whole catalogue, bajas included — an administrator undoes what they took down. */
  enlaces: readonly EnlaceDTO[];
}

const TOAST_ALTA = "Enlace agregado al catálogo.";
const TOAST_EDICION = "Cambios guardados.";
const TOAST_BAJA = "Enlace dado de baja.";
const TOAST_RESTAURACION = "Enlace restaurado.";

export function EnlacesAdmin({ enlaces }: EnlacesAdminProps) {
  const router = useRouter();

  /** The row being edited, or `null` while the panel is an alta. */
  const [editando, setEditando] = useState<EnlaceDTO | null>(null);
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

  async function aplicar(accion: () => Promise<ResultadoEnlace>, mensaje: string) {
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

  function guardar(datos: CrearEnlace) {
    const enEdicion = editando;

    if (enEdicion === null) {
      void aplicar(() => crearEnlace(datos), TOAST_ALTA);
      return;
    }

    /*
     * The full set of fields, not a diff: a partial body is legal, but the form
     * collected all four, and sending what is on screen is the honest
     * description of what the administrator just approved.
     */
    void aplicar(() => editarEnlace(enEdicion.id, datos), TOAST_EDICION);
  }

  function empezarEdicion(enlace: EnlaceDTO) {
    setAlerta(null);
    setConfirmando(null);
    setEditando(enlace);
  }

  function acciones(enlace: EnlaceDTO) {
    /*
     * The confirmation is inline, in the row itself: there is no Modal in the
     * components layer, and asking in place keeps the name of the enlace being
     * taken down beside the answer.
     */
    if (confirmando === enlace.id) {
      return (
        <div className={styles.filaAcciones}>
          <span className={styles.confirmacion}>¿Dar de baja «{enlace.nombre}»?</span>
          <Button
            variant="text"
            className={styles.destructivo}
            disabled={enviando}
            onClick={() => {
              void aplicar(() => darDeBajaEnlace(enlace.id), TOAST_BAJA);
            }}
          >
            Sí, dar de baja
          </Button>
          <Button
            variant="text"
            aria-label={`Cancelar la baja de ${enlace.nombre}`}
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
          aria-label={`Editar ${enlace.nombre}`}
          disabled={enviando}
          onClick={() => empezarEdicion(enlace)}
        >
          Editar
        </Button>
        {enlace.activo ? (
          <Button
            variant="text"
            className={styles.destructivo}
            aria-label={`Dar de baja ${enlace.nombre}`}
            disabled={enviando}
            onClick={() => {
              setAlerta(null);
              setConfirmando(enlace.id);
            }}
          >
            Dar de baja
          </Button>
        ) : (
          /* Restoring destroys nothing, so it applies straight away. */
          <Button
            variant="text"
            aria-label={`Restaurar ${enlace.nombre}`}
            disabled={enviando}
            onClick={() => {
              void aplicar(() => restaurarEnlace(enlace.id), TOAST_RESTAURACION);
            }}
          >
            Restaurar
          </Button>
        )}
      </div>
    );
  }

  const columnas: readonly TableColumn<EnlaceDTO>[] = [
    {
      key: "nombre",
      header: "Enlace",
      cell: (enlace) => (
        <span className={styles.nombre}>
          <span className={styles.nombreTexto}>{enlace.nombre}</span>
          {enlace.descripcion ? <span className="lx-meta">{enlace.descripcion}</span> : null}
        </span>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      cell: (enlace) => (
        <StatusChip tone={TONO_TIPO[enlace.tipo]}>{ETIQUETA_TIPO[enlace.tipo]}</StatusChip>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      cell: (enlace) => (
        <StatusDot tone={enlace.activo ? "ok" : "neutral"}>
          {enlace.activo ? "Activo" : "Dado de baja"}
        </StatusDot>
      ),
    },
    {
      key: "direccion",
      header: "Dirección",
      cell: (enlace) => (
        /*
         * `noopener` is not optional: without it the opened page gets a handle
         * to this one via `window.opener` and can navigate the portal's own tab
         * elsewhere — reverse tabnabbing.
         */
        <a className={styles.direccion} href={enlace.url} target="_blank" rel="noopener noreferrer">
          {enlace.url}
        </a>
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
      <EnlaceForm
        key={editando?.id ?? "nuevo"}
        enlace={editando}
        enviando={enviando}
        onSubmit={guardar}
        onCancelar={() => setEditando(null)}
      />

      {alerta ? (
        <p className={styles.alerta} role="alert">
          {alerta}
        </p>
      ) : null}

      {enlaces.length === 0 ? (
        <EmptyState
          title="Todavía no hay enlaces en el catálogo"
          description="Agrega el primero con el formulario de arriba y aparecerá aquí, listo para que el Área de Innovación lo asigne a los colaboradores."
        />
      ) : (
        <div className={styles.tabla}>
          <Table
            caption="Catálogo de enlaces del portal"
            columns={columnas}
            rows={enlaces}
            rowKey={(enlace) => String(enlace.id)}
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
