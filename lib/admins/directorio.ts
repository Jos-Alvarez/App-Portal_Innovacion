import type { DirectorioEnv } from "@/lib/admins/directorio-env";
import {
  GRAPH_SCOPE,
  TIMEOUT_MS,
  type FetchLike,
  pedirTokenDeAplicacion,
  tokenUrl,
} from "@/lib/graph/token";
import { RESULTADOS_MAX } from "@/lib/admins/schema";
import { normalizeEmail } from "@/lib/auth/identity";

/**
 * The company directory, read through Microsoft Graph — backlog item #17.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SEARCH RUNS AS THE APPLICATION, NOT AS THE ADMINISTRATOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The obvious alternative is the delegated flow: keep the administrator's Graph
 * access token from the sign-in and search with it. It is rejected, twice over.
 *
 *   1. The portal has no such token to keep. `auth.ts` stores nothing in the
 *      session but the identity — deliberately, and ADR 0007 is why — so there
 *      is no `jwt` callback to read one from. Adding one would put a bearer
 *      token for the corporate directory inside a cookie in every
 *      administrator's browser, for the lifetime of their session.
 *   2. It would need the DELEGATED `User.Read.All`, consented for each
 *      administrator on top of the login's default scope. ADR 0009 names the
 *      permission TI was asked to consent to once, for the application.
 *
 * So this module asks Entra ID for an application token with the client
 * credentials the login already uses, and spends it immediately. Nothing is
 * cached: a role change is a rare administrative act, the token request is one
 * round trip against the same host the search then talks to, and a token cached
 * in module scope would outlive a rotated secret and start failing searches long
 * after the deployment believed it had rotated it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY FAILURE THROWS, AND THAT IS THE CONTRACT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `lib/auth/graph.ts` is total — it returns `""` for everything, because a
 * missing department must never block a login. This module is its opposite on
 * purpose: the caller MUST be able to tell "the directory says nobody matches"
 * from "the directory could not be asked", because the first is an empty result
 * and the second is the degradation ADR 0009 agreed to. Collapsing them would
 * silently turn an unconsented permission into "esa persona no existe".
 */

/*
 * El token, su URL, su scope y su plazo viven en `lib/graph/token.ts` desde que
 * la foto de perfil pasó a ser la segunda llamada del portal a Graph: pedir un
 * token de aplicación nunca fue un detalle de buscar personas. Se reexportan
 * para no romper a quien ya los importaba desde acá.
 */
export { GRAPH_SCOPE, TIMEOUT_MS, tokenUrl, type FetchLike };

/** One person as the directory describes them, before the portal knows anything. */
export interface PersonaDirectorio {
  /** Normalized the way the login normalizes it — the upsert key of ADR 0009. */
  correo: string;
  nombre: string;
  /** `""` when the directory reports no department, matching `usuario.area`. */
  area: string;
}

/** The directory endpoint. `$select` keeps the payload to the four fields used. */
export const GRAPH_USERS_URL = "https://graph.microsoft.com/v1.0/users";

/** OData string literals are single-quoted; a quote inside one is doubled. */
function escaparLiteral(valor: string): string {
  return valor.replace(/'/g, "''");
}

/**
 * The `$filter` of the search.
 *
 * `startswith` over the three fields a person is looked up by, and NOT `$search`
 * — that operator needs the `ConsistencyLevel: eventual` header and an
 * `$count=true`, and it ranks results by a relevance model the administrator
 * cannot see. A prefix match on a name or an address is what somebody typing
 * into this field expects, and it is exactly what the degraded search over
 * `usuario` can also do.
 */
export function filtroDeBusqueda(termino: string): string {
  const literal = escaparLiteral(termino);

  return [
    `startswith(displayName,'${literal}')`,
    `startswith(mail,'${literal}')`,
    `startswith(userPrincipalName,'${literal}')`,
  ].join(" or ");
}

/** The `users` payload, read defensively — Graph is not the portal's code. */
interface FilaGraph {
  displayName?: unknown;
  mail?: unknown;
  userPrincipalName?: unknown;
  department?: unknown;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * One directory row as the portal stores people, or `null` when it carries no
 * usable address.
 *
 * `mail` first and `userPrincipalName` as the fallback, which is the same order
 * `selectIdentityEmail` applies to the id_token claims — and it has to be: this
 * address keys the row the sign-in will later upsert, and picking the other one
 * would create a second row for the same person the first time they log in.
 *
 * A row with no address at all is dropped rather than reported. Those exist in
 * every directory — service principals, resource mailboxes, shared calendars —
 * and none of them can hold a role in this portal.
 */
export function mapearPersona(fila: FilaGraph): PersonaDirectorio | null {
  const correo = normalizeEmail(fila.mail) || normalizeEmail(fila.userPrincipalName);

  if (correo === "") {
    return null;
  }

  return { correo, nombre: texto(fila.displayName) || correo, area: texto(fila.department) };
}


export interface BusquedaEnDirectorioOptions {
  env: DirectorioEnv;
  fetchImpl?: FetchLike;
  /** How many rows to ask Graph for. Defaults to the screen's own cap. */
  limite?: number;
}

/**
 * People in the company directory whose name or address starts with the term.
 *
 * @throws Error for every failure — no token, a 403 because `User.Read.All` was
 *         never consented, a timeout, an unparseable body. The caller
 *         (`busqueda.ts`) turns all of them into the same degradation, and it is
 *         the only place that decision is made.
 */
export async function buscarEnDirectorio(
  termino: string,
  { env, fetchImpl = fetch, limite = RESULTADOS_MAX }: BusquedaEnDirectorioOptions,
): Promise<PersonaDirectorio[]> {
  const token = await pedirTokenDeAplicacion(env, fetchImpl);

  const url = new URL(GRAPH_USERS_URL);
  url.searchParams.set("$select", "displayName,mail,userPrincipalName,department");
  url.searchParams.set("$filter", filtroDeBusqueda(termino));
  url.searchParams.set("$top", String(limite));

  const respuesta = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!respuesta.ok) {
    throw new Error(`Microsoft Graph answered ${respuesta.status} to the directory search.`);
  }

  const cuerpo: unknown = await respuesta.json();
  const filas = (cuerpo as { value?: unknown } | null)?.value;

  if (!Array.isArray(filas)) {
    throw new Error("Microsoft Graph answered the directory search without a list of users.");
  }

  return filas
    .map((fila) => mapearPersona(fila as FilaGraph))
    .filter((persona): persona is PersonaDirectorio => persona !== null);
}
