import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRouteAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { ERROR_INTERNO_LISTADO } from "@/lib/sugerencias/errors";
import { listarSugerencias } from "@/lib/sugerencias/repository";

/**
 * El listado completo de sugerencias — item #15, the read half.
 *
 *   GET /api/sugerencias/todas → 200 { sugerencias: SugerenciaAdminDTO[] }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A ROUTE OF ITS OWN, WHICH IS THE WHOLE POINT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `GET /api/sugerencias` answers "mine" for everyone, administrators included,
 * and its handler says at length why that must not become conditional: "a scope
 * that silently widens for some readers is a scope that will one day widen for
 * the wrong one, and the symptom is a collaborator's screen quietly showing
 * other people's ideas with no error anywhere."
 *
 * So the widened read is a different path, a different guard, a different
 * repository function and a different DTO. There is no flag, no query parameter
 * and no `esAdmin` branch anywhere on the collaborator's path — the two answers
 * are reached by typing two different URLs, and only one of them gets past
 * `guardRouteAdmin`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY `/todas` UNDER THE RESOURCE AND NOT `/api/admin/sugerencias`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0003 lists the portal's administrative endpoints as `/api/enlaces`,
 * `/api/procesadores`, `/api/usuarios/{id}/asignaciones`, `/api/admins` — the
 * resource first, never an `admin` prefix. The prefix exists on SCREENS
 * (`/admin/enlaces`) because a person reads the address bar; it does not exist on
 * the API, and inventing it here for one route would leave the portal with two
 * conventions and no rule for choosing between them.
 *
 * The static segment sits beside the `[id]` one below it. Next resolves a literal
 * path before a dynamic one, so `/todas` can never be read as a suggestion whose
 * id is "todas" — and `idSugerenciaSchema` would refuse that string anyway.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  try {
    return NextResponse.json({ sugerencias: await listarSugerencias(prisma) });
  } catch (error) {
    console.error("GET /api/sugerencias/todas", error);
    return failureResponse(ERROR_INTERNO_LISTADO);
  }
}
