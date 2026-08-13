import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRouteAdmin } from "@/lib/authz";
import { errorDePrisma, errorDeValidacion, identificadorInvalido } from "@/lib/enlaces/errors";
import { actualizarEnlace, darDeBajaEnlace } from "@/lib/enlaces/repository";
import { actualizarEnlaceSchema, idEnlaceSchema } from "@/lib/enlaces/schema";
import { prisma } from "@/lib/prisma";

/**
 * One enlace — ADR 0003's `/api/enlaces`, item half.
 *
 *   PATCH  /api/enlaces/{id}  → 200 { enlace: EnlaceDTO }
 *   DELETE /api/enlaces/{id}  → 200 { enlace: EnlaceDTO }
 *
 * WHY PATCH AND NOT PUT. The administration form edits what changed and sends
 * that; PUT means "replace the resource with this representation", which would
 * make every omitted field a blanking instruction. PATCH matches both the form
 * and the schema, where every field is optional.
 *
 * WHY DELETE FOR A ROW THAT SURVIVES. "Baja" is a logical delete: the row stays
 * and `activo` becomes false. DELETE is still the honest verb for it, because
 * the verb describes what happens to the RESOURCE the client addressed — the
 * enlace leaves the catalogue, stops being reachable by any collaborator, and
 * disappears from every dashboard. That the row remains is a storage decision
 * the client neither sees nor depends on, and it is not optional: the grants in
 * `asignacion_enlace`, the analytics events of ADR 0010 that reference this id
 * with no foreign key, and the authorization guard that already reads
 * `activo = false` as "no access" all require the row to exist.
 *
 * The response body is the deactivated row rather than an empty 204, so the
 * client can render the new state — DESIGN.md asks every administrative action
 * to confirm and apply immediately — without a second round trip to find out
 * what it now looks like.
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

  const id = idEnlaceSchema.safeParse((await params).id);
  if (!id.success) {
    return failureResponse(identificadorInvalido());
  }

  const cuerpo = await request.json().catch(() => undefined);
  const cambios = actualizarEnlaceSchema.safeParse(cuerpo);

  if (!cambios.success) {
    return failureResponse(errorDeValidacion(cambios.error));
  }

  try {
    return NextResponse.json({ enlace: await actualizarEnlace(prisma, id.data, cambios.data) });
  } catch (error) {
    console.error("PATCH /api/enlaces/[id]", error);
    return failureResponse(errorDePrisma(error));
  }
}

/**
 * The baja.
 *
 * It takes no body — the id in the path is the whole request — so the `request`
 * argument Next passes is accepted and deliberately unused.
 */
export async function DELETE(_request: Request, { params }: Contexto): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const id = idEnlaceSchema.safeParse((await params).id);
  if (!id.success) {
    return failureResponse(identificadorInvalido());
  }

  try {
    return NextResponse.json({ enlace: await darDeBajaEnlace(prisma, id.data) });
  } catch (error) {
    console.error("DELETE /api/enlaces/[id]", error);
    return failureResponse(errorDePrisma(error));
  }
}
