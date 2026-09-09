import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { buscarPersonas } from "@/lib/admins/busqueda";
import { buscarEnDirectorio } from "@/lib/admins/directorio";
import { readDirectorioEnv } from "@/lib/admins/directorio-env";
import { buscarUsuariosDelPortal, leerUsuariosPorCorreos } from "@/lib/admins/repository";
import { isEmailFromAllowedDomain, normalizeEmail } from "@/lib/auth/identity";
import { guardRouteAdmin } from "@/lib/authz";
import {
  ERROR_INTERNO,
  correoInvalido,
  dominioNoCorporativo,
  terminoInvalido,
} from "@/lib/personas/errors";
import { registrarPersonaSchema, terminoSchema } from "@/lib/personas/schema";
import { prisma } from "@/lib/prisma";
import { registrarUsuario } from "@/lib/usuarios/repository";

/**
 * Las personas del portal — what the catalogue's "Asignar" dialog searches and
 * pre-registers.
 *
 *   GET  /api/personas?q=...  → 200 { origen, personas }
 *   POST /api/personas        → 200 { usuario }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS NOT `/api/admins/directorio`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * That endpoint answers "who could become an administrator". This one answers
 * "who could receive an access". The two are unrelated products of the portal —
 * the admin role opens the panel, an assignment opens one enlace — and a screen
 * about assignments calling a URL named after the other would misdescribe
 * itself to whoever reads it next.
 *
 * WHAT THEY DO SHARE IS THE SEARCH ITSELF, and that sharing is deliberate.
 * `buscarPersonas` owns the degradation of ADR 0009: it asks Microsoft Graph
 * and, when Graph cannot be reached — most often because TI never consented to
 * `User.Read.All` — falls back to the people who have already signed in, and
 * REPORTS WHICH in `origen`. That is one decision about one external
 * dependency; two copies of it would eventually disagree about whether the
 * company directory is available, and the reader would be told two stories.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A POST EXISTS AT ALL, WHEN THE SIGN-IN OWNS `usuario`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0009 gives the `usuario` row one writer: the login. The cost of that rule
 * is that a colleague cannot be given their accesses until after their first
 * visit — so their first visit shows them an empty portal, which is the exact
 * moment the portal has to prove it is worth using. This endpoint creates the
 * row ahead of time so the accesses are already there, and `registrarUsuario`
 * explains why the login then finds that row instead of duplicating it.
 *
 * IT GRANTS NOTHING. It creates an account and stops; the grant is a separate
 * PUT to `/api/usuarios/{id}/asignaciones/...`, which is the one place a grant
 * has ever been written. Two round trips, and each endpoint still does one
 * thing.
 */

export const dynamic = "force-dynamic";

/**
 * The corporate domain, read per request.
 *
 * Not through `readAuthEnv()`: that accessor throws when any of the five
 * authentication variables is missing, and neither of these handlers uses the
 * other four. An unset value reads as `""`, which widens the SEARCH and — see
 * `POST` — refuses every pre-registration, which is the safe direction for each.
 */
function dominioCorporativo(): string {
  return normalizeEmail(process.env.ALLOWED_EMAIL_DOMAIN).replace(/^@/, "");
}

export async function GET(request: Request): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const termino = terminoSchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!termino.success) {
    return failureResponse(terminoInvalido());
  }

  try {
    /*
     * `readDirectorioEnv()` is called INSIDE the closure on purpose: it throws
     * when the Entra ID credentials are not usable, and that throw has to land
     * where every other directory failure lands — in `buscarPersonas`' fallback
     * — instead of failing the request.
     */
    const resultado = await buscarPersonas(termino.data, {
      buscarEnDirectorio: (valor) => buscarEnDirectorio(valor, { env: readDirectorioEnv() }),
      leerPortalPorCorreos: (correos) => leerUsuariosPorCorreos(prisma, correos),
      buscarEnPortal: (valor) => buscarUsuariosDelPortal(prisma, valor),
      dominioCorporativo: dominioCorporativo(),
    });

    return NextResponse.json(resultado);
  } catch (error) {
    /* Only the database can get here: the directory's failures are already the
       degraded answer. With `usuario` unreadable there is nothing to fall back
       to, so this really is a 500. */
    console.error("GET /api/personas", error);
    return failureResponse(ERROR_INTERNO);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const cuerpo = registrarPersonaSchema.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) {
    return failureResponse(correoInvalido());
  }

  /*
   * FAILS CLOSED, unlike the search. The search may show a person the domain
   * filter would have hidden — at worst the next click refuses them with a
   * sentence. A WRITE may not: a row for an address that can never sign in is a
   * person in every list, holding grants, who will never arrive to use them.
   */
  if (!isEmailFromAllowedDomain(cuerpo.data.correo, dominioCorporativo())) {
    return failureResponse(dominioNoCorporativo());
  }

  try {
    const usuario = await registrarUsuario(prisma, {
      correo: cuerpo.data.correo,
      /* The same fallback the login applies when Entra ID reports no name. */
      nombre: cuerpo.data.nombre?.trim() || cuerpo.data.correo,
      area: cuerpo.data.area?.trim() ?? "",
    });

    return NextResponse.json({ usuario });
  } catch (error) {
    console.error("POST /api/personas", error);
    return failureResponse(ERROR_INTERNO);
  }
}
