import type { NextResponse } from "next/server";

import { asignarRecursoAUsuario, revocarRecursoDeUsuario } from "@/lib/asignaciones/handlers";

/**
 * A user's grant over one procesador — ADR 0003's
 * `/api/usuarios/{id}/asignaciones`.
 *
 *   PUT    /api/usuarios/{usuarioId}/asignaciones/procesadores/{procesadorId}
 *   DELETE /api/usuarios/{usuarioId}/asignaciones/procesadores/{procesadorId}
 *
 * The sibling of the enlaces route, and just as thin. The two files differ in
 * one literal — `"procesador"` instead of `"enlace"` — because ADR 0002 splits
 * the grants into two tables with no shared parent, so the URL segment and the
 * table it reaches are named together, in view of each other.
 *
 * The behaviour is in `lib/asignaciones/handlers.ts`, shared with the enlaces
 * route. Read it there; there is nothing procesador-specific about any of it.
 */

export const dynamic = "force-dynamic";

/** Next 16 hands dynamic route params to the handler as a promise. */
interface Contexto {
  params: Promise<{ usuarioId: string; procesadorId: string }>;
}

/**
 * The grant. Idempotent: granting a procesador the user already has answers the
 * same 200 as granting it for the first time. No body — the identifiers in the
 * path are the whole request — so `request` is accepted and unused.
 */
export async function PUT(_request: Request, { params }: Contexto): Promise<NextResponse> {
  const { usuarioId, procesadorId } = await params;

  return asignarRecursoAUsuario("procesador", usuarioId, procesadorId);
}

/** The revocation. Idempotent in the same way, and a hard delete. */
export async function DELETE(_request: Request, { params }: Contexto): Promise<NextResponse> {
  const { usuarioId, procesadorId } = await params;

  return revocarRecursoDeUsuario("procesador", usuarioId, procesadorId);
}
