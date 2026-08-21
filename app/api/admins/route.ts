import { NextResponse } from "next/server";

import { buscarEnDirectorio } from "@/lib/admins/directorio";
import { readDirectorioEnv } from "@/lib/admins/directorio-env";
import {
  correoInvalido,
  directorioNoDisponible,
  dominioNoCorporativo,
  errorDeRol,
  personaNoEncontrada,
} from "@/lib/admins/errors";
import {
  type PersonaAPromover,
  leerUsuarioPorCorreo,
  promoverAAdministrador,
} from "@/lib/admins/repository";
import { promoverSchema } from "@/lib/admins/schema";
import { type ApiFailure, failureResponse } from "@/lib/api/errors";
import { isEmailFromAllowedDomain } from "@/lib/auth/identity";
import { guardRouteAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/**
 * La promoción — ADR 0003's `/api/admins`, and the write that grants the role.
 *
 *   POST /api/admins → 200 { administrador: AdministradorDTO }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BODY CARRIES AN ADDRESS, AND THE SERVER RESOLVES THE PERSON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `schema.ts` explains why the name and the area are not in the body. Here is
 * what the server does instead, in order:
 *
 *   1. The address must be corporate. The check is the SAME function the
 *      sign-in applies, and it fails closed — an unset `ALLOWED_EMAIL_DOMAIN`
 *      promotes nobody, which is the direction a missing rule must always fail
 *      in. Without this, a promotion could write a `usuario` row holding the
 *      administrator role under an address that the login itself would reject.
 *
 *   2. If the person has signed in before, THEIR OWN ROW is the identity. Their
 *      name and area were written by their last login from Entra ID, and a
 *      directory search cannot improve on that.
 *
 *   3. Only otherwise is the directory asked, for that exact address. This is
 *      the case the PRD's "buscar en el directorio de la empresa" exists for:
 *      the person has never opened the portal and has no row yet, so ADR 0009's
 *      upsert needs a name and an area to write.
 *
 *   4. If the directory cannot be reached AND there is no row, the promotion is
 *      refused with the one sentence that names a fix — ask that person to sign
 *      in once. This is the write-side face of ADR 0009's degradation: without
 *      Graph the portal can still promote anybody it already knows, and it will
 *      not invent an identity for somebody it does not.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS ROUTE DELIBERATELY DOES NOT DO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It writes no ledger row and sends no mail. `historial_sugerencia` is the
 * ledger of one specific funnel (ADR 0002) and has no vocabulary for a role, and
 * `evento_uso` is closed by a CHECK over `apertura`, `ejecucion` and the five
 * typed processing errors. An audit trail for role changes would be a new table
 * and a new decision; no document asks for one, and inventing it here would put
 * a schema change inside a feature that needs no migration.
 *
 * It does not sign the promoted person out or in. ADR 0007 makes that
 * unnecessary: the role is re-read from SQL Server on every request, so the
 * person promoted while they are working gets the administrator's screens on
 * their very next request — "a más tardar en su siguiente ingreso", as the PRD
 * puts it, and in practice sooner.
 */

export const dynamic = "force-dynamic";

/**
 * The identity to write, or the failure that says why there is none.
 *
 * Kept apart from the handler because it is the whole of step 2–4 above, and
 * because it is the one part of this route that can talk to Microsoft Graph.
 */
async function resolverPersona(
  correo: string,
): Promise<{ ok: true; persona: PersonaAPromover } | { ok: false; fallo: ApiFailure }> {
  const existente = await leerUsuarioPorCorreo(prisma, correo);

  if (existente !== null) {
    return {
      ok: true,
      persona: { correo, nombre: existente.nombre, area: existente.area },
    };
  }

  let enDirectorio;

  try {
    enDirectorio = await buscarEnDirectorio(correo, { env: readDirectorioEnv() });
  } catch (error) {
    console.warn("POST /api/admins — el directorio no pudo consultarse", error);
    return { ok: false, fallo: directorioNoDisponible() };
  }

  /*
   * An exact match and not the first result. The filter is a `startswith`, so
   * searching for `ana@corp.com` can legitimately return `ana@corp.com.pe` — and
   * promoting the wrong person because their address happens to share a prefix
   * is not a mistake anybody would find by reading the screen afterwards.
   */
  const persona = enDirectorio.find((candidata) => candidata.correo === correo);

  return persona === undefined
    ? { ok: false, fallo: personaNoEncontrada() }
    : { ok: true, persona };
}

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
  const promocion = promoverSchema.safeParse(cuerpo);

  if (!promocion.success) {
    return failureResponse(correoInvalido());
  }

  const { correo } = promocion.data;

  if (!isEmailFromAllowedDomain(correo, process.env.ALLOWED_EMAIL_DOMAIN)) {
    return failureResponse(dominioNoCorporativo());
  }

  try {
    const resuelta = await resolverPersona(correo);

    if (!resuelta.ok) {
      return failureResponse(resuelta.fallo);
    }

    const administrador = await promoverAAdministrador(prisma, resuelta.persona);

    return NextResponse.json({ administrador });
  } catch (error) {
    /* The detail stays in the server log; the browser gets a code and a sentence. */
    console.error("POST /api/admins", error);
    return failureResponse(errorDeRol(error));
  }
}
