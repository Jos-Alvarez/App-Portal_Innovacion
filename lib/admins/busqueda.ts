import type { PersonaDirectorio } from "@/lib/admins/directorio";
import type { PersonaDelPortal } from "@/lib/admins/repository";
import { RESULTADOS_MAX } from "@/lib/admins/schema";
import { isEmailFromAllowedDomain } from "@/lib/auth/identity";

/**
 * One search for a person to promote, and the degradation ADR 0009 agreed to —
 * backlog item #17.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE DECISION THIS MODULE OWNS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "El portal depende de que TI consienta el permiso `User.Read.All` de Graph;
 * sin él, la búsqueda en directorio no funciona (mitigación: buscar solo entre
 * usuarios que ya iniciaron sesión alguna vez en el portal)." ADR 0009 states
 * the mitigation; this file is where it happens, and it is the ONLY place that
 * decides it. `directorio.ts` throws for every failure precisely so this
 * function can catch them all in one place and answer with a result that says
 * which source produced it.
 *
 * `origen` travels all the way to the screen, and it must: an administrator
 * searching for a colleague who has never signed in gets an empty list in
 * degraded mode, and without being told why, the honest conclusion — "that
 * person is not in the company" — is the wrong one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DEPENDENCIES ARE INJECTED, LIKE `lib/authz/authorize.ts` DOES IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The three reads reach Microsoft Graph and SQL Server. Binding them here would
 * make every branch below — which source answered, what happens when one of them
 * fails, how the two lists are merged — unreachable without mocking half the
 * platform. With them as parameters, the interesting behaviour is exercised for
 * real and the route is the one place the wiring lives.
 */

/** Which source answered the search. */
export type OrigenBusqueda = "directorio" | "portal";

/** What the portal already knows about a person a search found. */
export interface EstadoEnPortal {
  id: number;
  esAdmin: boolean;
  activo: boolean;
}

/** One person the administrator can consider promoting. */
export interface PersonaEncontrada {
  correo: string;
  nombre: string;
  area: string;
  /** `null` when this person has never signed in to the portal. */
  enElPortal: EstadoEnPortal | null;
}

export interface ResultadoBusqueda {
  origen: OrigenBusqueda;
  personas: PersonaEncontrada[];
}

export interface BuscarPersonasDeps {
  /** The company directory. Throws when it cannot be asked — see `directorio.ts`. */
  buscarEnDirectorio(termino: string): Promise<PersonaDirectorio[]>;
  /** The portal rows for the addresses the directory returned. */
  leerPortalPorCorreos(correos: readonly string[]): Promise<PersonaDelPortal[]>;
  /** The degraded search: only people who have already signed in. */
  buscarEnPortal(termino: string): Promise<PersonaDelPortal[]>;
  /**
   * The corporate domain, so guests and service accounts in the tenant are not
   * offered. `""` disables the filter.
   *
   * A courtesy, not the rule: the promotion route applies
   * `isEmailFromAllowedDomain` itself and fails closed, so an unfiltered search
   * can at worst show a person the next click refuses with a clear sentence.
   * That is why an unset domain is allowed to widen the list here and is NOT
   * allowed to widen anything on the write path.
   */
  dominioCorporativo: string;
  /** Called with the reason the directory could not be used. Defaults to a log line. */
  onDegradacion?(error: unknown): void;
}

function porNombre(a: PersonaEncontrada, b: PersonaEncontrada): number {
  return a.nombre.localeCompare(b.nombre, "es");
}

/** The portal row of a person, as the screen needs it. */
function estadoDe(fila: PersonaDelPortal): EstadoEnPortal {
  return { id: fila.id, esAdmin: fila.esAdmin, activo: fila.activo };
}

/**
 * The directory's people, each carrying whatever the portal knows about them.
 *
 * The NAME AND AREA COME FROM THE DIRECTORY and not from the portal row, which
 * is the right way round: the directory is the company's own record and the
 * `usuario` row is a copy taken at that person's last sign-in, so it can be
 * months out of date after a rename or a transfer. The identity that matters —
 * the address — is the same in both by construction, because it is what they are
 * matched on.
 */
export function combinar(
  personas: readonly PersonaDirectorio[],
  filas: readonly PersonaDelPortal[],
): PersonaEncontrada[] {
  const porCorreo = new Map(filas.map((fila) => [fila.correo.toLowerCase(), fila]));

  return personas
    .map((persona) => ({
      correo: persona.correo,
      nombre: persona.nombre,
      area: persona.area,
      enElPortal: (() => {
        const fila = porCorreo.get(persona.correo);
        return fila === undefined ? null : estadoDe(fila);
      })(),
    }))
    .sort(porNombre);
}

/** The degraded list: the portal's own rows, in the same shape. */
export function desdeElPortal(filas: readonly PersonaDelPortal[]): PersonaEncontrada[] {
  return filas
    .map((fila) => ({
      correo: fila.correo,
      nombre: fila.nombre,
      area: fila.area,
      enElPortal: estadoDe(fila),
    }))
    .sort(porNombre);
}

/**
 * Everybody matching the term, from the directory when it can be reached and
 * from the portal when it cannot.
 *
 * Total by design: it does not throw. A failure of the directory is a result
 * with a different `origen`, and a failure of the DATABASE is not caught here —
 * that one is a genuine 500 and the route says so, because with both sources
 * down there is nothing left to degrade to.
 */
export async function buscarPersonas(
  termino: string,
  deps: BuscarPersonasDeps,
): Promise<ResultadoBusqueda> {
  const {
    buscarEnDirectorio,
    leerPortalPorCorreos,
    buscarEnPortal,
    dominioCorporativo,
    onDegradacion = (error: unknown) => {
      console.warn(
        "[admins] Microsoft Graph could not be used for the directory search; " +
          "falling back to the people who have already signed in.",
        error,
      );
    },
  } = deps;

  let delDirectorio: PersonaDirectorio[];

  try {
    delDirectorio = await buscarEnDirectorio(termino);
  } catch (error) {
    onDegradacion(error);

    return { origen: "portal", personas: desdeElPortal(await buscarEnPortal(termino)) };
  }

  const corporativas =
    dominioCorporativo === ""
      ? delDirectorio
      : delDirectorio.filter((persona) =>
          isEmailFromAllowedDomain(persona.correo, dominioCorporativo),
        );

  const acotadas = corporativas.slice(0, RESULTADOS_MAX);
  const filas = await leerPortalPorCorreos(acotadas.map((persona) => persona.correo));

  return { origen: "directorio", personas: combinar(acotadas, filas) };
}
