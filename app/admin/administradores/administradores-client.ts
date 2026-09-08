import type { PersonaEncontrada, ResultadoBusqueda } from "@/lib/admins/busqueda";
import { ERROR_INTERNO } from "@/lib/admins/errors";
import type { AdministradorDTO } from "@/lib/admins/repository";

/**
 * The browser's side of `/api/admins` — one function per request the screen
 * makes, and one shape for every answer.
 *
 * Same contract as `app/admin/catalogo/enlaces-client.ts` and its siblings: every
 * action has the three outcomes (done, refused, unreachable) and the same
 * unwrapping to do, so writing it once leaves the screen holding only the
 * decision of WHAT to send. No message is written here that the API could have
 * written — `mensaje` is forwarded untouched.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ANSWER IS READ, NEVER ASSUMED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It would be trivial — and wrong — to treat any 2xx as "the role changed". ADR
 * 0007 stakes the whole authorization design on the server being the only truth
 * about a role, and this module is the narrowest place that promise can be
 * broken, so it is the place that keeps it. A screen built on this can only draw
 * an administrator the server confirmed.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THERE IS NO SWR HERE, AND THAT IS THE DIFFERENCE FROM THE INBOX
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `app/admin/sugerencias/sugerencias-client.ts` revalidates on focus and every
 * minute because that list changes for a reason nobody on the screen caused: a
 * collaborator sent something. The administrator list changes only when somebody
 * uses THIS screen, so a poll would spend a request a minute to redraw a list
 * that is already right. Each write answers with the row it wrote and the screen
 * calls `router.refresh()`, exactly as every other admin screen does.
 */

/** ADR 0003's route family for the role. */
export const RUTA_ADMINS = "/api/admins";

/** The directory search — the one read the browser performs. */
export const RUTA_DIRECTORIO = `${RUTA_ADMINS}/directorio`;

/**
 * The one sentence this module owns, because it is the one failure the API
 * cannot answer for: the request never reached it.
 */
export const ERROR_DE_RED =
  "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.";

/**
 * A 2xx that did not carry what it promised.
 *
 * Its own sentence rather than `ERROR_INTERNO`, because that one promises "no se
 * guardó nada" and this is the one failure where that cannot be promised: the
 * server answered successfully, so the change may well have applied and only the
 * body was lost. The copy says exactly that much and points at the list.
 */
export const ERROR_SIN_CONFIRMACION =
  "El servidor respondió sin confirmar el cambio. Actualiza la pantalla para ver cómo quedó la " +
  "lista de administradores.";

/** What a search gives back: the people found, or a sentence to show. */
export type ResultadoDeBusqueda =
  | { readonly ok: true; readonly origen: ResultadoBusqueda["origen"]; readonly personas: readonly PersonaEncontrada[] }
  | { readonly ok: false; readonly mensaje: string };

/** What a role change gives back: the row as the server now reports it. */
export type ResultadoDeRol =
  | { readonly ok: true; readonly administrador: AdministradorDTO }
  | { readonly ok: false; readonly mensaje: string };

/** The failure envelope's `mensaje`, when the body actually is one. */
function mensajeDe(cuerpo: unknown): string {
  if (typeof cuerpo === "object" && cuerpo !== null && "mensaje" in cuerpo) {
    const mensaje = (cuerpo as { mensaje: unknown }).mensaje;
    if (typeof mensaje === "string" && mensaje.length > 0) return mensaje;
  }

  /* A failing response whose body is not the envelope: a proxy timing out, a
     gateway page, a truncated stream. Reusing ERROR_INTERNO's wording keeps the
     reader's experience identical to the 500 they would otherwise have got. */
  return ERROR_INTERNO.error.mensaje;
}

/** The `{ administrador }` a successful write wraps, when it really carries one. */
function administradorDe(cuerpo: unknown): AdministradorDTO | null {
  if (typeof cuerpo !== "object" || cuerpo === null || !("administrador" in cuerpo)) {
    return null;
  }

  const administrador = (cuerpo as { administrador: unknown }).administrador;

  if (typeof administrador !== "object" || administrador === null) {
    return null;
  }

  const { id, correo } = administrador as { id?: unknown; correo?: unknown };

  return typeof id === "number" && typeof correo === "string"
    ? (administrador as AdministradorDTO)
    : null;
}

/** The `{ origen, personas }` a successful search wraps. */
function resultadoDe(cuerpo: unknown): ResultadoBusqueda | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;

  const { origen, personas } = cuerpo as { origen?: unknown; personas?: unknown };

  if ((origen !== "directorio" && origen !== "portal") || !Array.isArray(personas)) {
    return null;
  }

  return { origen, personas: personas as PersonaEncontrada[] };
}

async function pedir(url: string, init?: RequestInit): Promise<
  { ok: true; cuerpo: unknown } | { ok: false; mensaje: string }
> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    /* No status, no body: the server was never reached. */
    return { ok: false, mensaje: ERROR_DE_RED };
  }

  const cuerpo = await response.json().catch(() => undefined);

  return response.ok ? { ok: true, cuerpo } : { ok: false, mensaje: mensajeDe(cuerpo) };
}

/**
 * People matching the term, from the directory or — when it cannot be reached —
 * from the portal's own accounts.
 *
 * The term is sent as a query parameter and encoded here, so an address with a
 * `+` in it, or a surname with an accent, arrives as it was typed.
 */
export async function buscarPersonas(termino: string): Promise<ResultadoDeBusqueda> {
  const respuesta = await pedir(`${RUTA_DIRECTORIO}?q=${encodeURIComponent(termino)}`);

  if (!respuesta.ok) {
    return { ok: false, mensaje: respuesta.mensaje };
  }

  const resultado = resultadoDe(respuesta.cuerpo);

  return resultado === null
    ? { ok: false, mensaje: ERROR_SIN_CONFIRMACION }
    : { ok: true, origen: resultado.origen, personas: resultado.personas };
}

/** Grants the role. The body is the address; the server resolves the person. */
export async function promoverAdministrador(correo: string): Promise<ResultadoDeRol> {
  const respuesta = await pedir(RUTA_ADMINS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo }),
  });

  if (!respuesta.ok) {
    return { ok: false, mensaje: respuesta.mensaje };
  }

  const administrador = administradorDe(respuesta.cuerpo);

  return administrador === null
    ? { ok: false, mensaje: ERROR_SIN_CONFIRMACION }
    : { ok: true, administrador };
}

/** Takes the role away from one account. The account itself is not touched. */
export async function revocarAdministrador(usuarioId: number): Promise<ResultadoDeRol> {
  const respuesta = await pedir(`${RUTA_ADMINS}/${usuarioId}`, { method: "DELETE" });

  if (!respuesta.ok) {
    return { ok: false, mensaje: respuesta.mensaje };
  }

  const administrador = administradorDe(respuesta.cuerpo);

  return administrador === null
    ? { ok: false, mensaje: ERROR_SIN_CONFIRMACION }
    : { ok: true, administrador };
}

/** Confirms a promotion — DESIGN.md: "Toast … confirma toda acción sin navegación". */
export function confirmacionDePromocion(nombre: string): string {
  return `${nombre} ya es administradora del portal.`;
}

/** Confirms a revocation. */
export function confirmacionDeRevocacion(nombre: string): string {
  return `${nombre} ya no es administradora del portal.`;
}
