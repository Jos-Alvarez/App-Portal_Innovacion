"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/button/button";
import { StatusChip } from "@/components/chip/chip";
import { Modal } from "@/components/modal/modal";
import { EmptyState } from "@/components/states/empty-state";
import { StatusDot } from "@/components/status-dot/status-dot";
import { Table, type TableColumn } from "@/components/table/table";
import { Toast } from "@/components/toast/toast";
import type { EnlaceDTO } from "@/lib/enlaces/repository";
import type { CrearEnlace } from "@/lib/enlaces/schema";
import type { ProcesadorDTO } from "@/lib/procesadores/repository";
import type { UsuarioListadoDTO } from "@/lib/usuarios/repository";
import type { ActualizarProcesador, CrearProcesador } from "@/lib/procesadores/schema";

import { AsignarRecurso } from "./asignar-recurso";
import { filasDelCatalogo, type FilaCatalogo } from "./catalogo";
import styles from "./catalogo.module.css";
import { bytesAMegabytes } from "./edicion";
import { EnlaceForm } from "./enlace-form";
import {
  crearEnlace,
  darDeBajaEnlace,
  editarEnlace,
  restaurarEnlace,
  type ResultadoEnlace,
} from "./enlaces-client";
import { ETIQUETA_RECURSO, TONO_RECURSO } from "./etiquetas-catalogo";
import { describirFormatos } from "./etiquetas-procesadores";
import { ProcesadorForm } from "./procesador-form";
import {
  crearProcesador,
  darDeBajaProcesador,
  editarProcesador,
  restaurarProcesador,
  type ResultadoProcesador,
} from "./procesadores-client";

/**
 * The interactive half of the unified Catálogo — the screen that used to be
 * two, `/admin/enlaces` and `/admin/procesadores`.
 *
 * ONE SCREEN, TWO RESOURCES, TWO APIS. The merge is a reading decision and
 * nothing more: `catalogo.ts` flattens both DTOs into one row shape, and every
 * mutation still travels to its OWN endpoint through its OWN client module.
 * There is no unified write path and there should not be — `enlace` and
 * `procesador` are different tables with different rules, and pretending
 * otherwise would put a translation layer between two schemas that must agree.
 *
 * THE LIST IS NOT STATE HERE. Both arrays arrive from the Server Component that
 * read the database, and a successful action calls `router.refresh()` rather
 * than patching a local copy. `refresh()` and not `revalidatePath` because the
 * `next/cache` helpers only run inside a Server Action, and ADR 0003 chose REST
 * route handlers.
 *
 * Every action applies on its own and confirms with a Toast — DESIGN.md: "sin
 * 'guardar cambios' globales".
 */

export interface CatalogoAdminProps {
  /** El catálogo entero, bajas incluidas: una administradora deshace lo que dio de baja. */
  enlaces: readonly EnlaceDTO[];
  procesadores: readonly ProcesadorDTO[];
  /**
   * Which accounts hold a grant over each resource, keyed by catalogue `clave`
   * (`enlace:7`, `procesador:4`). The count column reads its length; the
   * "Asignar" dialog reads the ids. A resource with no grants is simply absent.
   */
  asignadosPorRecurso?: Readonly<Record<string, readonly number[]>>;
  /** Every account in the portal — the "Asignar" dialog's search filters this. */
  usuarios?: readonly UsuarioListadoDTO[];
}

const TOAST_ALTA_ENLACE = "Enlace agregado al catálogo.";
const TOAST_ALTA_PROCESADOR = "Procesador agregado al catálogo.";
const TOAST_EDICION = "Cambios guardados.";
const TOAST_BAJA = "Recurso dado de baja.";
const TOAST_RESTAURACION = "Recurso restaurado.";

/**
 * Which dialog is open, and over what.
 *
 * One piece of state and not four booleans: the alta of an enlace, the alta of
 * a procesador and the edición of either are four states of ONE dialog, and
 * only one of them can be true at a time. Saying that in the type is what makes
 * two panels stacking on top of each other impossible rather than merely
 * unlikely.
 */
type Dialogo =
  | { readonly clase: "enlace"; readonly enlace: EnlaceDTO | null }
  | { readonly clase: "procesador"; readonly procesador: ProcesadorDTO | null };

/**
 * The one line under a procesador's name: what it is, what it eats, how big a
 * file it takes. The enlace's own sub-line is its address, rendered as a link
 * in the cell itself; a procesador has no address, so this is what fills that
 * row instead of the five columns the table used to spread it across.
 */
function subtituloProcesador(procesador: ProcesadorDTO): string {
  return [
    "Procesador interno",
    describirFormatos(procesador.formatosAceptados),
    `${bytesAMegabytes(procesador.tamanoMax)} MB`,
  ].join(" · ");
}

export function CatalogoAdmin({
  enlaces,
  procesadores,
  asignadosPorRecurso = {},
  usuarios = [],
}: CatalogoAdminProps) {
  const router = useRouter();

  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  /** The row whose baja is waiting to be confirmed — by its catalogue key. */
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** The API's own sentence, shown unchanged. */
  const [alerta, setAlerta] = useState<string | null>(null);
  /*
   * The nonce is what lets the same confirmation appear twice in a row: the
   * Toast restarts its lifetime on a new `key`, and two consecutive bajas
   * otherwise carry an identical message and would show nothing the second time.
   */
  const [confirmacion, setConfirmacion] = useState<{ mensaje: string; nonce: number } | null>(null);

  /*
   * MEMOIZED, AND NOT AS AN OPTIMIZATION. The three inputs come from the Server
   * Component, so their identity changes only when the server re-read the
   * database — which makes every array inside `filas` change identity at
   * exactly that moment and never on a click. `AsignarRecurso` reads
   * `idsUsuariosAsignados` by identity to know when the server has spoken
   * again; rebuilding the list on every render would tell it "new data" on
   * every keystroke and throw away the answers it had just been given.
   */
  const filas = useMemo(
    () => filasDelCatalogo(enlaces, procesadores, asignadosPorRecurso),
    [enlaces, procesadores, asignadosPorRecurso],
  );

  /**
   * The row whose "Asignar" dialog is open, BY KEY and not by value.
   *
   * Holding the row itself would freeze it: `router.refresh()` re-reads the
   * database and rebuilds `filas`, and a dialog holding the object captured at
   * click time would go on showing the grants as they were BEFORE the change it
   * just made. The key survives the rebuild and finds the fresh row.
   */
  const [claveAsignando, setClaveAsignando] = useState<string | null>(null);
  const asignando = claveAsignando === null
    ? null
    : (filas.find((fila) => fila.clave === claveAsignando) ?? null);

  async function aplicar(
    accion: () => Promise<ResultadoEnlace | ResultadoProcesador>,
    mensaje: string,
  ) {
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

    setDialogo(null);
    setConfirmando(null);
    setConfirmacion((previa) => ({ mensaje, nonce: (previa?.nonce ?? 0) + 1 }));
    router.refresh();
  }

  function guardarEnlace(datos: CrearEnlace) {
    const enEdicion = dialogo?.clase === "enlace" ? dialogo.enlace : null;

    if (enEdicion === null) {
      void aplicar(() => crearEnlace(datos), TOAST_ALTA_ENLACE);
      return;
    }

    /*
     * The full set of fields, not a diff: a partial body is legal, but the form
     * collected all four, and sending what is on screen is the honest
     * description of what the administrator just approved.
     */
    void aplicar(() => editarEnlace(enEdicion.id, datos), TOAST_EDICION);
  }

  function guardarProcesador(datos: CrearProcesador | ActualizarProcesador) {
    const enEdicion = dialogo?.clase === "procesador" ? dialogo.procesador : null;

    if (enEdicion === null) {
      void aplicar(() => crearProcesador(datos as CrearProcesador), TOAST_ALTA_PROCESADOR);
      return;
    }

    /*
     * A change set, not the whole row: the form already subtracted the stored
     * values, which is what keeps a size nobody touched out of the body — see
     * `edicion.ts` on why the megabyte conversion depends on it.
     */
    void aplicar(() => editarProcesador(enEdicion.id, datos as ActualizarProcesador), TOAST_EDICION);
  }

  function abrir(siguiente: Dialogo) {
    setAlerta(null);
    setConfirmando(null);
    setDialogo(siguiente);
  }

  function darDeBaja(fila: FilaCatalogo) {
    void aplicar(
      () => (fila.clase === "enlace" ? darDeBajaEnlace(fila.id) : darDeBajaProcesador(fila.id)),
      TOAST_BAJA,
    );
  }

  function restaurar(fila: FilaCatalogo) {
    void aplicar(
      () => (fila.clase === "enlace" ? restaurarEnlace(fila.id) : restaurarProcesador(fila.id)),
      TOAST_RESTAURACION,
    );
  }

  function acciones(fila: FilaCatalogo) {
    /*
     * The confirmation is inline, in the row itself: asking in place keeps the
     * name of the resource being taken down beside the answer, and a second
     * dialog over the one this screen already has would be a stack of two.
     */
    if (confirmando === fila.clave) {
      return (
        <div className={styles.filaAcciones}>
          <span className={styles.confirmacion}>¿Dar de baja «{fila.nombre}»?</span>
          <Button
            variant="text"
            className={styles.destructivo}
            disabled={enviando}
            onClick={() => darDeBaja(fila)}
          >
            Sí, dar de baja
          </Button>
          <Button
            variant="text"
            aria-label={`Cancelar la baja de ${fila.nombre}`}
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
          aria-label={`Editar ${fila.nombre}`}
          disabled={enviando}
          onClick={() =>
            abrir(
              fila.clase === "enlace"
                ? { clase: "enlace", enlace: fila.enlace }
                : { clase: "procesador", procesador: fila.procesador },
            )
          }
        >
          Editar
        </Button>
        {/* Resource-first: opens the dialog over THIS resource, listing who
            holds it and a search to hand it to someone new. The person-first
            `/admin/asignaciones` screen still exists for the other direction. */}
        <Button
          variant="text"
          aria-label={`Asignar ${fila.nombre}`}
          disabled={enviando}
          onClick={() => setClaveAsignando(fila.clave)}
        >
          Asignar
        </Button>
        {fila.activo ? (
          <Button
            variant="text"
            className={styles.destructivo}
            aria-label={`Dar de baja ${fila.nombre}`}
            disabled={enviando}
            onClick={() => {
              setAlerta(null);
              setConfirmando(fila.clave);
            }}
          >
            Dar de baja
          </Button>
        ) : (
          /* Restoring destroys nothing, so it applies straight away. */
          <Button
            variant="text"
            aria-label={`Restaurar ${fila.nombre}`}
            disabled={enviando}
            onClick={() => restaurar(fila)}
          >
            Restaurar
          </Button>
        )}
      </div>
    );
  }

  /*
   * FIVE COLUMNS, NOT NINE. The union of both screens used to spread a
   * procesador's contract — key, formats, file counts, size caps, announced
   * output — across five columns an enlace could only draw a dash in. That
   * detail moved into one line under the name (`subtituloProcesador`) and into
   * the edit dialog; the table now answers the question it is actually scanned
   * for — what is this, is it up, who has it — in one glance.
   */
  const columnas: readonly TableColumn<FilaCatalogo>[] = [
    {
      key: "nombre",
      header: "Recurso",
      cell: (fila) => (
        <span className={styles.nombre}>
          <span className={styles.nombreTexto}>{fila.nombre}</span>
          {fila.clase === "enlace" ? (
            /*
             * `noopener` is not optional: without it the opened page gets a
             * handle to this one via `window.opener` and can navigate the
             * portal's own tab elsewhere — reverse tabnabbing.
             */
            <a
              className={styles.direccion}
              href={fila.enlace.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {fila.enlace.url}
            </a>
          ) : (
            <span className="lx-meta">{subtituloProcesador(fila.procesador)}</span>
          )}
        </span>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      cell: (fila) => (
        <StatusChip tone={TONO_RECURSO[fila.tipo]}>{ETIQUETA_RECURSO[fila.tipo]}</StatusChip>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      cell: (fila) => (
        <StatusDot tone={fila.activo ? "ok" : "neutral"}>
          {fila.activo ? "Activo" : "Dado de baja"}
        </StatusDot>
      ),
    },
    {
      key: "usuarios",
      header: "Usuarios",
      cell: (fila) => (
        /* Zero is a sentence, not a blank: the column exists to show that a
           resource nobody holds is nobody's, not that a number failed to load. */
        <span>
          {fila.idsUsuariosAsignados.length}{" "}
          {fila.idsUsuariosAsignados.length === 1 ? "usuario" : "usuarios"}
        </span>
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
      <header className={styles.header}>
        <div className={styles.headerTexto}>
          <h1>Catálogo de recursos</h1>
          <p className="lx-meta">
            Aplicaciones, agentes de IA y procesadores del portal, en una sola lista. Los cambios se
            aplican al guardarlos: no hay un botón de guardado general.
          </p>
        </div>

        {/* Dos altas y no una con un paso previo de «¿qué tipo?»: son dos
            formularios distintos, y elegir el tipo dentro del diálogo solo
            movería la misma decisión un clic más adentro. Una primaria y una
            secundaria — DESIGN.md admite "una acción primaria (navy) por vista". */}
        <div className={styles.headerAcciones}>
          <Button variant="primary" onClick={() => abrir({ clase: "enlace", enlace: null })}>
            + Nuevo enlace
          </Button>
          <Button
            variant="secondary"
            onClick={() => abrir({ clase: "procesador", procesador: null })}
          >
            + Nuevo procesador
          </Button>
        </div>
      </header>

      {/* El alta y la edición viven en un diálogo sobre el catálogo, no en un
          panel que empuja la tabla hacia abajo: la pantalla es la tabla, y
          escribir en ella es una interrupción con principio y final.

          Remounting on the row's identity resets the fields to that row, which
          is React's own way of doing it and needs no synchronising effect. */}
      {dialogo?.clase === "enlace" ? (
        <Modal
          title={dialogo.enlace === null ? "Nuevo enlace de app / agente" : "Editar enlace"}
          onClose={() => setDialogo(null)}
        >
          <EnlaceForm
            key={dialogo.enlace?.id ?? "nuevo"}
            enlace={dialogo.enlace}
            enviando={enviando}
            onSubmit={guardarEnlace}
            onCancelar={() => setDialogo(null)}
          />
        </Modal>
      ) : null}

      {dialogo?.clase === "procesador" ? (
        <Modal
          title={dialogo.procesador === null ? "Nuevo procesador" : "Editar procesador"}
          onClose={() => setDialogo(null)}
        >
          <ProcesadorForm
            key={dialogo.procesador?.id ?? "nuevo"}
            procesador={dialogo.procesador}
            enviando={enviando}
            onSubmit={guardarProcesador}
            onCancelar={() => setDialogo(null)}
          />
        </Modal>
      ) : null}

      {asignando ? (
        <Modal title={`Accesos a ${asignando.nombre}`} onClose={() => setClaveAsignando(null)}>
          {/* Remount on the row identity so a stale confirmations map never
              carries between two resources. */}
          <AsignarRecurso
            key={asignando.clave}
            recurso={{
              clase: asignando.clase,
              id: asignando.id,
              nombre: asignando.nombre,
              activo: asignando.activo,
            }}
            usuarios={usuarios}
            asignados={asignando.idsUsuariosAsignados}
            onCambio={() => router.refresh()}
          />
        </Modal>
      ) : null}

      {alerta ? (
        <p className={styles.alerta} role="alert">
          {alerta}
        </p>
      ) : null}

      {filas.length === 0 ? (
        <EmptyState
          title="Todavía no hay recursos en el catálogo"
          description="Agrégalos con «+ Nuevo enlace» o «+ Nuevo procesador» y aparecerán aquí, listos para que el Área de Innovación los asigne a los colaboradores."
        />
      ) : (
        <div className={styles.tabla}>
          <Table
            caption="Catálogo de recursos del portal: enlaces y procesadores"
            columns={columnas}
            rows={filas}
            rowKey={(fila) => fila.clave}
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
