import type { SWRConfiguration } from "swr";

import { SIN_REVALIDACION_AL_MONTAR } from "@/lib/swr-pre-lectura";

import type { RecursoAsignado } from "@/lib/mis-recursos/repository";

/**
 * The browser's side of `GET /api/mis-recursos`, and the revalidation policy of
 * ADR 0007 — the client half of the immediacy promise item #4 deferred here.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THERE IS NO <SWRConfig> PROVIDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * SWR offers two places to put configuration: per hook, or globally through a
 * provider mounted above the tree. The provider was rejected, for three reasons
 * that are worth writing down before the second screen adopts SWR and someone
 * reaches for one out of habit.
 *
 * 1. It would need a client boundary at the root. `SWRConfig` is a client
 *    component; mounting it in `app/layout.tsx` puts a "use client" wrapper
 *    around every page in the portal, including the ones that are pure Server
 *    Components today and read the database directly.
 * 2. It hides the policy from the call site. `refreshInterval` is a decision
 *    about THIS data — assignments change when an administrator flips a switch,
 *    which is rare — and a reader of the dashboard should be able to see how
 *    often it re-asks without going up three levels to find out.
 * 3. There is exactly one SWR key in the portal. A global default that
 *    generalises a single case generalises from nothing. When item #10 or #13
 *    adds a second key with the SAME needs, lifting this object into a provider
 *    becomes a refactor with an actual reason behind it.
 *
 * So the policy lives here, next to the fetcher it applies to, exported as a
 * value the suite can assert against rather than as an object literal buried in
 * a hook call.
 */

/** The collection route of ADR 0003. It takes no parameters: it answers about you. */
export const RUTA_MIS_RECURSOS = "/api/mis-recursos";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ADR 0007 END TO END, WITH NUMBERS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Item #7 proved the server half: a revocation applies on the very next
 * request. This is the client half — the part that decides how long a screen
 * may keep SHOWING something the server would already refuse. Two tabs, one
 * administrator, one collaborator:
 *
 *  1. The collaborator opens `/`. The Server Component reads SQL Server and
 *     paints the list. t = 0.
 *  2. Hydration mounts the hook and SWR revalidates immediately
 *     (`revalidateIfStale`), so a server render that sat in flight is corrected
 *     within a round trip rather than at the first interval.
 *  3. The administrator turns ON an assignment at `/admin/asignaciones/{id}`.
 *     The switch is committed before it confirms — item #7 does not show a
 *     grant the server has not accepted — so the row exists the instant the
 *     toast appears.
 *  4. The collaborator does nothing. The resource appears on their screen at
 *     the next interval tick: WITHIN 60 SECONDS, and on average in 30.
 *  4'. Or the collaborator comes back to the tab. `revalidateOnFocus` fires on
 *     the focus event and the row appears in one round trip — subject only to
 *     SWR's `focusThrottleInterval`, which allows one focus revalidation every
 *     5 seconds.
 *  5. The administrator turns the assignment OFF while the tab is still open.
 *     Same two clocks: the row leaves within 60 seconds idle, or on return to
 *     the tab.
 *  6. THE WINDOW IN BETWEEN IS NOT A HOLE. Suppose the collaborator clicks the
 *     row one second after the revocation, before any revalidation. The anchor
 *     navigates to `/api/enlaces/{id}/abrir`, whose `guardRouteResource` re-reads
 *     the grant from SQL Server on THAT request and answers 403. Nothing opens,
 *     and no apertura is recorded.
 *
 * Which is ADR 0007's own consequence, stated as a measurement: "el recurso
 * revocado puede seguir visible en pantalla hasta la siguiente revalidación de
 * la UI (segundos) ... la vista puede ir levemente detrás de la verdad, la
 * autorización nunca". The view's lag is bounded at 60 seconds and is usually
 * one round trip. The authorization's lag is zero, and it is the one that
 * decides whether anything actually happens.
 */

/**
 * ADR 0007: "revalidación al recuperar el foco y en intervalos".
 *
 * SIXTY SECONDS, and the number is argued rather than picked. This list changes
 * only when an administrator assigns or revokes something — an event measured in
 * weeks, not seconds — so a shorter interval would spend a query per tab per
 * minute to observe nothing. The interval is the floor of the guarantee, not the
 * mechanism: the case that actually matters is the collaborator who left the tab
 * open, went to a meeting and came back, and `revalidateOnFocus` covers that one
 * the instant they return.
 *
 * `revalidateOnFocus: true` IS SWR's default and is written out anyway. ADR 0007
 * names it as a requirement, and a requirement satisfied by a default nobody
 * declared is one `swr` could change in a major version without a single line of
 * this repository changing to notice.
 *
 * WHAT IS DELIBERATELY LEFT AT ITS DEFAULT:
 *
 * - `refreshWhenHidden` (false) — polling a tab nobody is looking at buys
 *   nothing the focus revalidation does not already buy on return.
 * - `shouldRetryOnError` (true, exponential backoff) — a failed refresh is
 *   usually a blip, and retrying costs nothing while the previous data is still
 *   on screen.
 * WHAT IS NO LONGER LEFT AT ITS DEFAULT, AND WHY THIS PARAGRAPH CHANGED:
 *
 * `revalidateIfStale` used to be listed here as a deliberate default, described
 * as "what makes the mount after hydration re-ask, so a server render that sat
 * in flight for a while is corrected immediately rather than at the first
 * interval". That description was accurate about the mechanism and wrong about
 * the trade: it was buying a correction the interval and the focus revalidation
 * both already provide, at the price of a redundant read on EVERY page load —
 * for rows the server had just produced for that very request.
 *
 * `SIN_REVALIDACION_AL_MONTAR` turns it off and carries the whole argument.
 *
 * `keepPreviousData` is NOT set, and that is not an oversight: it only matters
 * when the key changes, and this key is a constant. What actually protects the
 * screen during a failed refresh is SWR's own cache semantics — see the fetcher
 * below.
 */
export const OPCIONES_MIS_RECURSOS: SWRConfiguration<readonly RecursoAsignado[]> = {
  /* `app/(portal)/page.tsx` reads the assignments for this request and hands
     them down; the mount has nothing left to ask for. */
  ...SIN_REVALIDACION_AL_MONTAR,
  refreshInterval: 60_000,
  revalidateOnFocus: true,
};

/**
 * The one sentence this module owns. Every other message in the portal comes
 * from `lib/api/errors` and is shown as it stands, but this is not a refused
 * action — it is a background refresh that did not land while a perfectly good
 * list is on screen, and the API has no message for a request the reader never
 * made.
 *
 * It is deliberately not alarming and deliberately not silent. The reader is
 * told what they are looking at (the last list we managed to load) and that the
 * portal is still trying, because the honest failure here is not "something
 * broke" but "this may be a minute out of date".
 */
export const AVISO_SIN_ACTUALIZAR =
  "No pudimos actualizar tu lista de recursos. Estás viendo la última versión que cargamos; " +
  "lo intentaremos de nuevo en un momento.";

/** Narrows the parsed body to the list, or gives up. */
function recursosDe(cuerpo: unknown): readonly RecursoAsignado[] | null {
  if (typeof cuerpo !== "object" || cuerpo === null || !("recursos" in cuerpo)) {
    return null;
  }

  const recursos = (cuerpo as { recursos: unknown }).recursos;

  return Array.isArray(recursos) ? (recursos as readonly RecursoAsignado[]) : null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS FETCHER THROWS, AND THAT IS THE WHOLE POINT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * SWR replaces the cached value with whatever the fetcher RESOLVES, and keeps
 * the last cached value whenever it REJECTS — surfacing the failure as `error`
 * beside the data that is still good.
 *
 * So the shape of this function decides what a bad minute looks like on screen.
 * Returning `[]` on a 500 would be indistinguishable, to SWR, from a
 * collaborator whose access was revoked: a dashboard full of working resources
 * would empty itself into the "no tienes nada asignado" state because a gateway
 * timed out for one second. Throwing keeps the rows exactly where they are and
 * lets the screen add a line saying the list may be stale.
 *
 * Every failure is therefore a throw: a non-2xx, a body that is not JSON, and a
 * 200 whose body is not a list. The last one matters more than it looks — a 200
 * is not proof that the portal answered; a maintenance page and a truncated
 * response both arrive as one.
 *
 * The thrown message is never shown. The screen renders `AVISO_SIN_ACTUALIZAR`,
 * which says something a reader can act on; this text is for the console.
 */
export async function obtenerMisRecursos(ruta: string): Promise<readonly RecursoAsignado[]> {
  /* A rejected fetch — no network, no server — propagates untouched: it is
     already exactly the signal SWR needs, and catching it here to rethrow would
     only lose the original cause. */
  const response = await fetch(ruta, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`GET ${ruta} respondió ${response.status}`);
  }

  const cuerpo = await response.json().catch(() => undefined);
  const recursos = recursosDe(cuerpo);

  if (recursos === null) {
    throw new Error(`GET ${ruta} respondió 200 sin la lista de recursos`);
  }

  return recursos;
}
