"use client";

import { type ReactNode, useState } from "react";
import useSWR from "swr";

import { FilterChip, StatusChip } from "@/components/chip/chip";
import { Input } from "@/components/input/input";
import { Switch } from "@/components/switch/switch";
import { Table, type TableColumn } from "@/components/table/table";
import {
  type AreaActiva,
  type ErroresDeProcesador,
  type Metricas,
  type RecursoUsado,
  TIPOS_ERROR,
  type UsuarioActivo,
} from "@/lib/analitica/metricas";
import { RANGOS, type Rango } from "@/lib/analitica/periodos";
import type { RespuestaAnalitica } from "@/lib/analitica/servicio";
import { ETIQUETA_ESTADO, TONO_ESTADO } from "@/lib/sugerencias/etiquetas";
import { ESTADOS_SUGERENCIA } from "@/lib/sugerencias/schema";

import {
  AVISO_SIN_ACTUALIZAR,
  CONSULTA_INICIAL,
  type ConsultaUI,
  MENSAJE_RANGO_INVERTIDO,
  obtenerAnalitica,
  opcionesDe,
  problemaDeRango,
  rutaDe,
} from "./analitica-client";
import {
  claveDeRecurso,
  indiceDeAreas,
  indiceDeErrores,
  indiceDeRecursos,
  indiceDeUsuarios,
  resumenDe,
  variacion,
} from "./comparacion";
import {
  ETIQUETA_RANGO,
  ETIQUETA_TIPO_ERROR,
  ETIQUETA_TIPO_RECURSO,
  TONO_TIPO_RECURSO,
  etiquetaDeArea,
  etiquetaDePeriodo,
  formatearDiferencia,
  formatearNumero,
  formatearPorcentaje,
  nombreDePersona,
  nombreDeRecurso,
} from "./etiquetas";

import styles from "./analitica.module.css";

/**
 * La pantalla de analítica — backlog item #19, and the last screen of the
 * portal.
 *
 * It draws the six answers item #18's engine gives — ranking of resources, use
 * per person, use per area, adoption, suggestions by state and by area, and
 * processing errors — for one of four periods, optionally beside the equivalent
 * period before it. That list is the PRD's, verbatim.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS SCREEN READS. IT DOES NOT WRITE, AND THAT SHAPES EVERYTHING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every other admin screen in this portal is a list plus a mutation: a toast, a
 * `router.refresh()`, an optimistic decision to avoid. There is none of that
 * here. What replaces it is a QUESTION the reader changes several times a
 * minute, so the interaction budget goes entirely into making that cheap —
 * `analitica-client.ts` explains why the built URL is the cache key.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A COMPARISON ADDS A COLUMN, IT DOES NOT ADD ROWS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `comparacion.ts` carries the argument in full: the ranking answers "what is
 * being used", so a resource used last week and not this one is absent rather
 * than listed at zero. The comparison shows, for each row that IS here, what the
 * same row was worth before.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NO COLOUR ON A DELTA, ON PURPOSE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The obvious move is green for up and red for down, and it is wrong twice over.
 * DESIGN.md reserves red for error and destruction ("el rojo jamás se usa fuera
 * de error/destrucción"), and — the part that survives the design system — up is
 * not good on every panel. More errors is worse; fewer suggestions may be worse
 * or may be nothing. Colouring the sign would have this screen making a judgment
 * the portal has no way to make, so the sign is written and left uncoloured, and
 * the reader supplies the meaning.
 */

export interface AnaliticaAdminProps {
  /** What the Server Component read for the default period — first paint and SWR's `fallbackData`. */
  reporteInicial: RespuestaAnalitica;
  /**
   * Today in the portal's zone, `YYYY-MM-DD`, resolved on the server.
   *
   * The ceiling of both date fields and the input to the polling decision. It is
   * a prop rather than a `new Date()` in here because the reader's laptop may be
   * in another zone than the one the engine resolves periods against — and
   * because a value read from the clock during hydration can differ from the one
   * already in the HTML.
   */
  hoy: string;
}

/** The key the server pre-read: the only one that starts with data already in hand. */
const RUTA_INICIAL = rutaDe(CONSULTA_INICIAL);

const VACIO_RECURSOS = "Nadie abrió ni ejecutó nada en este periodo.";
const VACIO_USUARIOS = "Ninguna persona registró actividad en este periodo.";
const VACIO_AREAS = "Ningún área registró actividad en este periodo.";
const VACIO_SUGERENCIAS = "No llegaron sugerencias en este periodo.";
const VACIO_ERRORES = "Ningún procesador rechazó archivos en este periodo.";

/**
 * A figure beside what it was worth before.
 *
 * Both numbers, never just the delta: "+3" alone cannot be read without knowing
 * whether it moved from 1 to 4 or from 300 to 303, and this screen exists to be
 * read rather than to be alarming.
 */
function Comparado({ actual, anterior }: { actual: number; anterior: number }) {
  const { diferencia } = variacion(actual, anterior);

  return (
    <span className={styles.comparado}>
      <span>{formatearNumero(anterior)}</span>
      <span className={styles.diferencia}>{formatearDiferencia(diferencia)}</span>
    </span>
  );
}

/** One figure of the summary strip. */
function Tarjeta({
  titulo,
  valor,
  detalle,
  comparacion,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  comparacion?: ReactNode;
}) {
  return (
    <article className={styles.tarjeta}>
      <p className="lx-label">{titulo}</p>
      <p className={styles.cifra}>{valor}</p>
      {detalle === undefined ? null : <p className="lx-meta">{detalle}</p>}
      {comparacion === undefined ? null : <p className="lx-meta">{comparacion}</p>}
    </article>
  );
}

/**
 * A panel: a heading, and either its table or the sentence that says why there
 * is none.
 *
 * The empty sentence is per panel and not one for the whole screen, because the
 * five questions fail independently: a week with plenty of use and no
 * suggestions is not an empty report, and a single "no hay datos" over the lot
 * would hide the four panels that do have an answer.
 */
function Panel({
  titulo,
  descripcion,
  vacio,
  children,
}: {
  titulo: string;
  descripcion?: string;
  vacio?: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHeader}>
        <h2 className={styles.panelTitulo}>{titulo}</h2>
        {descripcion === undefined ? null : <p className="lx-meta">{descripcion}</p>}
      </header>

      {vacio === undefined ? <div className={styles.tabla}>{children}</div> : <p className="lx-meta">{vacio}</p>}
    </section>
  );
}

export function AnaliticaAdmin({ reporteInicial, hoy }: AnaliticaAdminProps) {
  const [consulta, setConsulta] = useState<ConsultaUI>(CONSULTA_INICIAL);

  const problema = problemaDeRango(consulta);
  const ruta = rutaDe(consulta);

  const { data, error } = useSWR<RespuestaAnalitica>(ruta, obtenerAnalitica, {
    ...opcionesDe(consulta, hoy),
    /* Only the period the server already answered starts with data in hand. */
    fallbackData: ruta === RUTA_INICIAL ? reporteInicial : undefined,
  });

  /* The chips change the period; the dates the range. Neither ever carries the
     other's values into the query — `rutaDe` drops them. */
  function elegirRango(rango: Rango) {
    setConsulta((actual) => ({ ...actual, rango }));
  }

  const metricas: Metricas | undefined = data?.metricas;
  const anteriores = data?.comparacion?.metricas ?? null;

  const columnasDeRecursos: TableColumn<RecursoUsado>[] = [
    {
      key: "recurso",
      header: "Recurso",
      cell: (recurso) => (
        <span className={styles.celdaNombre}>
          <span data-baja={!recurso.activo}>{nombreDeRecurso(recurso)}</span>
          <StatusChip tone={TONO_TIPO_RECURSO[recurso.tipo]}>
            {ETIQUETA_TIPO_RECURSO[recurso.tipo]}
          </StatusChip>
          {/* Una baja lógica sigue apareciendo: el uso ocurrió de verdad. */}
          {recurso.activo ? null : <span className="lx-meta">Dado de baja</span>}
        </span>
      ),
    },
    { key: "aperturas", header: "Aperturas", align: "end", cell: (r) => formatearNumero(r.aperturas) },
    {
      key: "ejecuciones",
      header: "Ejecuciones",
      align: "end",
      cell: (r) => formatearNumero(r.ejecuciones),
    },
    { key: "errores", header: "Errores", align: "end", cell: (r) => formatearNumero(r.errores) },
    { key: "usos", header: "Usos", align: "end", cell: (r) => formatearNumero(r.usos) },
  ];

  if (anteriores !== null) {
    const indice = indiceDeRecursos(anteriores.recursos);

    columnasDeRecursos.push({
      key: "antes",
      header: "Usos antes",
      align: "end",
      cell: (recurso) => (
        <Comparado
          actual={recurso.usos}
          anterior={indice.get(claveDeRecurso(recurso))?.usos ?? 0}
        />
      ),
    });
  }

  const columnasDeUsuarios: TableColumn<UsuarioActivo>[] = [
    {
      key: "persona",
      header: "Persona",
      cell: (usuario) => (
        <span className={styles.celdaNombre}>
          <span data-baja={!usuario.activo}>{nombreDePersona(usuario)}</span>
          {usuario.activo ? null : <span className="lx-meta">Cuenta desactivada</span>}
        </span>
      ),
    },
    { key: "area", header: "Área", cell: (usuario) => etiquetaDeArea(usuario.area) },
    { key: "aperturas", header: "Aperturas", align: "end", cell: (u) => formatearNumero(u.aperturas) },
    {
      key: "ejecuciones",
      header: "Ejecuciones",
      align: "end",
      cell: (u) => formatearNumero(u.ejecuciones),
    },
    { key: "usos", header: "Usos", align: "end", cell: (u) => formatearNumero(u.usos) },
  ];

  if (anteriores !== null) {
    const indice = indiceDeUsuarios(anteriores.usuarios);

    columnasDeUsuarios.push({
      key: "antes",
      header: "Usos antes",
      align: "end",
      cell: (usuario) => (
        <Comparado actual={usuario.usos} anterior={indice.get(usuario.id)?.usos ?? 0} />
      ),
    });
  }

  const columnasDeAreas: TableColumn<AreaActiva>[] = [
    { key: "area", header: "Área", cell: (area) => etiquetaDeArea(area.area) },
    { key: "personas", header: "Personas", align: "end", cell: (a) => formatearNumero(a.personas) },
    { key: "usos", header: "Usos", align: "end", cell: (a) => formatearNumero(a.usos) },
  ];

  if (anteriores !== null) {
    const indice = indiceDeAreas(anteriores.areas);

    columnasDeAreas.push({
      key: "antes",
      header: "Usos antes",
      align: "end",
      cell: (area) => <Comparado actual={area.usos} anterior={indice.get(area.area)?.usos ?? 0} />,
    });
  }

  const columnasDeErrores: TableColumn<ErroresDeProcesador>[] = [
    {
      key: "procesador",
      header: "Procesador",
      cell: (fila) => (
        <span className={styles.celdaNombre}>
          <span data-baja={!fila.activo}>{nombreDeRecurso(fila)}</span>
          {fila.activo ? null : <span className="lx-meta">Dado de baja</span>}
        </span>
      ),
    },
    ...TIPOS_ERROR.map(
      (tipo): TableColumn<ErroresDeProcesador> => ({
        key: tipo,
        header: ETIQUETA_TIPO_ERROR[tipo],
        align: "end",
        cell: (fila) => formatearNumero(fila.porTipo[tipo]),
      }),
    ),
    { key: "total", header: "Total", align: "end", cell: (fila) => formatearNumero(fila.total) },
  ];

  if (anteriores !== null) {
    const indice = indiceDeErrores(anteriores.errores);

    columnasDeErrores.push({
      key: "antes",
      header: "Total antes",
      align: "end",
      cell: (fila) => <Comparado actual={fila.total} anterior={indice.get(fila.id)?.total ?? 0} />,
    });
  }

  const columnasDeSugerenciasPorArea: TableColumn<{ area: string; total: number }>[] = [
    { key: "area", header: "Área de origen", cell: (fila) => etiquetaDeArea(fila.area) },
    { key: "total", header: "Sugerencias", align: "end", cell: (fila) => formatearNumero(fila.total) },
  ];

  const resumen = metricas === undefined ? null : resumenDe(metricas);
  const resumenAnterior = anteriores === null ? null : resumenDe(anteriores);

  return (
    <>
      <section className={styles.controles} aria-label="Periodo del reporte">
        <div className={styles.chips}>
          {RANGOS.map((rango) => (
            <FilterChip
              key={rango}
              label={ETIQUETA_RANGO[rango]}
              selected={consulta.rango === rango}
              onSelect={() => elegirRango(rango)}
            />
          ))}
        </div>

        {consulta.rango === "personalizado" ? (
          <div className={styles.fechas}>
            <Input
              label="Desde"
              type="date"
              max={hoy}
              value={consulta.desde}
              onChange={(evento) =>
                setConsulta((actual) => ({ ...actual, desde: evento.target.value }))
              }
            />
            <Input
              label="Hasta"
              type="date"
              max={hoy}
              value={consulta.hasta}
              onChange={(evento) =>
                setConsulta((actual) => ({ ...actual, hasta: evento.target.value }))
              }
            />
          </div>
        ) : null}

        <div className={styles.comparar}>
          <Switch
            label="Comparar con el periodo anterior"
            checked={consulta.comparar}
            onCheckedChange={(comparar) => setConsulta((actual) => ({ ...actual, comparar }))}
          />
          {/* `aria-hidden` porque el switch ya lleva ese mismo nombre accesible:
              sin esto, un lector de pantalla anunciaría la frase dos veces. */}
          <span className="lx-meta" aria-hidden="true">
            Comparar con el periodo anterior
          </span>
        </div>
      </section>

      {/* Live region: the period is what every number below is about, so a
          reader using a screen reader hears it change. */}
      <p className={styles.periodo} aria-live="polite">
        {data === undefined ? (
          "Cargando el periodo…"
        ) : (
          <>
            <strong>{etiquetaDePeriodo(data.periodo)}</strong>
            {data.comparacion === null ? null : (
              <span className="lx-meta"> · frente a {etiquetaDePeriodo(data.comparacion.periodo)}</span>
            )}
          </>
        )}
      </p>

      {/*
       * Dos problemas, dos tratamientos. Un rango a medio escribir no es un
       * error del lector: es la instrucción de qué falta, y DESIGN.md reserva el
       * rojo para el error y la destrucción. Un rango invertido sí lo es —
       * describe un periodo vacío — y se marca como tal.
       */}
      {problema === null ? null : (
        <p className={problema === MENSAJE_RANGO_INVERTIDO ? styles.alerta : styles.aviso}>
          {problema}
        </p>
      )}

      {/*
       * One notice, and no error state. There is always a good report on screen —
       * the server shipped the first one and `keepPreviousData` holds the last
       * one — so this says what failed without taking away what did not.
       */}
      {error === undefined ? null : <p className={styles.aviso}>{AVISO_SIN_ACTUALIZAR}</p>}

      {metricas === undefined || resumen === null ? null : (
        <>
          <section className={styles.resumen} aria-label="Resumen del periodo">
            <Tarjeta
              titulo="Usos"
              valor={formatearNumero(resumen.usos)}
              detalle="Aperturas y ejecuciones"
              comparacion={
                resumenAnterior === null ? undefined : (
                  <Comparado actual={resumen.usos} anterior={resumenAnterior.usos} />
                )
              }
            />
            <Tarjeta
              titulo="Personas activas"
              valor={formatearNumero(resumen.activos)}
              detalle={`de ${formatearNumero(resumen.conAcceso)} con acceso asignado`}
              comparacion={
                resumenAnterior === null ? undefined : (
                  <Comparado actual={resumen.activos} anterior={resumenAnterior.activos} />
                )
              }
            />
            <Tarjeta
              titulo="Adopción"
              valor={formatearPorcentaje(resumen.activos, resumen.conAcceso)}
              detalle="Usaron el portal sobre quienes tienen acceso"
            />
            <Tarjeta
              titulo="Sugerencias"
              valor={formatearNumero(resumen.sugerencias)}
              detalle="Recibidas en el periodo"
              comparacion={
                resumenAnterior === null ? undefined : (
                  <Comparado actual={resumen.sugerencias} anterior={resumenAnterior.sugerencias} />
                )
              }
            />
            <Tarjeta
              titulo="Errores"
              valor={formatearNumero(resumen.errores)}
              detalle="Intentos rechazados por los procesadores"
              comparacion={
                resumenAnterior === null ? undefined : (
                  <Comparado actual={resumen.errores} anterior={resumenAnterior.errores} />
                )
              }
            />
          </section>

          <Panel
            titulo="Recursos más usados"
            descripcion="Ordenados por uso: aperturas de enlaces y ejecuciones de procesadores."
            vacio={metricas.recursos.length === 0 ? VACIO_RECURSOS : undefined}
          >
            <Table
              caption="Ranking de recursos por uso"
              columns={columnasDeRecursos}
              rows={metricas.recursos}
              rowKey={claveDeRecurso}
            />
          </Panel>

          <Panel
            titulo="Uso por persona"
            vacio={metricas.usuarios.length === 0 ? VACIO_USUARIOS : undefined}
          >
            <Table
              caption="Uso por persona"
              columns={columnasDeUsuarios}
              rows={metricas.usuarios}
              rowKey={(usuario) => String(usuario.id)}
            />
          </Panel>

          <Panel
            titulo="Uso por área"
            descripcion="Personas distintas que usaron el portal y cuántas veces lo hicieron."
            vacio={metricas.areas.length === 0 ? VACIO_AREAS : undefined}
          >
            <Table
              caption="Uso por área"
              columns={columnasDeAreas}
              rows={metricas.areas}
              rowKey={(area) => area.area}
            />
          </Panel>

          <section className={styles.panel} aria-label="Sugerencias">
            <header className={styles.panelHeader}>
              <h2 className={styles.panelTitulo}>Sugerencias</h2>
              <p className="lx-meta">
                {formatearNumero(metricas.sugerencias.total)} recibidas en el periodo.
              </p>
            </header>

            {/* Los cinco estados con sus ceros: la distribución se lee entera, y
                una que omite «Rechazada» se lee como que nunca se rechazó nada. */}
            <ul className={styles.estados}>
              {ESTADOS_SUGERENCIA.map((estado) => (
                <li key={estado} className={styles.estado}>
                  <StatusChip tone={TONO_ESTADO[estado]}>{ETIQUETA_ESTADO[estado]}</StatusChip>
                  <span className={styles.cifraEstado}>
                    {formatearNumero(metricas.sugerencias.porEstado[estado])}
                  </span>
                  {anteriores === null ? null : (
                    <Comparado
                      actual={metricas.sugerencias.porEstado[estado]}
                      anterior={anteriores.sugerencias.porEstado[estado]}
                    />
                  )}
                </li>
              ))}
            </ul>

            {metricas.sugerencias.porArea.length === 0 ? (
              <p className="lx-meta">{VACIO_SUGERENCIAS}</p>
            ) : (
              <div className={styles.tabla}>
                <Table
                  caption="Sugerencias por área de origen"
                  columns={columnasDeSugerenciasPorArea}
                  rows={metricas.sugerencias.porArea}
                  rowKey={(fila) => fila.area}
                />
              </div>
            )}
          </section>

          <Panel
            titulo="Errores de procesamiento"
            descripcion="Intentos que el servicio rechazó, por procesador y por motivo."
            vacio={metricas.errores.length === 0 ? VACIO_ERRORES : undefined}
          >
            <Table
              caption="Errores de procesamiento por procesador y tipo"
              columns={columnasDeErrores}
              rows={metricas.errores}
              rowKey={(fila) => String(fila.id)}
            />
          </Panel>
        </>
      )}
    </>
  );
}
