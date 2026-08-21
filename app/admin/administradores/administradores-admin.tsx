"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/button/button";
import { StatusChip } from "@/components/chip/chip";
import { Input } from "@/components/input/input";
import { EmptyState } from "@/components/states/empty-state";
import { StatusDot } from "@/components/status-dot/status-dot";
import { Table, type TableColumn } from "@/components/table/table";
import { Toast } from "@/components/toast/toast";
import type { OrigenBusqueda, PersonaEncontrada } from "@/lib/admins/busqueda";
import type { AdministradorDTO } from "@/lib/admins/repository";
import { BUSQUEDA_MIN } from "@/lib/admins/schema";

import {
  type ResultadoDeRol,
  buscarPersonas,
  confirmacionDePromocion,
  confirmacionDeRevocacion,
  promoverAdministrador,
  revocarAdministrador,
} from "./administradores-client";
import styles from "./administradores.module.css";

/**
 * The interactive half of the administrator screen — backlog item #17.
 *
 * THE LISTS ARE NOT STATE HERE, with one deliberate exception. `administradores`
 * arrives from the Server Component that read the database, and a successful
 * action calls `router.refresh()` rather than patching a local array — so the
 * list shown afterwards is the list the database holds. The search results ARE
 * local state, because they are not a copy of anything the server rendered: they
 * are the answer to a question this screen asked.
 *
 * That exception has a consequence worth naming: after a promotion the results
 * still describe the world as it was when the search ran. Rather than patch them
 * — which would be inventing an answer the directory never gave — the promoted
 * address is remembered in `recienPromovidos` and the row redraws from that. The
 * next search asks again and the memory is dropped.
 */

export interface AdministradoresAdminProps {
  /** Everyone holding the role, read on this request. */
  administradores: readonly AdministradorDTO[];
  /** The administrator using the screen — so it can say "tú" and mean it. */
  usuarioActualId: number;
  /**
   * The `ADMIN_EMAIL` break-glass account, normalized, or `""` when unset.
   *
   * The API refuses to revoke it (`lib/admins/errors.ts` explains why a
   * revocation that the next sign-in undoes is worse than a refusal). The screen
   * knows too, so it can say so BEFORE the click rather than after it.
   */
  correoFijado: string;
}

/** DESIGN.md: an absent value is written out, never left as a blank cell. */
function describirArea(area: string): string {
  return area.trim().length > 0 ? area : "Sin área";
}

/**
 * What the reader is told about where the results came from.
 *
 * The degraded case is the one that must be said out loud. ADR 0009's mitigation
 * searches only people who have already signed in, and an administrator who is
 * not told that reads an empty list as "this person does not work here" — which
 * is exactly the wrong conclusion, and the one that ends with them asking IT to
 * create an account that already exists.
 */
const AVISO_ORIGEN: Record<OrigenBusqueda, string> = {
  directorio: "Resultados del directorio de la empresa.",
  portal:
    "No pudimos consultar el directorio de la empresa, así que estos resultados salen solo de las personas que ya entraron al portal alguna vez. Si no encuentras a quien buscas, pídele que inicie sesión una vez.",
};

export function AdministradoresAdmin({
  administradores,
  usuarioActualId,
  correoFijado,
}: AdministradoresAdminProps) {
  const router = useRouter();

  const [termino, setTermino] = useState("");
  const [buscando, setBuscando] = useState(false);
  /** `null` until the first search — an empty array means "nobody matched". */
  const [resultados, setResultados] = useState<readonly PersonaEncontrada[] | null>(null);
  const [origen, setOrigen] = useState<OrigenBusqueda | null>(null);
  /** Addresses promoted since the last search — see the note on local state. */
  const [recienPromovidos, setRecienPromovidos] = useState<readonly string[]>([]);

  const [enviando, setEnviando] = useState(false);
  /** The row whose revocation is waiting to be confirmed. */
  const [confirmando, setConfirmando] = useState<number | null>(null);
  /** The API's own sentence, shown unchanged. */
  const [alerta, setAlerta] = useState<string | null>(null);
  /*
   * The nonce is what lets the same confirmation appear twice in a row: the
   * Toast restarts its lifetime on a new `key`, and two consecutive revocations
   * otherwise carry an identical message and would show nothing the second time.
   */
  const [confirmacion, setConfirmacion] = useState<{ mensaje: string; nonce: number } | null>(null);

  const terminoUsable = termino.trim().length >= BUSQUEDA_MIN;

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault();

    if (buscando || !terminoUsable) return;

    setBuscando(true);
    setAlerta(null);

    const resultado = await buscarPersonas(termino.trim());

    setBuscando(false);

    if (!resultado.ok) {
      setAlerta(resultado.mensaje);
      return;
    }

    /* A fresh answer replaces the memory of what this screen did to the old one. */
    setRecienPromovidos([]);
    setOrigen(resultado.origen);
    setResultados(resultado.personas);
  }

  async function aplicar(accion: () => Promise<ResultadoDeRol>, mensaje: (nombre: string) => string) {
    if (enviando) return;

    setEnviando(true);
    setAlerta(null);

    const resultado = await accion();

    setEnviando(false);

    if (!resultado.ok) {
      /* Straight from `lib/admins/errors.ts`, which is written to be read by a person. */
      setAlerta(resultado.mensaje);
      return;
    }

    setConfirmando(null);
    setConfirmacion((previa) => ({
      mensaje: mensaje(resultado.administrador.nombre),
      nonce: (previa?.nonce ?? 0) + 1,
    }));

    return resultado;
  }

  async function promover(persona: PersonaEncontrada) {
    const resultado = await aplicar(
      () => promoverAdministrador(persona.correo),
      confirmacionDePromocion,
    );

    if (resultado?.ok) {
      setRecienPromovidos((previos) => [...previos, persona.correo]);
      router.refresh();
    }
  }

  async function revocar(administrador: AdministradorDTO) {
    const resultado = await aplicar(
      () => revocarAdministrador(administrador.id),
      confirmacionDeRevocacion,
    );

    if (resultado?.ok) {
      router.refresh();
    }
  }

  /** Whether this result can still be offered a promotion, and why not. */
  function estadoDeResultado(persona: PersonaEncontrada) {
    if (recienPromovidos.includes(persona.correo)) {
      return { promovible: false, etiqueta: "Ya es administradora" } as const;
    }

    if (persona.enElPortal === null) {
      return { promovible: true, etiqueta: "Todavía no entró al portal" } as const;
    }

    if (persona.enElPortal.esAdmin) {
      return { promovible: false, etiqueta: "Ya es administradora" } as const;
    }

    if (!persona.enElPortal.activo) {
      return { promovible: false, etiqueta: "Cuenta dada de baja" } as const;
    }

    return { promovible: true, etiqueta: null } as const;
  }

  function acciones(administrador: AdministradorDTO) {
    const esUnoMismo = administrador.id === usuarioActualId;

    /*
     * The pinned account never shows the button. Rendering it and letting the
     * API refuse would be honest but pointless: the refusal is not about
     * anything the reader can change from here.
     */
    if (correoFijado !== "" && administrador.correo.toLowerCase() === correoFijado) {
      return <span className="lx-meta">Fijada en la configuración</span>;
    }

    /*
     * The confirmation is inline, in the row itself: there is no Modal in the
     * components layer, and asking in place keeps the name of the person losing
     * the role beside the answer. Losing your OWN role is worth a different
     * question — it is the one revocation that changes what the reader can do
     * next.
     */
    if (confirmando === administrador.id) {
      return (
        <div className={styles.filaAcciones}>
          <span className={styles.confirmacion}>
            {esUnoMismo
              ? "¿Quitarte a ti el rol de administradora?"
              : `¿Quitar el rol a «${administrador.nombre}»?`}
          </span>
          <Button
            variant="text"
            className={styles.destructivo}
            disabled={enviando}
            onClick={() => {
              void revocar(administrador);
            }}
          >
            Sí, quitar el rol
          </Button>
          <Button
            variant="text"
            aria-label={`Cancelar quitarle el rol a ${administrador.nombre}`}
            disabled={enviando}
            onClick={() => setConfirmando(null)}
          >
            Cancelar
          </Button>
        </div>
      );
    }

    return (
      <Button
        variant="text"
        className={styles.destructivo}
        /* Every row repeats these words, so the name is what tells them apart
           for anyone navigating by button. */
        aria-label={`Quitar el rol de administradora a ${administrador.nombre}`}
        disabled={enviando}
        onClick={() => {
          setAlerta(null);
          setConfirmando(administrador.id);
        }}
      >
        Quitar rol
      </Button>
    );
  }

  const columnas: readonly TableColumn<AdministradorDTO>[] = [
    {
      key: "persona",
      header: "Persona",
      cell: (administrador) => (
        <span className={styles.persona}>
          <span className={styles.personaNombre} data-baja={administrador.activo ? undefined : "true"}>
            {administrador.nombre}
            {administrador.id === usuarioActualId ? (
              <StatusChip tone="navy">Tú</StatusChip>
            ) : null}
          </span>
          <span className="lx-meta">{administrador.correo}</span>
        </span>
      ),
    },
    { key: "area", header: "Área", cell: (administrador) => describirArea(administrador.area) },
    {
      key: "estado",
      header: "Estado",
      cell: (administrador) => (
        <StatusDot tone={administrador.activo ? "ok" : "neutral"}>
          {administrador.activo ? "Activa" : "Dada de baja"}
        </StatusDot>
      ),
    },
    { key: "acciones", header: "Acciones", align: "end", cell: acciones },
  ];

  return (
    <>
      <form className={styles.busqueda} onSubmit={buscar}>
        <Input
          label="Buscar a una persona"
          value={termino}
          placeholder="Nombre o correo corporativo"
          autoComplete="off"
          onChange={(evento) => setTermino(evento.target.value)}
        />
        <Button variant="primary" type="submit" disabled={buscando || !terminoUsable}>
          {buscando ? "Buscando…" : "Buscar"}
        </Button>
      </form>

      {alerta ? (
        <p className={styles.alerta} role="alert">
          {alerta}
        </p>
      ) : null}

      {resultados !== null && origen !== null ? (
        <section className={styles.resultados} aria-label="Resultados de la búsqueda">
          <p className="lx-meta">{AVISO_ORIGEN[origen]}</p>

          {resultados.length === 0 ? (
            <EmptyState
              title="No encontramos a nadie con ese nombre"
              description="Revisa cómo lo escribiste o prueba con el correo corporativo completo."
            />
          ) : (
            <ul className={styles.listaResultados}>
              {resultados.map((persona) => {
                const estado = estadoDeResultado(persona);

                return (
                  <li key={persona.correo} className={styles.resultado}>
                    <span className={styles.persona}>
                      <span className={styles.personaNombre}>
                        {persona.nombre}
                        {estado.etiqueta ? (
                          <StatusChip tone="neutral">{estado.etiqueta}</StatusChip>
                        ) : null}
                      </span>
                      <span className="lx-meta">{persona.correo}</span>
                      <span className="lx-meta">{describirArea(persona.area)}</span>
                    </span>

                    {estado.promovible ? (
                      <Button
                        variant="secondary"
                        aria-label={`Dar el rol de administradora a ${persona.nombre}`}
                        disabled={enviando}
                        onClick={() => {
                          void promover(persona);
                        }}
                      >
                        Dar rol de administradora
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section className={styles.actuales} aria-label="Administradores del portal">
        <h2 className={styles.subtitulo}>Administradores actuales</h2>

        {administradores.length === 0 ? (
          /*
           * Unreachable in a healthy portal — the minimum-one rule is exactly
           * what makes it so — but a database restored from an old dump, or one
           * edited by hand, can produce it. Saying how an administrator comes
           * back is more useful than "no hay datos".
           */
          <EmptyState
            title="El portal no tiene administradores"
            description="Esto no debería pasar. La cuenta de respaldo configurada en el despliegue recupera el rol la próxima vez que inicie sesión."
          />
        ) : (
          <div className={styles.tabla}>
            <Table
              caption="Personas con rol de administradora en el portal"
              columns={columnas}
              rows={administradores}
              rowKey={(administrador) => String(administrador.id)}
            />
          </div>
        )}
      </section>

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

/** Exported for the tests, which assert the copy rather than re-describing it. */
export { AVISO_ORIGEN };
