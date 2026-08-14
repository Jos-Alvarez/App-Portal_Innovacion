import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRoute } from "@/lib/authz";
import { ERROR_INTERNO } from "@/lib/mis-recursos/errors";
import { listarRecursosAsignados } from "@/lib/mis-recursos/repository";
import { prisma } from "@/lib/prisma";

/**
 * What the signed-in collaborator was assigned — ADR 0003's
 * `GET /api/mis-recursos`.
 *
 *   GET /api/mis-recursos → 200 { recursos: RecursoAsignado[] }
 *
 * ONE LIST, TWO TABLES. ADR 0002 keeps the grants apart and this endpoint puts
 * them back together, because the split is a storage decision and the dashboard
 * is a person looking for the thing they need. `lib/mis-recursos/repository.ts`
 * explains the merged shape.
 *
 * GUARDED WITH `guardRoute`, NOT `guardRouteAdmin`. Everything shipped so far is
 * the administration side; this is the first endpoint written for everyone else,
 * and the check it needs is exactly "an active account" — the assignments
 * themselves are the authorization, and they are what the read is filtered by.
 * There is no `?usuarioId=`: the request cannot name whose dashboard it wants,
 * so it cannot ask for someone else's, and the identity comes from the guard's
 * own re-read of SQL Server on this very request (ADR 0007).
 *
 * NO EXTERNAL URL TRAVELS IN THIS RESPONSE. Opening an enlace goes through
 * `/api/enlaces/{id}/abrir`, so the destination has no reason to reach the
 * browser and the repository never selects it — one fewer thing a page left open
 * after a revocation can hand over.
 *
 * AN EMPTY LIST IS A SUCCESS. A collaborator with nothing assigned is an
 * ordinary state DESIGN.md has a screen for; answering 404 would turn a normal
 * day into a failure the client has to interpret.
 */

/**
 * Required by `lib/authz/index.ts` on every protected route. `auth()` reads
 * cookies and so forces dynamic rendering today, but that is a property of the
 * current code shape rather than a promise; a statically rendered protected
 * route would run its guard once at build time and never again.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const acceso = await guardRoute();
  if (!acceso.allowed) {
    return acceso.response;
  }

  try {
    return NextResponse.json({
      recursos: await listarRecursosAsignados(prisma, acceso.usuario.id),
    });
  } catch (error) {
    /* The detail stays in the server log; the browser gets a code and a Spanish sentence. */
    console.error("GET /api/mis-recursos", error);
    return failureResponse(ERROR_INTERNO);
  }
}
