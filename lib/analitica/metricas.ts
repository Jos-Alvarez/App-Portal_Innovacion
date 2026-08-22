import type {
  ConteoDeSugerencias,
  ConteoPorRecurso,
  ConteoPorUsuario,
  Dimensiones,
  RecursoDimension,
  UsuarioDimension,
} from "@/lib/analitica/repository";
import { TIPOS_EVENTO, type TipoEvento } from "@/lib/eventos/repository";
import { ESTADOS_SUGERENCIA, type EstadoSugerencia } from "@/lib/sugerencias/schema";

/**
 * Counts in, metrics out — the whole of item #18's arithmetic, as pure
 * functions.
 *
 * Nothing here touches a database, a clock or a request. That is what lets the
 * interesting cases be written down as tests instead of argued about: a resource
 * that was retired after being used, an event pointing at a catalogue row that
 * no longer exists, a person with no area, an area whose only user left, and a
 * period in which nothing happened at all.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ZERO IS A RESULT AND ABSENCE IS NOT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every list here contains only what actually happened: a resource nobody opened
 * is not in the ranking, an area nobody used is not in the area cut. The one
 * exception is `porEstado`, which carries all five states with their zeros,
 * because that distribution is read as a whole — a funnel missing "rechazada"
 * reads as a funnel where nothing was ever rejected only if you already knew the
 * five states by heart.
 *
 * `adopcion` is the other place a zero is written out, for the same reason: "0
 * de 14 personas con acceso lo usaron" is the finding, and an absent number
 * would look like the metric failed.
 */

/** The five typed processing errors, derived so they cannot drift from the vocabulary. */
export const TIPOS_ERROR = TIPOS_EVENTO.filter((tipo) => tipo.startsWith("error_"));

export type TipoError = (typeof TIPOS_ERROR)[number];

/** The two resource tables of ADR 0002, as `evento_uso.tipo_recurso` spells them. */
export type TipoRecurso = "enlace" | "procesador";

/**
 * One resource in the ranking.
 *
 * `nombre` is nullable and the reason is `evento_uso`'s polymorphic reference:
 * ADR 0002 gives it no foreign key, so an event can outlive the row it points
 * at — or, if a caller ever passes the wrong pair, point at nothing. Dropping
 * those rows would erase usage that really happened; inventing a name would
 * report a resource that does not exist. `null` says exactly what is known, and
 * item #19 decides how to draw it.
 */
export interface RecursoUsado {
  tipo: TipoRecurso;
  id: number;
  nombre: string | null;
  activo: boolean;
  aperturas: number;
  ejecuciones: number;
  /** Failed attempts. Counted apart from `usos` — see the note on the sort. */
  errores: number;
  /** `aperturas + ejecuciones`: what the ranking is ordered by. */
  usos: number;
}

/** One person's activity in the period. */
export interface UsuarioActivo {
  id: number;
  nombre: string | null;
  area: string;
  activo: boolean;
  aperturas: number;
  ejecuciones: number;
  usos: number;
}

/** One area's activity, folded from the people in it. */
export interface AreaActiva {
  /** `""` is the "Entra ID reported no department" bucket; item #19 names it. */
  area: string;
  /** How many distinct people from this area used the portal. */
  personas: number;
  usos: number;
}

/** Adoption: of the people who hold access, how many used the portal. */
export interface Adopcion {
  /** Active accounts holding at least one grant. */
  conAcceso: number;
  /** How many of those produced at least one event in the period. */
  activos: number;
}

/** One procesador's failed attempts, by kind. */
export interface ErroresDeProcesador {
  id: number;
  nombre: string | null;
  activo: boolean;
  porTipo: Record<TipoError, number>;
  total: number;
}

/** What arrived in the period, and where it stands now. */
export interface MetricaDeSugerencias {
  total: number;
  /** All five states, zeros included. */
  porEstado: Record<EstadoSugerencia, number>;
  /** Only the areas that actually sent something, most first. */
  porArea: { area: string; total: number }[];
}

/** Everything one period answers. */
export interface Metricas {
  recursos: RecursoUsado[];
  usuarios: UsuarioActivo[];
  areas: AreaActiva[];
  adopcion: Adopcion;
  errores: ErroresDeProcesador[];
  sugerencias: MetricaDeSugerencias;
}

/** The counts one period produces, before they are given names. */
export interface Conteos {
  porRecurso: readonly ConteoPorRecurso[];
  porUsuario: readonly ConteoPorUsuario[];
  sugerencias: readonly ConteoDeSugerencias[];
}

function indexar<T extends { id: number }>(filas: readonly T[]): Map<number, T> {
  return new Map(filas.map((fila) => [fila.id, fila]));
}

function esError(tipo: TipoEvento): tipo is TipoError {
  return (TIPOS_ERROR as readonly string[]).includes(tipo);
}

/**
 * More usage first, and ties broken by name.
 *
 * The tiebreaker is not decoration: without it two resources with the same count
 * come back in whatever order the database returned them, which changes between
 * reloads and makes a screen look like it is shuffling on its own.
 */
function porUso<T extends { usos: number; nombre: string | null }>(a: T, b: T): number {
  return b.usos - a.usos || (a.nombre ?? "").localeCompare(b.nombre ?? "", "es");
}

/**
 * The ranking of resources, and the error breakdown, from one set of counts.
 *
 * ERRORS DO NOT COUNT AS USE. A procesador that rejected forty files was tried
 * forty times, and putting those attempts in `usos` would send it to the top of
 * a ranking that an administrator reads as "this is what the company relies on"
 * — and the honest reading is the opposite: it is what the company cannot get
 * to work. Both numbers are reported; only one is ranked.
 */
export function armarRecursos(
  conteos: readonly ConteoPorRecurso[],
  { enlaces, procesadores }: Pick<Dimensiones, "enlaces" | "procesadores">,
): RecursoUsado[] {
  const catalogos: Record<TipoRecurso, Map<number, RecursoDimension>> = {
    enlace: indexar(enlaces),
    procesador: indexar(procesadores),
  };

  const acumulado = new Map<string, RecursoUsado>();

  for (const conteo of conteos) {
    /* A `tipo_recurso` outside the two-word vocabulary cannot be attributed to
       any catalogue, so counting it would attach real usage to a resource that
       does not exist. It is skipped rather than guessed at. */
    if (conteo.tipoRecurso !== "enlace" && conteo.tipoRecurso !== "procesador") continue;

    const tipo: TipoRecurso = conteo.tipoRecurso;
    const clave = `${tipo}:${conteo.idRecurso}`;
    const fila = catalogos[tipo].get(conteo.idRecurso);

    const actual = acumulado.get(clave) ?? {
      tipo,
      id: conteo.idRecurso,
      nombre: fila?.nombre ?? null,
      /* An event whose resource is gone is drawn as inactive: it certainly is
         not available to anybody today. */
      activo: fila?.activo ?? false,
      aperturas: 0,
      ejecuciones: 0,
      errores: 0,
      usos: 0,
    };

    if (conteo.tipoEvento === "apertura") {
      actual.aperturas += conteo.total;
      actual.usos += conteo.total;
    } else if (conteo.tipoEvento === "ejecucion") {
      actual.ejecuciones += conteo.total;
      actual.usos += conteo.total;
    } else if (esError(conteo.tipoEvento)) {
      actual.errores += conteo.total;
    }

    acumulado.set(clave, actual);
  }

  return [...acumulado.values()].sort(porUso);
}

/** An empty tally of the five typed errors, so every procesador reports all of them. */
function tallyDeErrores(): Record<TipoError, number> {
  return Object.fromEntries(TIPOS_ERROR.map((tipo) => [tipo, 0])) as Record<TipoError, number>;
}

/**
 * Failed attempts per procesador, by kind — the PRD's "errores de procesamiento
 * por procesador".
 *
 * Read from the same counts as the ranking, filtered to procesadores: an
 * `enlace` is a link the portal opens in another tab, so nothing about it can
 * fail in a way this portal could observe.
 *
 * Every one of the five kinds is reported, zeros included. The kinds are the
 * question — "is it the format, or the size, or the content?" — and a list that
 * silently omits four of them answers only the one that happened to fire.
 */
export function armarErrores(
  conteos: readonly ConteoPorRecurso[],
  { procesadores }: Pick<Dimensiones, "procesadores">,
): ErroresDeProcesador[] {
  const catalogo = indexar(procesadores);
  const acumulado = new Map<number, ErroresDeProcesador>();

  for (const conteo of conteos) {
    if (conteo.tipoRecurso !== "procesador" || !esError(conteo.tipoEvento)) continue;

    const fila = catalogo.get(conteo.idRecurso);
    const actual = acumulado.get(conteo.idRecurso) ?? {
      id: conteo.idRecurso,
      nombre: fila?.nombre ?? null,
      activo: fila?.activo ?? false,
      porTipo: tallyDeErrores(),
      total: 0,
    };

    actual.porTipo[conteo.tipoEvento] += conteo.total;
    actual.total += conteo.total;

    acumulado.set(conteo.idRecurso, actual);
  }

  return [...acumulado.values()].sort(
    (a, b) => b.total - a.total || (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"),
  );
}

/**
 * Activity per person — the PRD's "usuarios más activos".
 *
 * Errors are excluded from `usos` here for the same reason as in the ranking,
 * and they are not reported per person at all: a failed upload says something
 * about the procesador, not about the person who tried it, and a list of
 * "people who caused the most errors" is a scoreboard nobody asked for.
 */
export function armarUsuarios(
  conteos: readonly ConteoPorUsuario[],
  { usuarios }: Pick<Dimensiones, "usuarios">,
): UsuarioActivo[] {
  const roster = indexar(usuarios);
  const acumulado = new Map<number, UsuarioActivo>();

  for (const conteo of conteos) {
    if (conteo.tipoEvento !== "apertura" && conteo.tipoEvento !== "ejecucion") continue;

    const fila = roster.get(conteo.usuarioId);
    const actual = acumulado.get(conteo.usuarioId) ?? {
      id: conteo.usuarioId,
      nombre: fila?.nombre ?? null,
      area: fila?.area ?? "",
      activo: fila?.activo ?? false,
      aperturas: 0,
      ejecuciones: 0,
      usos: 0,
    };

    if (conteo.tipoEvento === "apertura") {
      actual.aperturas += conteo.total;
    } else {
      actual.ejecuciones += conteo.total;
    }

    actual.usos += conteo.total;
    acumulado.set(conteo.usuarioId, actual);
  }

  return [...acumulado.values()].sort(porUso);
}

/**
 * The area cut, folded from the people rather than counted from the events.
 *
 * `personas` counts DISTINCT people and not events, because the two answer
 * different questions and the second one is already in `usos`. An area of one
 * enthusiast with 200 openings and an area of twenty people with 200 openings
 * are the same row without it.
 */
export function armarAreas(usuarios: readonly UsuarioActivo[]): AreaActiva[] {
  const acumulado = new Map<string, AreaActiva>();

  for (const usuario of usuarios) {
    const actual = acumulado.get(usuario.area) ?? { area: usuario.area, personas: 0, usos: 0 };

    actual.personas += 1;
    actual.usos += usuario.usos;

    acumulado.set(usuario.area, actual);
  }

  return [...acumulado.values()].sort((a, b) => b.usos - a.usos || a.area.localeCompare(b.area, "es"));
}

/**
 * Adoption — "usuarios activos vs. usuarios con acceso asignado".
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE DENOMINATOR IS TODAY'S PERMISSIONS, AND ADR 0010 SAYS SO ON PURPOSE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The metric crosses HISTORICAL use with CURRENT assignments, because the portal
 * keeps no history of who held access on which date. ADR 0010 accepts that
 * formally: the question is "of the people who have access today, how many use
 * it", and a grant handed out mid-period moves the denominator. That is the
 * intended behaviour, not an approximation to apologise for.
 *
 * Deactivated accounts are excluded from the denominator: they cannot use the
 * portal, so counting them would report a permanent adoption gap that no
 * administrator could ever close. They are NOT excluded from the numerator's
 * source — somebody who was deactivated mid-period really did use the portal
 * while they could — but since they are not in the denominator, the numerator
 * only counts people who are in it, and the ratio stays a ratio.
 */
export function armarAdopcion(
  usuariosActivos: readonly UsuarioActivo[],
  { usuarios }: Pick<Dimensiones, "usuarios">,
): Adopcion {
  const conAcceso = usuarios.filter((usuario) => usuario.activo && usuario.conAcceso);
  const usaron = new Set(usuariosActivos.filter((usuario) => usuario.usos > 0).map((u) => u.id));

  return {
    conAcceso: conAcceso.length,
    activos: conAcceso.filter((usuario) => usaron.has(usuario.id)).length,
  };
}

/** An empty tally of the five states, so the distribution is always complete. */
function tallyDeEstados(): Record<EstadoSugerencia, number> {
  return Object.fromEntries(ESTADOS_SUGERENCIA.map((estado) => [estado, 0])) as Record<
    EstadoSugerencia,
    number
  >;
}

/**
 * Suggestions received in the period, by state and by the area they came from.
 *
 * The author's area is read from today's roster, which is the same "current
 * photo" trade-off adoption makes and worth naming: somebody who moved from
 * Operaciones to Peajes has their old suggestions counted under Peajes. The
 * alternative is a copy of the area on every suggestion row, which is a schema
 * change ADR 0002 does not have and a second source of truth for an attribute
 * Entra ID already owns.
 */
export function armarSugerencias(
  conteos: readonly ConteoDeSugerencias[],
  { usuarios }: Pick<Dimensiones, "usuarios">,
): MetricaDeSugerencias {
  const roster = indexar(usuarios);
  const porEstado = tallyDeEstados();
  const porArea = new Map<string, number>();
  let total = 0;

  for (const conteo of conteos) {
    /* A state outside the five is not attributable to any bucket; the CHECK
       constraint makes it unreachable, and inventing a sixth column here would
       hide the day it stopped being. */
    if (!(conteo.estado in porEstado)) continue;

    porEstado[conteo.estado] += conteo.total;
    total += conteo.total;

    const area = roster.get(conteo.autorId)?.area ?? "";
    porArea.set(area, (porArea.get(area) ?? 0) + conteo.total);
  }

  return {
    total,
    porEstado,
    porArea: [...porArea.entries()]
      .map(([area, cantidad]) => ({ area, total: cantidad }))
      .sort((a, b) => b.total - a.total || a.area.localeCompare(b.area, "es")),
  };
}

/** Every metric of one period, from its counts and the shared dimensions. */
export function armarMetricas(conteos: Conteos, dimensiones: Dimensiones): Metricas {
  const usuarios = armarUsuarios(conteos.porUsuario, dimensiones);

  return {
    recursos: armarRecursos(conteos.porRecurso, dimensiones),
    usuarios,
    areas: armarAreas(usuarios),
    adopcion: armarAdopcion(usuarios, dimensiones),
    errores: armarErrores(conteos.porRecurso, dimensiones),
    sugerencias: armarSugerencias(conteos.sugerencias, dimensiones),
  };
}
