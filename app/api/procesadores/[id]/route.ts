import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRouteAdmin } from "@/lib/authz";
import {
  ERROR_INTERNO,
  errorDePrisma,
  errorDeValidacion,
  identificadorInvalido,
  procesadorNoEncontrado,
} from "@/lib/procesadores/errors";
import {
  actualizarProcesador,
  darDeBajaProcesador,
  leerContratoProcesador,
} from "@/lib/procesadores/repository";
import {
  actualizarProcesadorSchema,
  afectaAlContrato,
  contratoProcesadorSchema,
  fusionarContrato,
  idProcesadorSchema,
} from "@/lib/procesadores/schema";
import { prisma } from "@/lib/prisma";

/**
 * One procesador — ADR 0003's `/api/procesadores`, item half.
 *
 *   PATCH  /api/procesadores/{id}  → 200 { procesador: ProcesadorDTO }
 *   DELETE /api/procesadores/{id}  → 200 { procesador: ProcesadorDTO }
 *
 * WHY PATCH AND NOT PUT, and WHY DELETE FOR A ROW THAT SURVIVES: the same
 * answers as `/api/enlaces/{id}`. The form edits what changed; the baja is a
 * logical delete because `asignacion_procesador`, the analytics events of
 * ADR 0010 and the authorization guard all require the row to exist, and
 * DELETE is still the honest verb because the procesador does leave the
 * catalogue. The body is the row as it now stands rather than an empty 204, so
 * the screen can render the new state without a second round trip.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS HANDLER READS THE ROW BEFORE IT WRITES IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Four columns of a `procesador` declare the shape of an execution, and
 * ADR 0002 makes the ROW the single source of truth for it. Two of the rules
 * that keep that shape coherent are about a relation between fields —
 * `entradas_max` may not sit below `entradas_min`, `tamano_max_total` may not
 * sit below `tamano_max` — and a PATCH does not carry a row. It carries a
 * fragment.
 *
 * Validating the fragment is wrong in BOTH directions at once:
 *
 *   · It rejects legitimate edits. `{ entradas_max: 3 }` has no minimum to
 *     compare against, and it is exactly the right edit for a row whose
 *     minimum is 1.
 *   · It lets the incoherent row through anyway. `{ entradas_min: 5 }` passes,
 *     then `{ entradas_max: 3 }` passes, and the row now says an execution
 *     needs at least five files and admits at most three — a procesador nobody
 *     can ever run, which the upload screen will faithfully render.
 *
 * So the handler reads the four stored columns, merges the change on top and
 * validates the RESULT. Whoever finds this and wants to simplify it back into
 * `actualizarProcesadorSchema`: that is the bug above, not a simplification.
 *
 * The read is skipped when the edit moves none of the four (`afectaAlContrato`)
 * — the stored row was validated as a whole when it was written, so a change to
 * the name or the description cannot disturb it, and the query would be paid
 * for nothing.
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

  const id = idProcesadorSchema.safeParse((await params).id);
  if (!id.success) {
    return failureResponse(identificadorInvalido());
  }

  const cuerpo = await request.json().catch(() => undefined);
  const cambios = actualizarProcesadorSchema.safeParse(cuerpo);

  if (!cambios.success) {
    return failureResponse(errorDeValidacion(cambios.error));
  }

  if (afectaAlContrato(cambios.data)) {
    let contrato;

    try {
      contrato = await leerContratoProcesador(prisma, id.data);
    } catch (error) {
      /*
       * A contract change that could not be validated is not written. Falling
       * through to the update instead would store exactly the incoherent row
       * this whole read exists to prevent, and it would do it on the one
       * request where nobody was watching.
       */
      console.error("PATCH /api/procesadores/[id] — lectura del contrato", error);
      return failureResponse(ERROR_INTERNO);
    }

    /* No row to merge into: the same 404 any other unknown id gets. */
    if (contrato === null) {
      return failureResponse(procesadorNoEncontrado());
    }

    const fusionado = contratoProcesadorSchema.safeParse(fusionarContrato(contrato, cambios.data));

    if (!fusionado.success) {
      return failureResponse(errorDeValidacion(fusionado.error));
    }
  }

  try {
    return NextResponse.json({ procesador: await actualizarProcesador(prisma, id.data, cambios.data) });
  } catch (error) {
    console.error("PATCH /api/procesadores/[id]", error);
    return failureResponse(errorDePrisma(error));
  }
}

/**
 * The baja.
 *
 * It takes no body — the id in the path is the whole request — so the `request`
 * argument Next passes is accepted and deliberately unused. No contract read
 * either: deactivating a row does not change the shape it declares.
 */
export async function DELETE(_request: Request, { params }: Contexto): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const id = idProcesadorSchema.safeParse((await params).id);
  if (!id.success) {
    return failureResponse(identificadorInvalido());
  }

  try {
    return NextResponse.json({ procesador: await darDeBajaProcesador(prisma, id.data) });
  } catch (error) {
    console.error("DELETE /api/procesadores/[id]", error);
    return failureResponse(errorDePrisma(error));
  }
}
