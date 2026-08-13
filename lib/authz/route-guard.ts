import { NextResponse } from "next/server";

import {
  type Authorization,
  type AuthorizedUsuario,
  errorForDenial,
  statusForDenial,
} from "@/lib/authz/decisions";

/**
 * The Route Handler entry point.
 *
 * A handler cannot render anything, so its only way to refuse is a status code
 * and a body — which is exactly why this shape differs from the Server
 * Component one in `page-guard.tsx`. The two are deliberately not
 * interchangeable: a denial that reached a handler as a React element would be
 * serialised as a 200 with markup in it, and a browser calling `/api/...` would
 * read that as success.
 */

export type RouteAuthorization =
  | { readonly allowed: true; readonly usuario: AuthorizedUsuario }
  /** Return this as-is from the handler; the status and body are already right. */
  | { readonly allowed: false; readonly response: NextResponse };

/**
 * Translates a decision into what a Route Handler returns.
 *
 * The body is ADR 0003's contract — `codigo` plus a Spanish `mensaje` the UI
 * can show without translating an error code for the reader.
 */
export function toRouteAuthorization(authorization: Authorization): RouteAuthorization {
  if (authorization.allowed) {
    return { allowed: true, usuario: authorization.usuario };
  }

  return {
    allowed: false,
    response: NextResponse.json(errorForDenial(authorization.reason), {
      status: statusForDenial(authorization.reason),
    }),
  };
}
