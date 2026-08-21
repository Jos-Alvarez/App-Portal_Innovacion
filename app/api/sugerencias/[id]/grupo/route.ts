import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRouteAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { errorDeGrupo, identificadorInvalido } from "@/lib/sugerencias/errors";
import { quitarSugerenciaDeGrupo } from "@/lib/sugerencias/repository";
import { idSugerenciaSchema } from "@/lib/sugerencias/schema";

/**
 * La salida de un grupo — the correction path of item #16.
 *
 *   DELETE /api/sugerencias/{id}/grupo → 200 { sugerencias: SugerenciaAdminDTO[] }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A CORRECTION PATH IS PART OF THE FEATURE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The same argument item #15 made about the funnel's order. An administrator who
 * files an idea into the wrong bucket needs a way back INSIDE the portal; without
 * one, the only correction is an edit against the database, and something the PRD
 * describes as a convenience — "para no gestionarlas por separado" — becomes a
 * decision nobody can undo.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DELETE, AND THE RESOURCE IS THE MEMBERSHIP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `app/api/enlaces/[id]` already established the reading: the verb describes what
 * happens to the RESOURCE THE CLIENT ADDRESSED. Here that resource is this
 * suggestion's membership in a group, and it ceases to exist. The suggestion
 * itself is untouched — its words, its author, its state and its whole ledger
 * survive, which is exactly what "conservan su estado y autor individuales"
 * promises.
 *
 * It takes no body, so the `request` argument Next passes is accepted and
 * deliberately unused.
 *
 * GROWING an existing group is deliberately not a second mode of this route, and
 * there is no `PATCH` beside it. The screen regroups by selecting the members it
 * wants and naming the group again — one control instead of two, and no endpoint
 * shipped that nothing calls.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ANSWER IS THE WHOLE LIST
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Taking the second-to-last member out of a group leaves that group below the
 * minimum, so it is deleted and the SURVIVOR's `grupo_id` becomes null too — a
 * row the caller never named. Answering with the one suggestion it addressed
 * would be true and insufficient. See `quitarSugerenciaDeGrupo`.
 */

export const dynamic = "force-dynamic";

/** Next 16 hands dynamic route params to the handler as a promise. */
interface Contexto {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: Contexto): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const id = idSugerenciaSchema.safeParse((await params).id);
  if (!id.success) {
    return failureResponse(identificadorInvalido());
  }

  try {
    return NextResponse.json({ sugerencias: await quitarSugerenciaDeGrupo(prisma, id.data) });
  } catch (error) {
    /* The detail stays in the server log; the browser gets a code and a sentence. */
    console.error("DELETE /api/sugerencias/[id]/grupo", error);
    return failureResponse(errorDeGrupo(error));
  }
}
