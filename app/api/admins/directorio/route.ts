import { NextResponse } from "next/server";

import { buscarPersonas } from "@/lib/admins/busqueda";
import { buscarEnDirectorio } from "@/lib/admins/directorio";
import { readDirectorioEnv } from "@/lib/admins/directorio-env";
import { ERROR_INTERNO, terminoInvalido } from "@/lib/admins/errors";
import { buscarUsuariosDelPortal, leerUsuariosPorCorreos } from "@/lib/admins/repository";
import { terminoBusquedaSchema } from "@/lib/admins/schema";
import { failureResponse } from "@/lib/api/errors";
import { normalizeEmail } from "@/lib/auth/identity";
import { guardRouteAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/**
 * La búsqueda de personas — the read half of item #17.
 *
 *   GET /api/admins/directorio?q=... → 200 { origen, personas }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS ONE IS AN ENDPOINT WHEN THE ADMIN LIST IS NOT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every admin screen in this portal reads its own rows in the Server Component
 * and refreshes them with `router.refresh()`, and this one is no different — the
 * list of administrators never travels over `/api`. But a SEARCH is not the
 * screen's initial state: it happens because somebody typed, it happens many
 * times per visit, and re-rendering the whole page for each term would throw
 * away the term itself. So the search is the browser's own request, and it is
 * the only one this family exposes for reading.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE WIRING IS HERE AND THE DECISION IS NOT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `buscarPersonas` owns the degradation of ADR 0009 and takes its three reads as
 * parameters. This file is where they are bound to Microsoft Graph and to
 * Prisma, and it is the only file that knows both exist. `readDirectorioEnv()`
 * is called INSIDE the closure on purpose: it throws when the Entra ID
 * credentials are not usable, and that throw has to land where every other
 * directory failure lands — in the fallback — instead of failing the request.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const termino = terminoBusquedaSchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!termino.success) {
    return failureResponse(terminoInvalido());
  }

  try {
    const resultado = await buscarPersonas(termino.data, {
      buscarEnDirectorio: (valor) => buscarEnDirectorio(valor, { env: readDirectorioEnv() }),
      leerPortalPorCorreos: (correos) => leerUsuariosPorCorreos(prisma, correos),
      buscarEnPortal: (valor) => buscarUsuariosDelPortal(prisma, valor),
      /*
       * Read here rather than through `readAuthEnv()`: that accessor throws when
       * any of the five authentication variables is missing, and a search must
       * not fail because of a variable it does not use. An empty domain widens
       * the results and changes nothing about who can actually be promoted —
       * `POST /api/admins` applies the rule and fails closed.
       */
      dominioCorporativo: normalizeEmail(process.env.ALLOWED_EMAIL_DOMAIN).replace(/^@/, ""),
    });

    return NextResponse.json(resultado);
  } catch (error) {
    /*
     * Only the database can get here: the directory's failures are already the
     * degraded answer. With `usuario` unreadable there is nothing left to fall
     * back to, so this really is a 500.
     */
    console.error("GET /api/admins/directorio", error);
    return failureResponse(ERROR_INTERNO);
  }
}
