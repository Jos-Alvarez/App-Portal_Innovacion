import type { SWRConfiguration } from "swr";

import { SIN_REVALIDACION_AL_MONTAR } from "@/lib/swr-pre-lectura";

import { ERROR_INTERNO_REVISION } from "@/lib/sugerencias/errors";
import type { SugerenciaAdminDTO } from "@/lib/sugerencias/repository";
import type { EstadoSugerencia } from "@/lib/sugerencias/schema";

/**
 * The browser's side of the management screen: the two routes it calls, the
 * revalidation policy behind the list, and the shape of an answer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE THIRD SWR KEY, AND THE FIRST ONE THAT WOULD HAVE FIT A PROVIDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `app/(portal)/sugerencias/sugerencias-client.ts` refused an `<SWRConfig>` for
 * two reasons that still hold — the provider is a client component and would wrap
 * every Server Component page in a client boundary, and a shared default hides a
 * policy that is a claim about one particular set of data.
 *
 * This key is the first one where the second reason genuinely points the other
 * way: this list and the collaborator's are the SAME ROWS, and the number below
 * is deliberately the same number. But lifting it into a provider would share it
 * with the dashboard's assignments too, which is the coincidence the other module
 * warned about. So the policy stays at the call site and the two suggestion
 * screens are left agreeing on purpose rather than by inheritance — and if the
 * suggestions ever want a different interval from the resources, this is the file
 * that changes, not a default nobody can attribute.
 */

/** The admin read of item #15 — a path of its own, never a flag on the collaborator's. */
export const RUTA_TODAS = "/api/sugerencias/todas";

/** `PATCH /api/sugerencias/{id}/estado` — ADR 0003 names it exactly. */
export function rutaEstado(id: number): string {
  return `/api/sugerencias/${id}/estado`;
}

/**
 * ADR 0007's policy — "revalidación al recuperar el foco y en intervalos" —
 * applied to the inbox side of the box.
 *
 * The reason is the mirror image of the collaborator's. There, the list changes
 * because an administrator reviewed something; here it changes because a
 * collaborator sent something, on a screen nobody in this room is looking at.
 * Both are "the change comes from someone else entirely", which is the shape
 * ADR 0007 wrote the two clocks for.
 *
 * SIXTY SECONDS, matching both screens that already exist. `revalidateOnFocus`
 * is the one that matters: a reviewer who leaves the panel open all morning gets
 * the morning's suggestions the moment they come back to the tab.
 */
export const OPCIONES_TODAS: SWRConfiguration<readonly SugerenciaAdminDTO[]> = {
  /* Same pre-read, same reason: `sugerencias-admin.tsx` is handed this list by
     its own Server Component, so the mount has nothing to ask for. */
  ...SIN_REVALIDACION_AL_MONTAR,
  refreshInterval: 60_000,
  revalidateOnFocus: true,
};

/**
 * Shown when a background revalidation fails while a perfectly good list is on
 * screen. Not an error state — nothing on screen became wrong, it may just be a
 * minute old.
 */
export const AVISO_SIN_ACTUALIZAR =
  "No pudimos actualizar la lista de sugerencias. Estás viendo la última versión que cargamos; " +
  "lo intentaremos de nuevo en un momento.";

/** The change never reached the server: no status, no body, nothing written. */
export const ERROR_DE_RED =
  "No pudimos conectar con el servidor, así que el estado no cambió. Revisa tu conexión y vuelve " +
  "a intentarlo.";

/**
 * A 2xx that did not carry the updated suggestion.
 *
 * Its own sentence rather than `ERROR_INTERNO_REVISION`, because that one
 * promises "quedó como estaba" and this is the one failure where that cannot be
 * promised: the server answered successfully, so the change may well have
 * applied and only the body was lost. The copy says exactly that much and points
 * at the list, which revalidates within the minute anyway.
 */
export const ERROR_SIN_CONFIRMACION =
  "El servidor respondió sin confirmar el cambio. Actualiza la lista para ver en qué estado quedó " +
  "la sugerencia.";

/** Confirms the review — DESIGN.md: "Toast … confirma toda acción sin navegación". */
export function confirmacionDeCambio(etiqueta: string): string {
  return `Sugerencia marcada como ${etiqueta}.`;
}

/** Narrows the parsed body to the list, or gives up. */
function sugerenciasDe(cuerpo: unknown): readonly SugerenciaAdminDTO[] | null {
  if (typeof cuerpo !== "object" || cuerpo === null || !("sugerencias" in cuerpo)) {
    return null;
  }

  const sugerencias = (cuerpo as { sugerencias: unknown }).sugerencias;

  return Array.isArray(sugerencias) ? (sugerencias as readonly SugerenciaAdminDTO[]) : null;
}

/**
 * THIS FETCHER THROWS, for the reason both of the others do.
 *
 * SWR replaces the cached value with whatever the fetcher RESOLVES and keeps the
 * last good one whenever it REJECTS. Returning `[]` on a bad minute would empty
 * the inbox into "todavía no hay sugerencias" — and here that reads as "nobody
 * has sent anything", which is a claim about the company rather than about the
 * network.
 */
export async function obtenerTodas(ruta: string): Promise<readonly SugerenciaAdminDTO[]> {
  /* A rejected fetch propagates untouched: it is already the signal SWR needs. */
  const response = await fetch(ruta, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`GET ${ruta} respondió ${response.status}`);
  }

  const cuerpo = await response.json().catch(() => undefined);
  const sugerencias = sugerenciasDe(cuerpo);

  if (sugerencias === null) {
    throw new Error(`GET ${ruta} respondió 200 sin la lista de sugerencias`);
  }

  return sugerencias;
}

/**
 * What a review gives back: the updated suggestion, or a sentence to show.
 *
 * The same discriminated shape the other two clients use, and for the same
 * reason — a caller cannot read the result without deciding which case it is in,
 * so "assume it worked" is not something that can be written by accident.
 */
export type ResultadoCambio =
  | { readonly ok: true; readonly sugerencia: SugerenciaAdminDTO }
  | { readonly ok: false; readonly mensaje: string };

/** The failure envelope's `mensaje`, when the body actually is one. */
function mensajeDe(cuerpo: unknown): string {
  if (typeof cuerpo === "object" && cuerpo !== null && "mensaje" in cuerpo) {
    const mensaje = (cuerpo as { mensaje: unknown }).mensaje;
    if (typeof mensaje === "string" && mensaje.length > 0) return mensaje;
  }

  /* A failing status with no envelope — a proxy's own error page, a gateway
     timeout. The server said nothing usable, so the generic sentence stands in. */
  return ERROR_INTERNO_REVISION.error.mensaje;
}

/** The `{ sugerencia }` a successful response wraps, when it really carries one. */
function sugerenciaDe(cuerpo: unknown): SugerenciaAdminDTO | null {
  if (typeof cuerpo === "object" && cuerpo !== null && "sugerencia" in cuerpo) {
    const sugerencia = (cuerpo as { sugerencia: unknown }).sugerencia;
    if (typeof sugerencia === "object" && sugerencia !== null) {
      return sugerencia as SugerenciaAdminDTO;
    }
  }

  return null;
}

/**
 * La revisión — `PATCH /api/sugerencias/{id}/estado`.
 *
 * A 200 whose body is not a suggestion is treated as a FAILURE, and the
 * conservative direction is the opposite of the collaborator's send: there, a
 * doubtful answer had to read as "not sent" so nobody believes an unwritten idea
 * is safe. Here the ambiguous outcome is a state change that may well have
 * applied — and the list revalidates within the minute, so reporting the doubt
 * costs a reviewer one look at a row that is already correct, while reporting
 * success would leave a chip on screen that the next refresh silently
 * contradicts. `ERROR_SIN_CONFIRMACION` is worded for exactly that doubt.
 */
export async function cambiarEstado(
  id: number,
  estado: EstadoSugerencia,
): Promise<ResultadoCambio> {
  let response: Response;

  try {
    response = await fetch(rutaEstado(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ estado }),
    });
  } catch {
    /* No status, no body: the server was never reached, so nothing was written. */
    return { ok: false, mensaje: ERROR_DE_RED };
  }

  const cuerpo = await response.json().catch(() => undefined);

  if (!response.ok) {
    return { ok: false, mensaje: mensajeDe(cuerpo) };
  }

  const sugerencia = sugerenciaDe(cuerpo);

  return sugerencia === null
    ? { ok: false, mensaje: ERROR_SIN_CONFIRMACION }
    : { ok: true, sugerencia };
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ÍTEM #16 — LA AGRUPACIÓN
 * ══════════════════════════════════════════════════════════════════════════ */

/** ADR 0003's route for grouping. */
export const RUTA_GRUPOS = "/api/sugerencias/grupos";

/** `DELETE /api/sugerencias/{id}/grupo` — the way out of a group. */
export function rutaGrupoDeSugerencia(id: number): string {
  return `/api/sugerencias/${id}/grupo`;
}

/** The grouping change never reached the server: no status, no body, nothing written. */
export const ERROR_DE_RED_GRUPO =
  "No pudimos conectar con el servidor, así que la agrupación no cambió. Revisa tu conexión y " +
  "vuelve a intentarlo.";

/**
 * A 2xx that did not carry the updated list.
 *
 * Its own sentence for the same reason `ERROR_SIN_CONFIRMACION` has one, and the
 * doubt is wider here: a grouping write can dissolve a group and free a
 * suggestion nobody named, so "nothing changed" is precisely what cannot be
 * promised when the body is missing.
 */
export const ERROR_SIN_LISTA =
  "El servidor respondió sin confirmar la agrupación. Actualiza la lista para ver cómo quedaron " +
  "las sugerencias.";

/** Confirms the grouping — DESIGN.md names "agrupar" among the actions a toast confirms. */
export function confirmacionDeGrupo(cantidad: number): string {
  return `Agrupamos ${cantidad} sugerencias.`;
}

/** Confirms the way out. */
export const CONFIRMACION_QUITAR = "La sugerencia salió del grupo.";

/**
 * What a grouping action gives back: the WHOLE list, or a sentence to show.
 *
 * The list and not the affected row, because a grouping write reaches rows the
 * caller never named — see `crearGrupoSugerencias`. This is also why the screen
 * replaces its cache wholesale instead of patching an entry: there is no entry
 * to patch that would be enough.
 */
export type ResultadoGrupo =
  | { readonly ok: true; readonly sugerencias: readonly SugerenciaAdminDTO[] }
  | { readonly ok: false; readonly mensaje: string };

async function pedirLista(ruta: string, init: RequestInit): Promise<ResultadoGrupo> {
  let response: Response;

  try {
    response = await fetch(ruta, init);
  } catch {
    /* No status, no body: the server was never reached, so nothing was written. */
    return { ok: false, mensaje: ERROR_DE_RED_GRUPO };
  }

  const cuerpo = await response.json().catch(() => undefined);

  if (!response.ok) {
    return { ok: false, mensaje: mensajeDe(cuerpo) };
  }

  const sugerencias = sugerenciasDe(cuerpo);

  return sugerencias === null ? { ok: false, mensaje: ERROR_SIN_LISTA } : { ok: true, sugerencias };
}

/** Alta de grupo — `POST /api/sugerencias/grupos`. */
export function agruparSugerencias(
  titulo: string,
  sugerenciaIds: readonly number[],
): Promise<ResultadoGrupo> {
  return pedirLista(RUTA_GRUPOS, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ titulo, sugerenciaIds }),
  });
}

/** Salida del grupo — `DELETE /api/sugerencias/{id}/grupo`. */
export function quitarDeGrupo(id: number): Promise<ResultadoGrupo> {
  return pedirLista(rutaGrupoDeSugerencia(id), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
}
