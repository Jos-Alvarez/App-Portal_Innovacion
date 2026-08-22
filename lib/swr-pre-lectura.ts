import type { SWRConfiguration } from "swr";

/**
 * The one SWR setting every screen in this portal that pre-reads on the server
 * has to write down, and the argument for it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `fallbackData` SEEDS THE FIRST RENDER. IT DOES NOT STOP THE FIRST FETCH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Four screens share one shape: the Server Component reads the rows on THIS
 * request, hands them to a client component, and that component passes them to
 * `useSWR` as `fallbackData` so the first paint is complete and nothing flashes.
 *
 * SWR still fetches immediately on mount. The reason is not obvious and is worth
 * writing out once: `revalidateOnMount` defaults to `undefined`, and SWR then
 * falls back to `revalidateIfStale` — which defaults to `true` and, crucially,
 * treats `fallbackData` as data that IS present. So the hook mounts holding the
 * server's rows, decides they are stale, and asks the portal's own API for the
 * same rows the server produced milliseconds earlier.
 *
 * On the dashboard that is one redundant read per page load. On
 * `/admin/analitica` it was three `GROUP BY`s over `evento_uso` per page load,
 * which is what made the cost visible enough to find.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT IS GIVEN UP, STATED PLAINLY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * SWR's cache is global to the tab and outlives any single screen, and the cache
 * wins over `fallbackData` whenever it holds anything. So a reader who leaves the
 * dashboard for ten minutes and soft-navigates back gets the cached list, ten
 * minutes old, until the interval fires.
 *
 * That is a change in LATENCY, not in what is shown: with the mount revalidation
 * on, the very same stale cached list is what renders first — the difference is
 * only whether it is corrected in one round trip or within the interval. And the
 * interval is the freshness these screens already promise: a reader who simply
 * stays put is looking at data up to a minute old by design. The mount
 * revalidation was an extra refresh outside that budget, paid on every load, to
 * shorten a window the policy already accepts.
 *
 * `revalidateOnFocus` is untouched and covers the case that actually matters —
 * the tab left open all morning.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS A SHARED CONSTANT AND NOT AN `<SWRConfig>` DEFAULT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `app/(portal)/sugerencias/sugerencias-client.ts` refuses a provider, and the
 * refusal still stands: the provider is a client component and would wrap every
 * Server Component page in a client boundary, and a shared default hides a policy
 * that is a claim about one particular set of data.
 *
 * This is not such a claim. It is a fact about a PATTERN — "the server already
 * read this, on this request" — and it is true of every key that opts in, by
 * name, at its own call site. Each `OPCIONES_*` still owns its own interval and
 * its own reasons; they only stop repeating this paragraph four times.
 */
export const SIN_REVALIDACION_AL_MONTAR: Pick<SWRConfiguration, "revalidateOnMount"> = {
  revalidateOnMount: false,
};
