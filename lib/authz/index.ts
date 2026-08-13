import {
  authorizeAdminRequest,
  authorizeResourceRequest,
  authorizeSessionRequest,
} from "@/lib/authz/authorize";
import type { RecursoRef } from "@/lib/authz/decisions";
import { type PageAuthorization, toPageAuthorization } from "@/lib/authz/page-guard";
import { requestSource } from "@/lib/authz/request-source";
import { type RouteAuthorization, toRouteAuthorization } from "@/lib/authz/route-guard";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  HOW TO PROTECT A PAGE OR A ROUTE IN THIS PORTAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Read this before adding any screen or endpoint (items #5 onwards). It is the
 * only place the rules are written down.
 *
 * ── 1. Every page and every route handler guards itself ───────────────────
 *
 * NEVER put the guard only in a `layout.tsx`. Next's client Router Cache keeps
 * a shared layout's rendered output and reuses it across soft navigations —
 * "Layouts and loading states continue to be cached and reused on navigation"
 * (Next.js 16 upgrade guide, Client Cache). So a check that runs in
 * `app/(admin)/layout.tsx` does NOT run again when the reader moves from one
 * admin page to a sibling one, and a role revoked in between is never noticed
 * until a full reload. ADR 0007 promises the opposite: the block applies on the
 * next request, including a direct URL.
 *
 * A layout may still call a guard to decide what to SHOW (hiding an admin link,
 * for instance). It may never be the only thing deciding what is REACHABLE.
 *
 * ── 2. Server Component (a page) ──────────────────────────────────────────
 *
 *     import { guardPageAdmin } from "@/lib/authz";
 *
 *     export const dynamic = "force-dynamic";
 *
 *     export default async function EnlacesPage() {
 *       const acceso = await guardPageAdmin();
 *       if (!acceso.allowed) return acceso.screen;
 *
 *       // acceso.usuario is the collaborator, re-read from SQL Server.
 *     }
 *
 * A page cannot set a status code, so a denial comes back as `screen`: return
 * it and DESIGN.md's Sin permiso state renders in place. Do not redirect
 * instead — the PRD wants the resource blocked with an explanation, not hidden.
 *
 * ── 3. Route Handler (an endpoint under /api) ─────────────────────────────
 *
 *     import { guardRouteResource } from "@/lib/authz";
 *
 *     export const dynamic = "force-dynamic";
 *
 *     export async function POST(request: Request, { params }: ...) {
 *       const { id } = await params;
 *       const acceso = await guardRouteResource({ tipo: "procesador", id: Number(id) });
 *       if (!acceso.allowed) return acceso.response;
 *     }
 *
 * A handler cannot render, so a denial comes back as `response`: a 401 or 403
 * carrying ADR 0003's JSON error. The two shapes are named apart (`guardPage*`
 * vs `guardRoute*`) precisely so the wrong one is a compile error rather than a
 * page that answers 200 with an error inside it.
 *
 * ── 4. Always export `dynamic = "force-dynamic"` ──────────────────────────
 *
 * Calling `auth()` reads cookies, which already forces dynamic rendering today.
 * That is an emergent property of the code's shape, not a promise: a refactor
 * that moves the guard behind an early return could hand the route back to
 * static rendering, and a statically rendered protected route runs its guard
 * once at build time and never again. The export costs one line and removes the
 * possibility.
 *
 * ── 5. Never cache a permission ───────────────────────────────────────────
 *
 * ADR 0007 forbids permissions in the session token and in any cross-request
 * cache; immediacy of revocation is the requirement the whole design exists to
 * meet. The reads are deduplicated within one request by React's `cache()`
 * (`request-source.ts`) and by nothing else. Do not add `unstable_cache`, a
 * `revalidate`, or a role in a JWT callback.
 *
 * ── 6. What is NOT here ───────────────────────────────────────────────────
 *
 * `forbidden()` and `unauthorized()` from Next are deliberately unused: in
 * 16.3 they are canary-only behind `experimental.authInterrupts`. The guard
 * renders `ForbiddenState` directly instead, and needs no flag.
 *
 * Server Actions have no guard shape here because ADR 0003 rejected them in
 * favour of REST route handlers. If one is ever introduced it needs its own
 * shape — it can neither render nor return a response.
 */

/** Any active collaborator. The portal itself and the suggestions box need only this. */
export async function guardPage(): Promise<PageAuthorization> {
  return toPageAuthorization(await authorizeSessionRequest(requestSource));
}

/** An administrator, checked against `usuario.es_admin` in the database. */
export async function guardPageAdmin(): Promise<PageAuthorization> {
  return toPageAuthorization(await authorizeAdminRequest(requestSource));
}

/** A collaborator holding an assignment over this `enlace` or `procesador`. */
export async function guardPageResource(recurso: RecursoRef): Promise<PageAuthorization> {
  return toPageAuthorization(await authorizeResourceRequest(requestSource, recurso));
}

/** Any active collaborator, answering as a Route Handler. */
export async function guardRoute(): Promise<RouteAuthorization> {
  return toRouteAuthorization(await authorizeSessionRequest(requestSource));
}

/** An administrator, answering as a Route Handler. */
export async function guardRouteAdmin(): Promise<RouteAuthorization> {
  return toRouteAuthorization(await authorizeAdminRequest(requestSource));
}

/** An assignment over one resource, answering as a Route Handler. */
export async function guardRouteResource(recurso: RecursoRef): Promise<RouteAuthorization> {
  return toRouteAuthorization(await authorizeResourceRequest(requestSource, recurso));
}

export type { PageAuthorization } from "@/lib/authz/page-guard";
export type { RouteAuthorization } from "@/lib/authz/route-guard";
export type { AuthorizedUsuario, RecursoRef, RecursoTipo } from "@/lib/authz/decisions";
