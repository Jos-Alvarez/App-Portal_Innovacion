"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { StatusDot } from "@/components/status-dot/status-dot";
import { Switch } from "@/components/switch/switch";
import { Table, type TableColumn } from "@/components/table/table";
import { Toast } from "@/components/toast/toast";
import type { RecursoTipo } from "@/lib/asignaciones/errors";
import type { EnlaceDTO } from "@/lib/enlaces/repository";
import type { ProcesadorDTO } from "@/lib/procesadores/repository";
import type { UsuarioAsignacionesDTO } from "@/lib/usuarios/repository";

import { type ResultadoAsignacion, asignarRecurso, revocarRecurso } from "./asignaciones-client";
import styles from "./asignaciones.module.css";

/**
 * One person's accesses: every enlace and every procesador in the portal, each
 * with the switch DESIGN.md reserved for exactly this ("44×24px, verde
 * asignado / borde gris sin acceso").
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SWITCH NEVER SHOWS A GRANT THE SERVER HAS NOT CONFIRMED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * READ THIS BEFORE MAKING IT FEEL SNAPPIER. The obvious "improvement" here is
 * to move the switch on click and put it back if the request fails — an
 * optimistic toggle, one `useOptimistic` away. It is refused, and this is why:
 *
 *   · ADR 0007 stakes the entire authorization design on one claim: the server
 *     is the only truth about a permission, and nothing caches one. A switch
 *     drawn from a click is a permission cached in the client for the length of
 *     a round trip. It is a very short-lived lie, but it is the same lie the
 *     ADR spent an alternative rejecting.
 *
 *   · The failure it invites is not "the toggle flickers". It is an
 *     administrator who turns on an access, sees green, walks away, and never
 *     sees the rollback — because a rollback needs the reader to still be
 *     looking. Part 1 refuses to grant over a resource dado de baja with a 409,
 *     so this is a refusal that HAPPENS, not a hypothetical. And the state is
 *     not a form field: it is an authorization.
 *
 * So the switch is CONTROLLED, and its value comes from exactly two places,
 * both of them the server:
 *
 *   1. the Server Component's read of `usuario`, refreshed by `router.refresh()`
 *      after every change that succeeded;
 *   2. `asignado`, as the API reported it in the response body — which the
 *      transport reads rather than infers (see `asignaciones-client.ts`).
 *
 * While a request is in flight the switch keeps the value it had, every switch
 * on the screen is disabled, and the row says "Aplicando…". A failure changes
 * nothing except the message: the switch was already showing the truth, so
 * there is nothing to roll back, and no code path exists that could get it
 * wrong. The cost is one round trip on a local network, for a screen only
 * administrators open — ADR 0007 already paid a query per request for the same
 * guarantee.
 *
 * Every change applies on its own and confirms with a Toast — DESIGN.md: "sin
 * 'guardar cambios' globales".
 */

/** What both catalogues have in common as far as a grant is concerned. */
interface RecursoAsignable {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface AsignacionesUsuarioProps {
  /** The account and the identifiers it holds, as the database had them. */
  usuario: UsuarioAsignacionesDTO;
  /** The whole catalogue, bajas included — an old grant over one must be removable. */
  enlaces: readonly EnlaceDTO[];
  procesadores: readonly ProcesadorDTO[];
}

/** How each type is named in the switch's accessible name and in its toast. */
const ETIQUETA: Record<RecursoTipo, string> = { enlace: "enlace", procesador: "procesador" };

const AVISO_USUARIO_DE_BAJA =
  "Esta persona está dada de baja. Puedes retirarle accesos, pero no concederle nuevos hasta que se reactive.";
const NOTA_RECURSO_DE_BAJA = "Dado de baja: no se puede asignar hasta que se reactive.";
const NOTA_USUARIO_DE_BAJA = "No puede recibir accesos nuevos mientras esté dada de baja.";
const NOTA_EN_CURSO = "Aplicando…";

/** Identity of one grant on this screen: the pair that names the API route. */
function claveDe(tipo: RecursoTipo, recursoId: number): string {
  return `${tipo}:${recursoId}`;
}

export function AsignacionesUsuario({ usuario, enlaces, procesadores }: AsignacionesUsuarioProps) {
  const router = useRouter();

  /**
   * Answers the API gave for grants changed since this render's props were
   * read. Never an intent: only `asignado` as it came back over the wire.
   */
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({});

  /**
   * The props those confirmations were layered on top of. A newer server render
   * always wins: when the Server Component reads the row again, the stored
   * answers are dropped rather than kept alongside it, so a grant this screen
   * was told about at 10:00 cannot override what the database said at 10:05.
   * React's "adjust state when a prop changes", done during render.
   */
  const [leidoDelServidor, setLeidoDelServidor] = useState(usuario);

  if (leidoDelServidor !== usuario) {
    setLeidoDelServidor(usuario);
    setConfirmados({});
  }

  /** The one grant being written, or `null`. One request at a time, on purpose. */
  const [enCurso, setEnCurso] = useState<string | null>(null);
  /** The API's own sentence, shown unchanged. */
  const [alerta, setAlerta] = useState<string | null>(null);
  /* The nonce is what lets the same confirmation appear twice in a row: the
     Toast restarts its lifetime on a new `key`, and two consecutive grants
     otherwise carry an identical message and would show nothing the second time. */
  const [confirmacion, setConfirmacion] = useState<{ mensaje: string; nonce: number } | null>(null);

  const asignadosDelServidor: Record<RecursoTipo, ReadonlySet<number>> = {
    enlace: new Set(usuario.enlaces),
    procesador: new Set(usuario.procesadores),
  };

  /** Whether the grant exists, as far as the server has ever said. */
  function estaAsignado(tipo: RecursoTipo, recursoId: number): boolean {
    return confirmados[claveDe(tipo, recursoId)] ?? asignadosDelServidor[tipo].has(recursoId);
  }

  async function alternar(tipo: RecursoTipo, recurso: RecursoAsignable, conceder: boolean) {
    /* A second change would race the first, and neither could be reported
       against a screen that does not yet know what the first one did. */
    if (enCurso !== null) return;

    const clave = claveDe(tipo, recurso.id);

    setEnCurso(clave);
    setAlerta(null);

    const resultado: ResultadoAsignacion = conceder
      ? await asignarRecurso(usuario.id, tipo, recurso.id)
      : await revocarRecurso(usuario.id, tipo, recurso.id);

    setEnCurso(null);

    if (!resultado.ok) {
      /*
       * Straight from `lib/api/errors`, which is written to be read by a
       * person. Nothing else changes: the switch is still showing the last
       * state the server confirmed, which is still the truth.
       */
      setAlerta(resultado.mensaje);
      return;
    }

    /* The server's answer, not the intent — they can only differ if something
       is wrong, and if they ever do the reader must see the row as it is. */
    setConfirmados((previos) => ({ ...previos, [clave]: resultado.asignado }));
    setConfirmacion((previa) => ({
      mensaje: `Acceso a «${recurso.nombre}» ${resultado.asignado ? "concedido" : "retirado"}.`,
      nonce: (previa?.nonce ?? 0) + 1,
    }));
    router.refresh();
  }

  function columnas(tipo: RecursoTipo): readonly TableColumn<RecursoAsignable>[] {
    return [
      {
        key: "recurso",
        header: ETIQUETA[tipo] === "enlace" ? "Enlace" : "Procesador",
        cell: (recurso) => (
          <span className={styles.recurso}>
            {/* Dimmed when it is dado de baja: the row stays because its grant
                may still need removing, and the reader must see it is idle. */}
            <span className={styles.recursoNombre} data-baja={recurso.activo ? undefined : "true"}>
              {recurso.nombre}
            </span>
            {recurso.descripcion ? <span className="lx-meta">{recurso.descripcion}</span> : null}
          </span>
        ),
      },
      {
        key: "estado",
        header: "Estado",
        cell: (recurso) => (
          <StatusDot tone={recurso.activo ? "ok" : "neutral"}>
            {recurso.activo ? "Activo" : "Dado de baja"}
          </StatusDot>
        ),
      },
      {
        key: "acceso",
        header: "Acceso",
        align: "end",
        cell: (recurso) => {
          const asignado = estaAsignado(tipo, recurso.id);
          /* The API refuses a grant when either end is dada de baja and allows
             revoking one that exists. The switch says so before the request
             rather than after the 409: the interface makes the rule legible,
             the API is what enforces it. */
          const puedeConceder = usuario.activo && recurso.activo;
          const enviando = enCurso === claveDe(tipo, recurso.id);

          return (
            <span className={styles.acceso}>
              <Switch
                label={`Acceso al ${ETIQUETA[tipo]} ${recurso.nombre}`}
                checked={asignado}
                disabled={enCurso !== null || (!asignado && !puedeConceder)}
                onCheckedChange={(siguiente) => {
                  void alternar(tipo, recurso, siguiente);
                }}
              />
              {enviando ? <span className={styles.nota}>{NOTA_EN_CURSO}</span> : null}
              {!enviando && !asignado && !recurso.activo ? (
                <span className={styles.nota}>{NOTA_RECURSO_DE_BAJA}</span>
              ) : null}
              {!enviando && !asignado && recurso.activo && !usuario.activo ? (
                <span className={styles.nota}>{NOTA_USUARIO_DE_BAJA}</span>
              ) : null}
            </span>
          );
        },
      },
    ];
  }

  function seccion(
    tipo: RecursoTipo,
    titulo: string,
    recursos: readonly RecursoAsignable[],
    vacio: { titulo: string; descripcion: string },
  ) {
    const encabezado = `titulo-${tipo}`;
    const asignados = recursos.filter((recurso) => estaAsignado(tipo, recurso.id)).length;

    return (
      <section className={styles.seccion} aria-labelledby={encabezado}>
        <header className={styles.seccionHeader}>
          <h2 id={encabezado} className={styles.seccionTitulo}>
            {titulo}
          </h2>
          {recursos.length > 0 ? (
            <p className="lx-meta">{`${asignados} de ${recursos.length} asignados`}</p>
          ) : null}
        </header>

        {recursos.length === 0 ? (
          <EmptyState title={vacio.titulo} description={vacio.descripcion} />
        ) : (
          <div className={styles.tabla}>
            <Table
              caption={`${titulo} que puede tener asignados ${usuario.nombre}`}
              columns={columnas(tipo)}
              rows={recursos}
              rowKey={(recurso) => String(recurso.id)}
            />
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      {usuario.activo ? null : <p className={styles.aviso}>{AVISO_USUARIO_DE_BAJA}</p>}

      {alerta ? (
        <p className={styles.alerta} role="alert">
          {alerta}
        </p>
      ) : null}

      {seccion("enlace", "Enlaces", enlaces, {
        titulo: "Todavía no hay enlaces en el catálogo",
        descripcion: "Registra enlaces en el catálogo de enlaces y podrás asignarlos desde aquí.",
      })}

      {seccion("procesador", "Procesadores", procesadores, {
        titulo: "Todavía no hay procesadores en el catálogo",
        descripcion:
          "Registra procesadores en el catálogo de procesadores y podrás asignarlos desde aquí.",
      })}

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
