import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRouteAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { errorDeAgrupacion, errorDeGrupo } from "@/lib/sugerencias/errors";
import { crearGrupoSugerencias } from "@/lib/sugerencias/repository";
import { crearGrupoSchema } from "@/lib/sugerencias/schema";

/**
 * La agrupación de sugerencias — ADR 0003's `POST /api/sugerencias/grupos`, and
 * the whole write side of item #16.
 *
 *   POST /api/sugerencias/grupos → 201 { sugerencias: SugerenciaAdminDTO[] }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT ANSWERS WITH THE WHOLE LIST, NOT WITH THE GROUP IT CREATED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every other write in this portal answers with the row it wrote. This one
 * cannot: filing a suggestion into a new group can leave its previous group below
 * the minimum, which deletes that group, which nulls the `grupo_id` of a
 * suggestion the caller never named and has no way to know it should ask about.
 *
 * A body carrying only the new group would be true and insufficient, and a screen
 * patching its cache from it would keep showing a group that no longer exists
 * until the next revalidation. See `crearGrupoSugerencias`.
 *
 * A 201, because a group is a resource that did not exist before — the same code
 * `POST /api/sugerencias` answers for the same reason. That the body is the list
 * rather than the created thing does not change what happened.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS ROUTE DELIBERATELY DOES NOT DO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It does not touch `estado`, and it writes no asiento. TECH-DESIGN.md asks that
 * grouped suggestions "conservan su estado y autor individuales", and ADR 0002
 * defines the ledger as one row per state TRANSITION. Filing an idea into a
 * bucket is not one, and the author reading their own trail would find a line
 * about an event that never happened to their idea. The repository is handed a
 * Prisma slice with no `historialSugerencia` in it, so this is enforced by the
 * type and not only by the intent.
 *
 * It sends no mail and records no `evento_uso`, for the reasons
 * `/api/sugerencias/[id]/estado` gives at length.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  /*
   * A body that is not JSON becomes `undefined`, which the schema then rejects as
   * a whole-body problem — a 400 the caller can fix, where an uncaught
   * `SyntaxError` would have been a 500 blaming the server for a malformed
   * request.
   */
  const cuerpo = await request.json().catch(() => undefined);
  const datos = crearGrupoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return failureResponse(errorDeAgrupacion(datos.error));
  }

  try {
    /*
     * `acceso.usuario.id` is the creator, never a field of the body — the parsed
     * output does not even carry a `creadoPor` key for a client to try.
     */
    const sugerencias = await crearGrupoSugerencias(
      prisma,
      datos.data.titulo,
      datos.data.sugerenciaIds,
      acceso.usuario.id,
    );

    return NextResponse.json({ sugerencias }, { status: 201 });
  } catch (error) {
    /* The detail stays in the server log; the browser gets a code and a sentence. */
    console.error("POST /api/sugerencias/grupos", error);
    return failureResponse(errorDeGrupo(error));
  }
}
