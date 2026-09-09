"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/button/button";
import { EmptyState } from "@/components/states/empty-state";
import { Input } from "@/components/input/input";
import { Toast } from "@/components/toast/toast";
import type { OrigenBusqueda, PersonaEncontrada } from "@/lib/admins/busqueda";
import type { RecursoTipo } from "@/lib/asignaciones/errors";
import { BUSQUEDA_MIN } from "@/lib/personas/schema";
import type { UsuarioListadoDTO } from "@/lib/usuarios/repository";

import {
  type ResultadoAsignacion,
  asignarRecurso,
  revocarRecurso,
} from "../asignaciones/asignaciones-client";
import styles from "./catalogo.module.css";
import { buscarColaboradores, registrarPersona } from "./personas-client";

/**
 * The resource-first face of the assignment system: open "Asignar" on a
 * catalogue row and see WHO holds that resource, take it away from anyone, or
 * step into the collaborator picker to hand it to someone new.
 *
 * TWO PANELS, ONE DIALOG. The panel is `vista`: "acceso" shows who holds the
 * resource, "agregar" is the type-ahead over the company. Nesting a second
 * `<Modal>` would stack two focus traps and two overlays; swapping the panel
 * keeps one of each. Each panel opens with a band — heading left, its one
 * action right — the same shape the screen's own header uses, which also puts a
 * SAFE control first in the DOM: the Modal focuses whatever it finds first, and
 * a red "Quitar" taking the focus ring on open read as an accusation.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PICKER SEARCHES THE COMPANY, NOT ONLY THE PORTAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Typing narrows a list that comes from `GET /api/personas`, which asks the
 * Entra ID directory and falls back to the accounts that have already signed in
 * when Graph cannot be reached (ADR 0009). `origen` says which answered, and it
 * is shown: in the degraded mode a colleague who has never opened the portal is
 * simply absent, and without being told why, the honest conclusion — "that
 * person does not work here" — is the wrong one.
 *
 * BELOW THE SEARCH THRESHOLD the list is the portal's own padrón, preloaded by
 * the page. So the picker is never empty on arrival, and never costs a round
 * trip to show something.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  GRANTING TO SOMEBODY WHO HAS NEVER SIGNED IN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A grant is keyed on a `usuario` id, and a person found only in the directory
 * has none. So "Agregar" creates the account first (`POST /api/personas`) and
 * grants second — two calls, each doing one thing. The account it creates is
 * the one the login will later FIND rather than duplicate, because both key on
 * the same normalized address (`registrarUsuario` explains it). That is the
 * whole point: the accesses are already waiting on the person's first visit.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE LIST NEVER SHOWS A GRANT THE SERVER HAS NOT CONFIRMED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Same discipline as `asignaciones-usuario.tsx`, and for the same reason
 * (ADR 0007): no optimistic move. A row's membership comes from exactly two
 * places, both the server — the Server Component's `asignados` prop, refreshed
 * by `onCambio` after every change, and `asignado` as the API returned it in
 * the body. While a request is in flight every button is disabled and the row
 * says "Aplicando…"; a failure changes nothing but the message.
 */

export interface AsignarRecursoProps {
  /** The catalogue row the dialog was opened over. */
  recurso: {
    /** `clase`, not `tipo`: the assignment API knows `enlace` | `procesador`. */
    readonly clase: RecursoTipo;
    readonly id: number;
    readonly nombre: string;
    readonly activo: boolean;
  };
  /** Every account in the portal, as the page read them — the picker's resting list. */
  usuarios: readonly UsuarioListadoDTO[];
  /** Ids of the accounts that hold this resource now, straight from the database. */
  asignados: readonly number[];
  /** Ask the page to re-read after a change that succeeded (`router.refresh`). */
  onCambio: () => void;
}

type Vista = "acceso" | "agregar";

/**
 * One row of the picker, whichever list it came from — the portal's padrón or
 * the directory. `usuarioId` is `null` for somebody who has never signed in,
 * which is exactly the case "Agregar" has to create an account for.
 */
interface Candidato {
  correo: string;
  nombre: string;
  area: string;
  usuarioId: number | null;
  /** `false` only for a portal account that was dada de baja. */
  disponible: boolean;
}

/** How long a keystroke waits before it becomes a request. */
const ESPERA_BUSQUEDA_MS = 300;

const NOTA_EN_CURSO = "Aplicando…";
const NOTA_RECURSO_DE_BAJA =
  "Este recurso está dado de baja: puedes quitar accesos, pero no conceder nuevos hasta reactivarlo.";
const NOTA_USUARIO_DE_BAJA = "Dada de baja";
const NOTA_SIN_INGRESAR = "Aún no ha entrado al portal";
const PISTA_ESCRIBIR = `Escribe al menos ${BUSQUEDA_MIN} letras para buscar en toda la empresa. Mientras tanto, estas son las personas que ya usan el portal.`;
const PISTA_DEGRADADA =
  "No pudimos consultar el directorio de la empresa, así que solo aparecen las personas que ya entraron al portal alguna vez.";

function deUsuario(usuario: UsuarioListadoDTO): Candidato {
  return {
    correo: usuario.correo,
    nombre: usuario.nombre,
    area: usuario.area,
    usuarioId: usuario.id,
    disponible: usuario.activo,
  };
}

function dePersona(persona: PersonaEncontrada): Candidato {
  return {
    correo: persona.correo,
    nombre: persona.nombre,
    area: persona.area,
    usuarioId: persona.enElPortal?.id ?? null,
    /* Somebody with no row yet has no baja to be in. */
    disponible: persona.enElPortal?.activo ?? true,
  };
}

function porNombre<T extends { nombre: string }>(a: T, b: T): number {
  return a.nombre.localeCompare(b.nombre, "es");
}

export function AsignarRecurso({ recurso, usuarios, asignados, onCambio }: AsignarRecursoProps) {
  /**
   * Answers the API gave for grants changed since `asignados` was read. Never
   * an intent: only `asignado` as it came back over the wire.
   */
  const [confirmados, setConfirmados] = useState<Record<number, boolean>>({});

  /**
   * The prop those confirmations were layered on. A newer server read always
   * wins: when `asignados` changes identity the stored answers are dropped, so
   * a grant this dialog was told about cannot outlive what the database now
   * says. React's "adjust state when a prop changes", during render.
   */
  const [asignadosLeidos, setAsignadosLeidos] = useState(asignados);
  if (asignadosLeidos !== asignados) {
    setAsignadosLeidos(asignados);
    setConfirmados({});
  }

  /**
   * Accounts this dialog itself resolved, by address.
   *
   * WITHOUT THIS THE BUTTON LIES. A person found only in the directory arrives
   * from the search with no `usuario` id, and that snapshot does not change
   * when "Agregar" creates one — so the row would go on asking to be added to
   * something it already has, and the reader would click again. The id learned
   * from `POST /api/personas` is remembered here and read back on the next
   * render, which is what turns the button into "Ya tiene acceso" immediately,
   * before the page has even finished re-reading.
   */
  const [idsResueltos, setIdsResueltos] = useState<Record<string, number>>({});

  const [vista, setVista] = useState<Vista>("acceso");
  /** The one person being written, by address, or `null`. One request at a time. */
  const [enCurso, setEnCurso] = useState<string | null>(null);
  /** The API's own sentence, shown unchanged. */
  const [alerta, setAlerta] = useState<string | null>(null);
  const [termino, setTermino] = useState("");
  /**
   * The answer AND the term it answered, so nothing has to be cleared when the
   * term moves on: a stale hallazgo simply stops matching and stops being read.
   * That is what keeps this effect free of a synchronous `setState`, which
   * React's own lint rule refuses — and rightly: clearing state in an effect
   * body is a second render nobody asked for.
   */
  const [hallazgo, setHallazgo] = useState<{
    termino: string;
    origen: OrigenBusqueda;
    personas: PersonaEncontrada[];
  } | null>(null);
  const [falloBusqueda, setFalloBusqueda] = useState<{
    termino: string;
    mensaje: string;
  } | null>(null);
  /* The nonce restarts the Toast so two consecutive changes each announce
     themselves, even when the wording is identical. */
  const [confirmacion, setConfirmacion] = useState<{ mensaje: string; nonce: number } | null>(null);

  const aguja = termino.trim();
  const buscandoDeVerdad = vista === "agregar" && aguja.length >= BUSQUEDA_MIN;

  /* Sólo cuentan las respuestas de LO QUE DICE EL CAMPO AHORA. */
  const resultado = hallazgo?.termino === aguja ? hallazgo : null;
  const fallo = falloBusqueda?.termino === aguja ? falloBusqueda : null;
  /* "Buscando" no es un estado que alguien encienda: es no tener todavía la
     respuesta de un término que sí merece una. */
  const buscando = buscandoDeVerdad && resultado === null && fallo === null;

  /**
   * The type-ahead.
   *
   * Debounced so a five-letter name is one request and not five, and ABORTED on
   * every change: without cancellation the answers race, and the reply to "she"
   * can land after the reply to "sheyla" and repaint the list with the wider
   * result. The cleanup runs before the next effect, so only the newest request
   * can ever resolve into state.
   */
  useEffect(() => {
    if (!buscandoDeVerdad) {
      return;
    }

    const control = new AbortController();

    const temporizador = setTimeout(() => {
      void (async () => {
        const respuesta = await buscarColaboradores(aguja, control.signal);
        if (control.signal.aborted) {
          return;
        }

        if (respuesta.ok) {
          setHallazgo({ termino: aguja, origen: respuesta.origen, personas: respuesta.personas });
          return;
        }

        /* A search the caller itself replaced has nothing to report. */
        if (!("cancelada" in respuesta)) {
          setFalloBusqueda({ termino: aguja, mensaje: respuesta.mensaje });
        }
      })();
    }, ESPERA_BUSQUEDA_MS);

    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [aguja, buscandoDeVerdad]);

  const asignadosAhora = new Set(asignados);
  /** El padrón por correo: la fuente que se refresca sola tras `onCambio`. */
  const padronPorCorreo = new Map(usuarios.map((usuario) => [usuario.correo, usuario.id]));

  /**
   * The `usuario` id behind a picker row, from the freshest source that has one.
   *
   * The search result is the OLDEST of the three: it was taken before anything
   * on this screen happened. What this dialog resolved comes first, the padrón
   * the page re-read comes second, and the snapshot last.
   */
  function idDe(candidato: Candidato): number | null {
    return idsResueltos[candidato.correo] ?? padronPorCorreo.get(candidato.correo) ?? candidato.usuarioId;
  }

  /** Whether the account holds the grant, as far as the server has ever said. */
  function tieneAcceso(usuarioId: number | null): boolean {
    if (usuarioId === null) {
      return false;
    }

    return confirmados[usuarioId] ?? asignadosAhora.has(usuarioId);
  }

  /** Quita el acceso de alguien que ya lo tiene. */
  async function quitar(usuario: UsuarioListadoDTO) {
    if (enCurso !== null) {
      return;
    }

    setEnCurso(usuario.correo);
    setAlerta(null);

    const resultado: ResultadoAsignacion = await revocarRecurso(
      usuario.id,
      recurso.clase,
      recurso.id,
    );

    setEnCurso(null);
    aplicar(resultado, usuario.id, usuario.nombre);
  }

  /**
   * Concede el acceso, creando primero la cuenta si esa persona todavía no
   * entró nunca al portal.
   */
  async function agregar(candidato: Candidato) {
    if (enCurso !== null) {
      return;
    }

    setEnCurso(candidato.correo);
    setAlerta(null);

    let usuarioId = idDe(candidato);

    if (usuarioId === null) {
      const alta = await registrarPersona({
        correo: candidato.correo,
        nombre: candidato.nombre,
        area: candidato.area,
      });

      if (!alta.ok) {
        setEnCurso(null);
        setAlerta(alta.mensaje);
        return;
      }

      usuarioId = alta.usuario.id;
    }

    /* Recordado ANTES de conceder: aunque la concesión falle, la cuenta ya
       existe y un segundo intento no debe volver a crearla. */
    setIdsResueltos((previos) => ({ ...previos, [candidato.correo]: usuarioId }));

    const resultado = await asignarRecurso(usuarioId, recurso.clase, recurso.id);

    setEnCurso(null);
    aplicar(resultado, usuarioId, candidato.nombre);
  }

  /** Lo que sigue a cualquiera de las dos escrituras, que es lo mismo. */
  function aplicar(resultado: ResultadoAsignacion, usuarioId: number, nombre: string) {
    if (!resultado.ok) {
      setAlerta(resultado.mensaje);
      return;
    }

    setConfirmados((previos) => ({ ...previos, [usuarioId]: resultado.asignado }));
    setConfirmacion((previa) => ({
      mensaje: `Acceso de ${nombre} ${resultado.asignado ? "concedido" : "retirado"}.`,
      nonce: (previa?.nonce ?? 0) + 1,
    }));
    onCambio();
  }

  const conAcceso = usuarios.filter((usuario) => tieneAcceso(usuario.id)).sort(porNombre);

  /* Debajo del umbral, el padrón del portal; encima, lo que contestó la
     búsqueda. Nunca una lista vacía por no haber escrito todavía. */
  const candidatos: Candidato[] = buscandoDeVerdad
    ? (resultado?.personas ?? []).map(dePersona)
    : [...usuarios].map(deUsuario).sort(porNombre);

  /** Nombre, correo y — cuando aplica — por qué esa fila no se puede tocar. */
  function persona(candidato: Candidato, nota: string | null) {
    return (
      <span className={styles.asignarPersona}>
        <span className={styles.asignarNombre} data-baja={candidato.disponible ? undefined : "true"}>
          {candidato.nombre}
        </span>
        <span className={styles.asignarCorreo}>
          {candidato.correo}
          {nota === null ? null : ` · ${nota}`}
        </span>
      </span>
    );
  }

  return (
    <div className={styles.asignar}>
      {/* La negativa de una escritura o la de la búsqueda: para el lector es
          la misma banda, y sólo una puede estar vigente a la vez. */}
      {(alerta ?? fallo?.mensaje) ? (
        <p className={styles.alerta} role="alert">
          {alerta ?? fallo?.mensaje}
        </p>
      ) : null}

      {vista === "acceso" ? (
        <section className={styles.asignarGrupo} aria-label="Personas con acceso">
          {/* La acción va primero en el DOM: es la que el Modal enfoca al
              abrirse, y la que no destruye nada. */}
          <div className={styles.asignarBanda}>
            <h3 className={styles.asignarSubtitulo}>
              Con acceso{conAcceso.length > 0 ? ` (${conAcceso.length})` : ""}
            </h3>
            <Button
              variant="primary"
              onClick={() => {
                setAlerta(null);
                setTermino("");
                setVista("agregar");
              }}
            >
              Agregar
            </Button>
          </div>

          {!recurso.activo ? <p className={styles.pista}>{NOTA_RECURSO_DE_BAJA}</p> : null}

          {conAcceso.length === 0 ? (
            <EmptyState
              title="Todavía nadie tiene este recurso"
              description="Usa «Agregar» para buscar a un colaborador y darle acceso."
            />
          ) : (
            <ul className={styles.asignarLista}>
              {conAcceso.map((usuario) => (
                <li key={usuario.id} className={styles.asignarFila}>
                  {persona(deUsuario(usuario), usuario.activo ? null : NOTA_USUARIO_DE_BAJA)}
                  {enCurso === usuario.correo ? (
                    <span className={styles.asignarEstado}>{NOTA_EN_CURSO}</span>
                  ) : (
                    <Button
                      variant="text"
                      className={styles.destructivo}
                      aria-label={`Quitar el acceso de ${usuario.nombre}`}
                      disabled={enCurso !== null}
                      onClick={() => {
                        void quitar(usuario);
                      }}
                    >
                      Quitar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className={styles.asignarGrupo} aria-label="Colaboradores">
          <div className={styles.asignarBanda}>
            <h3 className={styles.asignarSubtitulo}>Agregar colaboradores</h3>
            <Button variant="secondary" onClick={() => setVista("acceso")}>
              Volver
            </Button>
          </div>

          {!recurso.activo ? <p className={styles.pista}>{NOTA_RECURSO_DE_BAJA}</p> : null}

          <Input
            label="Buscar por nombre o correo"
            value={termino}
            placeholder="Escribe un nombre, un apellido o un correo"
            autoComplete="off"
            onChange={(evento) => setTermino(evento.target.value)}
          />

          {buscando ? (
            <p className={styles.pista}>Buscando…</p>
          ) : !buscandoDeVerdad ? (
            <p className={styles.pista}>{PISTA_ESCRIBIR}</p>
          ) : resultado?.origen === "portal" ? (
            <p className={styles.pista}>{PISTA_DEGRADADA}</p>
          ) : null}

          {buscando ? null : candidatos.length === 0 ? (
            <EmptyState
              title={`No encontramos a nadie con «${aguja}»`}
              description="Revisa cómo lo escribiste o prueba con el correo corporativo completo."
            />
          ) : (
            <ul className={`${styles.asignarLista} ${styles.asignarListaScroll}`}>
              {candidatos.map((candidato) => {
                const yaTiene = tieneAcceso(idDe(candidato));
                /* La nota describe lo que encontró la BÚSQUEDA: que esa persona
                   no tenía cuenta. Crearle una no la hace haber entrado. */
                const nuevo = candidato.usuarioId === null;

                return (
                  <li key={candidato.correo} className={styles.asignarFila}>
                    {persona(
                      candidato,
                      nuevo
                        ? NOTA_SIN_INGRESAR
                        : candidato.disponible
                          ? null
                          : NOTA_USUARIO_DE_BAJA,
                    )}

                    {enCurso === candidato.correo ? (
                      <span className={styles.asignarEstado}>{NOTA_EN_CURSO}</span>
                    ) : yaTiene ? (
                      <span className={styles.asignarEstado}>Ya tiene acceso</span>
                    ) : !candidato.disponible ? (
                      <span className={styles.asignarEstado}>{NOTA_USUARIO_DE_BAJA}</span>
                    ) : (
                      <Button
                        variant="secondary"
                        aria-label={`Dar acceso a ${candidato.nombre}`}
                        disabled={enCurso !== null || !recurso.activo}
                        onClick={() => {
                          void agregar(candidato);
                        }}
                      >
                        Agregar
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {confirmacion ? (
        <Toast
          key={confirmacion.nonce}
          message={confirmacion.mensaje}
          onDismiss={() => setConfirmacion(null)}
        />
      ) : null}
    </div>
  );
}
