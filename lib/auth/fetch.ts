/**
 * The `fetch` the OAuth flow must use, and why it cannot be the global one.
 *
 * THE BUG THIS EXISTS TO AVOID. Next.js replaces `globalThis.fetch` with its
 * own caching wrapper. The Response that wrapper hands back does not survive
 * `clone()` the way a platform Response does: reading the clone leaves the
 * ORIGINAL marked as consumed. That is fatal in exactly one place —
 * `@auth/core`'s callback reads `codeGrantResponse.clone().json()` first (it
 * has to, because Entra ID reports token errors in the body and the `tid`
 * claim decides the real issuer), and then hands the untouched original to
 * `oauth4webapi`. With the wrapped Response, `oauth4webapi` finds `bodyUsed`
 * already true and throws `"response" body has been used already`, which
 * Auth.js reports as `CallbackRouteError` and the login screen shows as the
 * opaque `?error=Configuration`.
 *
 * WHY THE UNPATCHED FETCH IS THE RIGHT ANSWER AND NOT A WORKAROUND. Next's
 * wrapper exists to CACHE responses. An OAuth token exchange is the textbook
 * example of a request that must never be cached: it spends a single-use
 * authorization code. Taking these calls out of the cache layer is what they
 * always wanted; the clone bug is only what made the omission visible.
 *
 * `_nextOriginalFetch` is the handle Next itself attaches for this — its own
 * comment in `patch-fetch.js` says the properties are there "for external
 * consumers to determine if the fetch function has been patched".
 */

type Fetch = typeof fetch;

/** What Next attaches to the fetch it installs. */
interface FetchParcheado {
  _nextOriginalFetch?: Fetch;
}

/**
 * The platform `fetch`, with Next's caching wrapper peeled off when there is
 * one.
 *
 * READ LAZILY, ON EVERY CALL, and never captured at module load: this module is
 * evaluated while the server is still starting, and Next installs its wrapper
 * afterwards. A value captured at import time would be the unwrapped fetch by
 * accident today and the wrapped one tomorrow, depending on load order.
 *
 * Outside Next — the test suite, a script — nothing is patched and the global
 * fetch is returned unchanged, so callers need no branch of their own.
 */
export function fetchSinCache(global: Fetch = globalThis.fetch): Fetch {
  const original = (global as Fetch & FetchParcheado)._nextOriginalFetch;

  return typeof original === "function" ? original : global;
}
