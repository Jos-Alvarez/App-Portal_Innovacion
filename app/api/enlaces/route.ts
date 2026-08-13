import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRouteAdmin } from "@/lib/authz";
import { ERROR_INTERNO, errorDePrisma, errorDeValidacion } from "@/lib/enlaces/errors";
import { crearEnlace, listarEnlaces } from "@/lib/enlaces/repository";
import { crearEnlaceSchema } from "@/lib/enlaces/schema";
import { prisma } from "@/lib/prisma";

/**
 * The enlaces catalogue — ADR 0003's `/api/enlaces`, collection half.
 *
 *   GET  /api/enlaces  → 200 { enlaces: EnlaceDTO[] }
 *   POST /api/enlaces  → 201 { enlace: EnlaceDTO }
 *
 * WHY THESE TWO VERBS AND THIS PATH. ADR 0003 names `/api/enlaces` as the
 * admin CRUD route, and the collection/item split is what makes the verbs
 * unambiguous: the collection is the thing you list and add to, so `GET` and
 * `POST` belong here, while editing and taking down a single enlace need its id
 * and live in `[id]/route.ts`.
 *
 * A success payload is wrapped in a named key (`enlaces`, `enlace`) and a
 * failure is the bare `ApiError`. The asymmetry is deliberate and matches what
 * the guard already answers: errors have one shape across every status code so
 * a client never has to guess, while a success keeps room to grow a sibling key
 * later (a count, a cursor) without breaking a client that reads `enlaces`.
 *
 * EVERY HANDLER GUARDS ITSELF. `lib/authz/index.ts` is explicit that a
 * layout-level or middleware-level check is not enough, so both handlers below
 * call `guardRouteAdmin` first — before reading the body, before touching
 * Prisma — and return its refusal untouched.
 */

/**
 * Required by `lib/authz/index.ts` on every protected route. `auth()` reads
 * cookies and so forces dynamic rendering today, but that is a property of the
 * current code shape rather than a promise; a statically rendered protected
 * route would run its guard once at build time and never again.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  try {
    /*
     * The whole catalogue, bajas included: this is the administration view,
     * and an administrator who cannot see what they deactivated cannot undo it.
     */
    return NextResponse.json({ enlaces: await listarEnlaces(prisma) });
  } catch (error) {
    console.error("GET /api/enlaces", error);
    return failureResponse(ERROR_INTERNO);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  /*
   * A body that is not JSON becomes `undefined`, which the schema then rejects
   * as a whole-body problem — a 400 the caller can fix, where an uncaught
   * `SyntaxError` would have been a 500 that blamed the server for the client's
   * malformed request.
   */
  const cuerpo = await request.json().catch(() => undefined);
  const datos = crearEnlaceSchema.safeParse(cuerpo);

  if (!datos.success) {
    return failureResponse(errorDeValidacion(datos.error));
  }

  try {
    /* `datos.data`, never `cuerpo`: the parsed output is what dropped `activo`, `id` and any other key. */
    return NextResponse.json({ enlace: await crearEnlace(prisma, datos.data) }, { status: 201 });
  } catch (error) {
    /* The detail stays in the server log; the browser gets a code and a Spanish sentence. */
    console.error("POST /api/enlaces", error);
    return failureResponse(errorDePrisma(error));
  }
}
