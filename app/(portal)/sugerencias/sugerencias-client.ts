import type { SWRConfiguration } from "swr";

import { SIN_REVALIDACION_AL_MONTAR } from "@/lib/swr-pre-lectura";

import { ERROR_INTERNO } from "@/lib/sugerencias/errors";
import type { SugerenciaDTO } from "@/lib/sugerencias/repository";
import type { CrearSugerencia } from "@/lib/sugerencias/schema";

/**
 * The browser's side of `/api/sugerencias`: the revalidation policy, the two
 * calls the screen makes, and the one way a date is written.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SECOND SWR KEY IN THE PORTAL, AND STILL NO <SWRConfig> PROVIDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `app/(portal)/mis-recursos-client.ts` gave three reasons for keeping the
 * policy at the call site, and named this item as the moment to reconsider:
 * "When item #10 or #13 adds a second key with the SAME needs, lifting this
 * object into a provider becomes a refactor with an actual reason behind it."
 *
 * This is that second key, and the answer is still no — because only the third
 * reason expired. The first two are unchanged and are the load-bearing ones:
 *
 * 1. `SWRConfig` is a client component, so mounting it in `app/layout.tsx`
 *    wraps every page in the portal — including the pure Server Components that
 *    read the database directly — in a client boundary. Two hooks is not a
 *    price worth paying for that.
 * 2. It hides the policy from the call site. The number below is a claim about
 *    THIS data, and it is not the same claim the dashboard makes: assignments
 *    change when an administrator flips a switch, a suggestion's state changes
 *    when an administrator reviews it, and the two happen to want the same
 *    interval today for different reasons. A shared default would erase that
 *    distinction, and the day one of them wants a different number, whoever
 *    changes it has to work out which screens they just affected.
 *
 * What DID expire — "there is exactly one SWR key, so a default generalises from
 * nothing" — was never the reason on its own. Two keys that agree by coincidence
 * are not evidence of a shared policy.
 */

/** The collection route of ADR 0003. It takes no parameters: it answers about you. */
export const RUTA_SUGERENCIAS = "/api/sugerencias";

/**
 * ADR 0007's policy — "revalidación al recuperar el foco y en intervalos" —
 * applied to a list that changes for a reason the reader cannot see.
 *
 * The author sends a suggestion and then nothing they do changes it again: the
 * next change is an administrator moving it through the funnel of item #15,
 * on another screen, minutes or weeks later. This is the same "the change comes
 * from someone else entirely" shape the dashboard has, which is why the same two
 * clocks apply — and why the local mutation after a successful send does NOT go
 * through them (see `mutate` at the call site).
 *
 * SIXTY SECONDS, matching the dashboard, and for a reason that survives being
 * stated: a state review is a human action measured in days. The interval is the
 * floor of the guarantee, not the mechanism; the case that actually matters is
 * the person who left the tab open, and `revalidateOnFocus` covers that one the
 * instant they come back.
 *
 * `revalidateOnFocus: true` IS SWR's default and is written out anyway, exactly
 * as the dashboard writes it out: ADR 0007 names it as a requirement, and a
 * requirement met by an undeclared default is one `swr` could change in a major
 * version without a line here changing to notice.
 */
export const OPCIONES_SUGERENCIAS: SWRConfiguration<readonly SugerenciaDTO[]> = {
  /* The server read this list for this request; see the module for why the
     mount must not ask for it again. It also makes the note beside `mutate` in
     `buzon.tsx` true as written: the cache really does stay empty until a
     revalidation lands. */
  ...SIN_REVALIDACION_AL_MONTAR,
  refreshInterval: 60_000,
  revalidateOnFocus: true,
};

/**
 * Shown when a background revalidation fails while a perfectly good list is on
 * screen. Not an error state — the list is not wrong, it may be a minute old.
 *
 * The wording says "el estado de tus sugerencias" and not "tu lista", because
 * that is what actually goes stale here: the suggestions themselves are yours
 * and are not going anywhere, and the only thing a refresh brings is a state an
 * administrator may have changed.
 */
export const AVISO_SIN_ACTUALIZAR =
  "No pudimos actualizar el estado de tus sugerencias. Estás viendo la última versión que " +
  "cargamos; lo intentaremos de nuevo en un momento.";

/** The send never reached the server: no status, no body, nothing written. */
export const ERROR_DE_RED =
  "No pudimos conectar con el servidor, así que tu sugerencia no se envió. Revisa tu conexión y " +
  "vuelve a intentarlo.";

/** Confirms the send — DESIGN.md: "Toast ... confirma toda acción sin navegación". */
export const CONFIRMACION_ENVIO = "Enviamos tu sugerencia al Área de Innovación.";

/** Narrows the parsed body to the list, or gives up. */
function sugerenciasDe(cuerpo: unknown): readonly SugerenciaDTO[] | null {
  if (typeof cuerpo !== "object" || cuerpo === null || !("sugerencias" in cuerpo)) {
    return null;
  }

  const sugerencias = (cuerpo as { sugerencias: unknown }).sugerencias;

  return Array.isArray(sugerencias) ? (sugerencias as readonly SugerenciaDTO[]) : null;
}

/**
 * THIS FETCHER THROWS, for the reason the dashboard's does.
 *
 * SWR replaces the cached value with whatever the fetcher RESOLVES and keeps the
 * last good one whenever it REJECTS. Returning `[]` on a bad minute would empty
 * a screen full of suggestions into "todavía no enviaste ninguna" — which here
 * is worse than on the dashboard, because the reader would reasonably conclude
 * that what they wrote was lost.
 *
 * Every failure is therefore a throw: a non-2xx, a body that is not JSON, and a
 * 200 whose body is not a list. The thrown message is for the console; the
 * screen shows `AVISO_SIN_ACTUALIZAR`.
 */
export async function obtenerSugerencias(ruta: string): Promise<readonly SugerenciaDTO[]> {
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
 * The send, as the screen sees it: either the registered suggestion or a
 * sentence to show.
 *
 * The same discriminated shape `app/admin/catalogo/enlaces-client.ts` uses, and
 * for the same reason — a caller cannot read the result without deciding which
 * case it is in, so "assume it worked" is not something that can be written by
 * accident.
 */
export type ResultadoEnvio =
  | { readonly ok: true; readonly sugerencia: SugerenciaDTO }
  | { readonly ok: false; readonly mensaje: string };

/** The failure envelope's `mensaje`, when the body actually is one. */
function mensajeDe(cuerpo: unknown): string {
  if (typeof cuerpo === "object" && cuerpo !== null && "mensaje" in cuerpo) {
    const mensaje = (cuerpo as { mensaje: unknown }).mensaje;
    if (typeof mensaje === "string" && mensaje.length > 0) return mensaje;
  }

  /* A failing status with no envelope — a proxy's own error page, a gateway
     timeout. The server said nothing usable, so the generic sentence stands in. */
  return ERROR_INTERNO.error.mensaje;
}

/** The `{ sugerencia }` a successful response wraps, when it really carries one. */
function sugerenciaDe(cuerpo: unknown): SugerenciaDTO | null {
  if (typeof cuerpo === "object" && cuerpo !== null && "sugerencia" in cuerpo) {
    const sugerencia = (cuerpo as { sugerencia: unknown }).sugerencia;
    if (typeof sugerencia === "object" && sugerencia !== null) return sugerencia as SugerenciaDTO;
  }

  return null;
}

/**
 * Alta — `POST /api/sugerencias`.
 *
 * A 201 whose body is not a suggestion is treated as a FAILURE, which is the
 * conservative direction and deserves saying out loud: the row may well have
 * been written. Telling someone their suggestion was not sent when it was costs
 * a duplicate the Área de Innovación can group (item #16); telling them it was
 * sent when it was not costs the idea.
 */
export async function enviarSugerencia(datos: CrearSugerencia): Promise<ResultadoEnvio> {
  let response: Response;

  try {
    response = await fetch(RUTA_SUGERENCIAS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(datos),
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
    ? { ok: false, mensaje: ERROR_INTERNO.error.mensaje }
    : { ok: true, sugerencia };
}

/**
 * The date helpers moved to `lib/sugerencias/fechas.ts` when item #15 added the
 * second screen that renders these same rows, and are re-exported here so item
 * #13's call sites and its suite keep the import they already had. The reasoning
 * for the fixed zone lives with the definition.
 */
export { ZONA_HORARIA, formatearFecha } from "@/lib/sugerencias/fechas";
