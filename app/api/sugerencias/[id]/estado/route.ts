import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRouteAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  errorDeTransicion,
  estadoInvalido,
  identificadorInvalido,
} from "@/lib/sugerencias/errors";
import { cambiarEstadoSugerencia } from "@/lib/sugerencias/repository";
import { cambiarEstadoSchema, idSugerenciaSchema } from "@/lib/sugerencias/schema";

/**
 * El cambio de estado — ADR 0003's `PATCH /api/sugerencias/{id}/estado`, and the
 * write half of item #15.
 *
 *   PATCH /api/sugerencias/{id}/estado → 200 { sugerencia: SugerenciaAdminDTO }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `guardRouteAdmin`, AND THE ONE THING THAT MAKES IT LOAD-BEARING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The PRD gives the review to the Área de Innovación alone — "el Área de
 * Innovación puede revisar cada sugerencia y cambiar su estado" — and never to
 * the author. Nothing in this handler asks whose suggestion it is, because the
 * answer would not change the decision: an administrator reviews every
 * suggestion, including their own, and a collaborator reviews none, including
 * their own.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A SUB-RESOURCE, NOT A FIELD OF `PATCH /api/sugerencias/{id}`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0003 names this exact path, and the shape is what makes the endpoint safe
 * to describe: `/estado` accepts one field and there is no route at
 * `/api/sugerencias/{id}` at all. A general item PATCH would have to refuse
 * `titulo` and `descripcion` in its schema and keep refusing them for every
 * future editor — where here, the words a collaborator wrote are not addressable
 * by any endpoint the portal exposes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS ROUTE DELIBERATELY DOES NOT DO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It sends no mail. Item #14's notification exists so the Área de Innovación
 * hears about a suggestion it did not know about; a state change is made BY that
 * area, so mailing them their own click would be noise. The author learns the new
 * state from their own screen, which revalidates on focus and every minute
 * (ADR 0007) — and the PRD asks for the state to be "visible para todos", not
 * pushed to them.
 *
 * It records no `evento_uso`. That table's vocabulary is closed by a CHECK over
 * `apertura`, `ejecucion` and the five typed processing errors, and a review is
 * none of those. Item #19's "sugerencias por estado y área" is an aggregate over
 * `sugerencia` itself (ADR 0010), and the ledger already holds the timeline.
 */

export const dynamic = "force-dynamic";

/** Next 16 hands dynamic route params to the handler as a promise. */
interface Contexto {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Contexto): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const id = idSugerenciaSchema.safeParse((await params).id);
  if (!id.success) {
    return failureResponse(identificadorInvalido());
  }

  /*
   * A body that is not JSON becomes `undefined`, which the schema then rejects as
   * a whole-body problem — a 400 the caller can fix, where an uncaught
   * `SyntaxError` would have been a 500 blaming the server for a malformed
   * request.
   */
  const cuerpo = await request.json().catch(() => undefined);
  const cambio = cambiarEstadoSchema.safeParse(cuerpo);

  if (!cambio.success) {
    return failureResponse(estadoInvalido());
  }

  try {
    /*
     * `acceso.usuario.id` signs the asiento, never a field of the body. The
     * parsed output does not even carry a `cambiadoPor` key for a client to try —
     * an immutable ledger whose author column can be filled in by the caller is
     * not an audit trail.
     */
    const sugerencia = await cambiarEstadoSugerencia(
      prisma,
      id.data,
      cambio.data.estado,
      acceso.usuario.id,
    );

    return NextResponse.json({ sugerencia });
  } catch (error) {
    /* The detail stays in the server log; the browser gets a code and a sentence. */
    console.error("PATCH /api/sugerencias/[id]/estado", error);
    return failureResponse(errorDeTransicion(error));
  }
}
