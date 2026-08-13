import type { ReactNode } from "react";

import {
  type Authorization,
  type AuthorizedUsuario,
  denialKind,
} from "@/lib/authz/decisions";
import { ForbiddenScreen } from "@/lib/authz/forbidden-screen";

/**
 * The Server Component entry point.
 *
 * A page cannot answer with a status code — it can only render — so its denial
 * arrives as something to return. That is the whole reason this shape differs
 * from the Route Handler one in `route-guard.ts`, and why the two are named
 * apart: reaching for the wrong one is caught by the compiler, since a page
 * returning a `NextResponse` and a handler returning an element are both type
 * errors rather than silent 200s.
 *
 * The denial renders in place instead of redirecting home. The PRD asks for the
 * resource to be blocked with a clear message, and a redirect reads as hiding
 * it — the reader ends up somewhere else with no idea why.
 */

export type PageAuthorization =
  | { readonly allowed: true; readonly usuario: AuthorizedUsuario }
  /** Return this from the page; it is DESIGN.md's Sin permiso screen. */
  | { readonly allowed: false; readonly screen: ReactNode };

export function toPageAuthorization(authorization: Authorization): PageAuthorization {
  if (authorization.allowed) {
    return { allowed: true, usuario: authorization.usuario };
  }

  return { allowed: false, screen: <ForbiddenScreen kind={denialKind(authorization.reason)} /> };
}
