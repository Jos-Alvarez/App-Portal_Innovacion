/**
 * The authentication gate's routing rules, kept free of Auth.js and of Next's
 * request objects so they can be exercised as plain functions.
 *
 * SCOPE — authentication only: these helpers answer "which requests may proceed
 * without a session" and "where do we send someone who has none". They say
 * nothing about what a signed-in user is allowed to do. Roles (`es_admin`) and
 * per-user assignments are read from SQL Server on every request by the
 * server-side authorization guard of backlog item #4, never here and never from
 * the session token (ADR 0007).
 */

/** Auth.js `pages.signIn`. Also the destination of every gated redirect. */
export const SIGN_IN_PATH = "/login";

/**
 * Auth.js `pages.error`. Deliberately nested under the sign-in path so that one
 * public prefix covers both screens: a rejected sign-in must be able to render
 * its explanation while it still has no session.
 */
export const AUTH_ERROR_PATH = "/login/error";

/** Where a sign-in lands when the request carried no destination of its own. */
export const DEFAULT_AFTER_SIGN_IN_PATH = "/";

/** Query parameter carrying the destination across the sign-in round trip. */
export const CALLBACK_URL_PARAM = "callbackUrl";

/**
 * The Auth.js catch-all endpoint. It must stay reachable while unauthenticated
 * or the OAuth round trip could never complete: the redirect to Entra ID, the
 * callback that creates the session and the CSRF token all live under it.
 */
const AUTH_API_PREFIX = "/api/auth";

/**
 * True when `pathname` is `prefix` itself or a path below it.
 *
 * The segment boundary is the point: a plain `startsWith` would also make
 * `/loginfalso` public, which is a route an attacker gets to choose the name of
 * simply by asking for it.
 */
function isWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Whether a request may proceed without a session.
 *
 * Everything else is gated. Keeping the list this short — the sign-in screen,
 * the error screen it redirects to, and the Auth.js endpoints — is what keeps
 * the gate from looping: a redirect can only ever land on a path that is
 * already public here.
 */
export function isPublicPath(pathname: string): boolean {
  return isWithin(pathname, SIGN_IN_PATH) || isWithin(pathname, AUTH_API_PREFIX);
}

/**
 * Reduces a requested destination to something safe to redirect to after a
 * successful sign-in.
 *
 * Only same-site paths survive. The value reaches us through a query parameter,
 * so it is attacker-controlled: an absolute or protocol-relative URL would turn
 * the corporate login into an open redirect, which is exactly the shape a
 * credible phishing link needs. A leading backslash is rejected too because
 * browsers normalise `/\host` to `//host`.
 */
export function toSafeCallbackUrl(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) {
    return DEFAULT_AFTER_SIGN_IN_PATH;
  }

  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return DEFAULT_AFTER_SIGN_IN_PATH;
  }

  return raw;
}
