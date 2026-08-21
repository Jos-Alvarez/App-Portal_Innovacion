import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRoute } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { ERROR_INTERNO, errorDePrisma, errorDeValidacion } from "@/lib/sugerencias/errors";
import { crearSugerencia, listarSugerenciasDeAutor } from "@/lib/sugerencias/repository";
import { crearSugerenciaSchema } from "@/lib/sugerencias/schema";

/**
 * El buzón de sugerencias — ADR 0003's `/api/sugerencias`, collection half.
 *
 *   GET  /api/sugerencias  → 200 { sugerencias: SugerenciaDTO[] }  (yours)
 *   POST /api/sugerencias  → 201 { sugerencia: SugerenciaDTO }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `guardRoute` AND NOT `guardRouteResource` — THE ACCESS RULE IS THE ITEM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The backlog's line for item #13 ends with "Acceso general: no requiere
 * asignación", and the PRD says it twice as plainly: "el buzón de ideas de
 * innovación es de acceso general: todo colaborador con correo corporativo
 * válido puede iniciar sesión, entrar al portal y ver/enviar sugerencias sin
 * necesidad de asignación. La asignación individual del administrador se limita
 * a decidir quién accede a cada app/agente/procesador."
 *
 * So this is the second endpoint in the portal — after `/api/mis-recursos` — to
 * ask only for an active session. Guarding it with the resource guard would
 * require inventing a grant over something that is not a resource; guarding it
 * with the admin guard would lock out the entire audience it exists for.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE GET IS ALWAYS "MINE", INCLUDING FOR AN ADMINISTRATOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `acceso.usuario.id` is the only author this route ever reads, and `esAdmin` is
 * not consulted. An administrator asking this endpoint gets THEIR OWN
 * suggestions, because they are also a collaborator and this is the collaborator
 * screen's data.
 *
 * Item #15 needs the complete list. It must add an explicitly widened, explicitly
 * admin-guarded read — a distinct route, or a parameter this handler refuses
 * unless `guardRouteAdmin` passes — and must NOT make this default depend on the
 * caller's role. A scope that silently widens for some readers is a scope that
 * will one day widen for the wrong one, and the symptom is a collaborator's
 * screen quietly showing other people's ideas with no error anywhere.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS ROUTE DELIBERATELY DOES NOT DO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It does not send mail. That is item #14, and the PRD has already settled its
 * shape: the send is best-effort and a failure "se ignora silenciosamente. La
 * sugerencia no se pierde porque ya está garantizada en la base de datos". When
 * #14 lands it hooks in AFTER the insert has succeeded and can never turn a
 * saved suggestion into a failed request.
 *
 * It records no `evento_uso`. That table's vocabulary is closed by a database
 * CHECK constraint over `apertura`, `ejecucion` and the five typed processing
 * errors; a suggestion is none of those. The analytics item #19 wants —
 * "sugerencias por estado y por área" — is an aggregate over the `sugerencia`
 * table itself, which is exactly what ADR 0010 says it queries.
 *
 * A success payload is wrapped in a named key and a failure is the bare
 * `ApiError`, matching every other route here.
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
      sugerencias: await listarSugerenciasDeAutor(prisma, acceso.usuario.id),
    });
  } catch (error) {
    console.error("GET /api/sugerencias", error);
    return failureResponse(ERROR_INTERNO);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const acceso = await guardRoute();
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
  const datos = crearSugerenciaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return failureResponse(errorDeValidacion(datos.error));
  }

  try {
    /*
     * `acceso.usuario.id` is the author, never a field of the body. The session
     * is the only thing that says who is writing, and the parsed output does not
     * even carry an `autorId` key for a client to try — so writing a suggestion
     * in somebody else's name is not something this route can be talked into.
     */
    const sugerencia = await crearSugerencia(prisma, acceso.usuario.id, datos.data);

    return NextResponse.json({ sugerencia }, { status: 201 });
  } catch (error) {
    /* The detail stays in the server log; the browser gets a code and a Spanish sentence. */
    console.error("POST /api/sugerencias", error);
    return failureResponse(errorDePrisma(error));
  }
}
