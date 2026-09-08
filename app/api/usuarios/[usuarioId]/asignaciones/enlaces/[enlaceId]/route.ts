import type { NextResponse } from "next/server";

import { asignarRecursoAUsuario, revocarRecursoDeUsuario } from "@/lib/asignaciones/handlers";

/**
 * A user's grant over one enlace — ADR 0003's `/api/usuarios/{id}/asignaciones`.
 *
 *   PUT    /api/usuarios/{usuarioId}/asignaciones/enlaces/{enlaceId}
 *   DELETE /api/usuarios/{usuarioId}/asignaciones/enlaces/{enlaceId}
 *
 * There is nothing here but Next's plumbing, and that is on purpose. Every rule
 * an assignment obeys lives in `lib/asignaciones/handlers.ts`, written once and
 * shared with the procesadores sibling, so a rule added later cannot be applied
 * to one resource type and forgotten on the other.
 *
 * The one thing this file decides is the literal `"enlace"` below, sitting next
 * to the `enlaces` URL segment it serves. That is what makes it readable from
 * the URL which table a request lands in — `repository.ts` spells the rest out.
 *
 * There is no GET. The administration screen of part 2 is a Server Component
 * that reads the repository directly, exactly as `app/admin/catalogo/page.tsx`
 * does, so an endpoint returning the same data would be a second way to be
 * right about it.
 */

export const dynamic = "force-dynamic";

/** Next 16 hands dynamic route params to the handler as a promise. */
interface Contexto {
  params: Promise<{ usuarioId: string; enlaceId: string }>;
}

/**
 * The grant. Idempotent: granting an enlace the user already has answers the
 * same 200 as granting it for the first time.
 *
 * The request carries no body — the two identifiers in the path are the whole
 * request — so the `request` argument Next passes is accepted and unused.
 */
export async function PUT(_request: Request, { params }: Contexto): Promise<NextResponse> {
  const { usuarioId, enlaceId } = await params;

  return asignarRecursoAUsuario("enlace", usuarioId, enlaceId);
}

/**
 * The revocation. Idempotent in the same way, and a HARD delete: an assignment
 * row has no `activo` to flip and nothing to preserve (see `repository.ts`).
 */
export async function DELETE(_request: Request, { params }: Contexto): Promise<NextResponse> {
  const { usuarioId, enlaceId } = await params;

  return revocarRecursoDeUsuario("enlace", usuarioId, enlaceId);
}
