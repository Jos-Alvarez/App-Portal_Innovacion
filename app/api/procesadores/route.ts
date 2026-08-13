import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRouteAdmin } from "@/lib/authz";
import { ERROR_INTERNO, errorDePrisma, errorDeValidacion } from "@/lib/procesadores/errors";
import { crearProcesador, listarProcesadores } from "@/lib/procesadores/repository";
import { crearProcesadorSchema } from "@/lib/procesadores/schema";
import { prisma } from "@/lib/prisma";

/**
 * The procesadores catalogue — ADR 0003's `/api/procesadores`, collection half.
 *
 *   GET  /api/procesadores  → 200 { procesadores: ProcesadorDTO[] }
 *   POST /api/procesadores  → 201 { procesador: ProcesadorDTO }
 *
 * The same shape as `/api/enlaces`, deliberately: the collection is what you
 * list and add to, editing and taking down a single procesador need its id and
 * live in `[id]/route.ts`. A success payload is wrapped in a named key and a
 * failure is the bare `ApiError`, so a client never has to guess which shape a
 * status code brings.
 *
 * NOT TO BE CONFUSED WITH THE EXECUTION ROUTE. ADR 0006 also names
 * `POST /api/procesadores/{id}/ejecutar`, which proxies an upload to the
 * FastAPI service and belongs to a later backlog item. It is a different
 * concern with a different guard (`guardRouteResource`, an assignment, not an
 * administrator) and it is not part of this catalogue.
 *
 * EVERY HANDLER GUARDS ITSELF, as `lib/authz/index.ts` requires — before
 * reading the body, before touching Prisma — and returns its refusal untouched.
 */

/** Required by `lib/authz/index.ts` on every protected route. */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  try {
    /* The whole catalogue, bajas included: this is the administration view. */
    return NextResponse.json({ procesadores: await listarProcesadores(prisma) });
  } catch (error) {
    console.error("GET /api/procesadores", error);
    return failureResponse(ERROR_INTERNO);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  /*
   * A body that is not JSON becomes `undefined`, which the schema rejects as a
   * whole-body problem — a 400 the caller can fix, where an uncaught
   * `SyntaxError` would be a 500 blaming the server for the client's request.
   */
  const cuerpo = await request.json().catch(() => undefined);
  const datos = crearProcesadorSchema.safeParse(cuerpo);

  if (!datos.success) {
    /*
     * A creation carries the whole execution contract at once, so the
     * cross-field rules of ADR 0002 are settled here by the schema itself.
     * The update has to work harder — see `[id]/route.ts`.
     */
    return failureResponse(errorDeValidacion(datos.error));
  }

  try {
    /* `datos.data`, never `cuerpo`: the parsed output is what dropped `activo`, `id` and any other key. */
    return NextResponse.json({ procesador: await crearProcesador(prisma, datos.data) }, { status: 201 });
  } catch (error) {
    /* The detail stays in the server log; the browser gets a code and a Spanish sentence. */
    console.error("POST /api/procesadores", error);
    return failureResponse(errorDePrisma(error));
  }
}
