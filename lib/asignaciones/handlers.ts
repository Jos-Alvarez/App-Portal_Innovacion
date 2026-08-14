import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import {
  ERROR_INTERNO,
  type RecursoTipo,
  errorDePrisma,
  identificadorDeRecursoInvalido,
  identificadorDeUsuarioInvalido,
  recursoDadoDeBaja,
  recursoNoEncontrado,
  usuarioDadoDeBaja,
  usuarioNoEncontrado,
} from "@/lib/asignaciones/errors";
import {
  asignarRecurso,
  leerRecursoAsignable,
  leerUsuarioAsignable,
  revocarRecurso,
} from "@/lib/asignaciones/repository";
import { idRutaSchema } from "@/lib/asignaciones/schema";
import { guardRouteAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/**
 * The behaviour behind all four assignment endpoints — ADR 0003's
 * `/api/usuarios/{id}/asignaciones`.
 *
 *   PUT    .../asignaciones/enlaces/{enlaceId}          → 200 { asignacion }
 *   DELETE .../asignaciones/enlaces/{enlaceId}          → 200 { asignacion }
 *   PUT    .../asignaciones/procesadores/{procesadorId} → 200 { asignacion }
 *   DELETE .../asignaciones/procesadores/{procesadorId} → 200 { asignacion }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE LOGIC LIVES HERE AND NOT IN THE FOUR route.ts FILES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The two resource types differ in exactly one thing — which table the row goes
 * into — so writing the same handler twice with a word swapped would mean every
 * future rule about assignments had two places to be changed and one place to
 * be forgotten. `tipo` is that one difference, passed in.
 *
 * What is deliberately NOT abstracted away is which table a request lands in.
 * Each route file names its type as a literal, next to the URL segment it
 * serves, and `repository.ts` branches on it with both table names spelled out.
 * An administrator debugging why a colleague can reach the wrong catalogue can
 * follow that from the URL to the SQL without resolving anything.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY PUT AND DELETE, AND WHY BOTH ANSWER 200 EVERY TIME
 * ══════════════════════════════════════════════════════════════════════════
 *
 * An assignment row has no columns beyond its composite key: THE ROW IS THE
 * GRANT. There is no state to patch and no body to send, so the request is
 * entirely expressed by its URL and its verb — which is exactly what PUT and
 * DELETE are for, and both are idempotent by definition of the method.
 *
 * That definition is the requirement, not a bonus. The screen this serves is a
 * row of switches; a switch gets double-clicked, and two administrators
 * arranging the same rota will collide. Answering 409 to the second grant, or
 * 404 to the second revoke, would report a failure in front of a database that
 * is in precisely the state the caller asked for — and would invite whoever saw
 * the red toast to "fix" a change that had worked. So a repeat is a 200 with a
 * byte-identical body, and never a 201: a status that varies between the first
 * call and the second is a status a client will eventually branch on.
 *
 * The inverted Prisma mapping that makes this possible is in `errors.ts`. Read
 * the warning there before copying anything from `lib/enlaces/errors.ts` or
 * `lib/procesadores/errors.ts`.
 */

/** The body both verbs answer with: the grant, as it now stands. */
function respuesta(
  tipo: RecursoTipo,
  usuarioId: number,
  recursoId: number,
  asignado: boolean,
): NextResponse {
  return NextResponse.json({ asignacion: { usuarioId, tipo, recursoId, asignado } });
}

/** Both identifiers parsed, or the failure that says which one is unusable. */
function leerIdentificadores(tipo: RecursoTipo, usuarioIdCrudo: string, recursoIdCrudo: string) {
  const usuarioId = idRutaSchema.safeParse(usuarioIdCrudo);
  if (!usuarioId.success) {
    return { ok: false as const, fallo: identificadorDeUsuarioInvalido() };
  }

  const recursoId = idRutaSchema.safeParse(recursoIdCrudo);
  if (!recursoId.success) {
    return { ok: false as const, fallo: identificadorDeRecursoInvalido(tipo) };
  }

  return { ok: true as const, usuarioId: usuarioId.data, recursoId: recursoId.data };
}

/**
 * Both rows, read before either verb writes anything.
 *
 * `exigirActivos` is the whole asymmetry of the baja, in one flag:
 *
 *   · GRANTING requires both ends to be active. A grant over a deactivated
 *     resource is a row the authorization guard will refuse to honour anyway —
 *     it already denies a grant whose resource has `activo = false` — so
 *     writing one creates a record that can do nothing except mislead the next
 *     person who reads the assignment screen. Part 2 will dim such a resource
 *     in the picker, but a dimmed switch is a suggestion; this is the
 *     restriction. The same reasoning applies unchanged to an inactive account,
 *     which the guard denies just as flatly, so both ends are refused for
 *     symmetry rather than one being singled out.
 *
 *   · REVOKING requires neither. Removing a grant left over from before a
 *     resource was taken down is exactly the clean-up the picker exists to
 *     allow, and refusing it would strand rows that nobody could ever remove.
 *     The same for an account that has left: its old grants must still be
 *     tidied.
 *
 * Existence, on the other hand, is required by BOTH verbs. "Already revoked"
 * means a grant that is gone between a user and a resource that both exist; a
 * request naming a user who never existed is stale or malformed, and answering
 * "done" to it would hide a real bug behind a green toast.
 */
async function comprobarExtremos(
  tipo: RecursoTipo,
  usuarioId: number,
  recursoId: number,
  { exigirActivos }: { exigirActivos: boolean },
) {
  const usuario = await leerUsuarioAsignable(prisma, usuarioId);

  if (usuario === null) {
    return usuarioNoEncontrado();
  }

  if (exigirActivos && !usuario.activo) {
    return usuarioDadoDeBaja();
  }

  const recurso = await leerRecursoAsignable(prisma, tipo, recursoId);

  if (recurso === null) {
    return recursoNoEncontrado(tipo);
  }

  if (exigirActivos && !recurso.activo) {
    return recursoDadoDeBaja(tipo);
  }

  return null;
}

/** `PUT .../asignaciones/{enlaces|procesadores}/{recursoId}`. */
export async function asignarRecursoAUsuario(
  tipo: RecursoTipo,
  usuarioIdCrudo: string,
  recursoIdCrudo: string,
): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const ids = leerIdentificadores(tipo, usuarioIdCrudo, recursoIdCrudo);
  if (!ids.ok) {
    return failureResponse(ids.fallo);
  }

  let impedimento;

  try {
    impedimento = await comprobarExtremos(tipo, ids.usuarioId, ids.recursoId, {
      exigirActivos: true,
    });
  } catch (error) {
    /*
     * A grant whose preconditions could not be checked is not written. Falling
     * through to the insert would be the one request that quietly creates the
     * row over a resource dado de baja that this check exists to prevent.
     */
    console.error(`PUT /api/usuarios/[usuarioId]/asignaciones/${tipo}`, error);
    return failureResponse(ERROR_INTERNO);
  }

  if (impedimento !== null) {
    return failureResponse(impedimento);
  }

  try {
    await asignarRecurso(prisma, tipo, ids.usuarioId, ids.recursoId);
  } catch (error) {
    console.error(`PUT /api/usuarios/[usuarioId]/asignaciones/${tipo}`, error);
    return failureResponse(errorDePrisma(error, tipo));
  }

  return respuesta(tipo, ids.usuarioId, ids.recursoId, true);
}

/** `DELETE .../asignaciones/{enlaces|procesadores}/{recursoId}`. */
export async function revocarRecursoDeUsuario(
  tipo: RecursoTipo,
  usuarioIdCrudo: string,
  recursoIdCrudo: string,
): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const ids = leerIdentificadores(tipo, usuarioIdCrudo, recursoIdCrudo);
  if (!ids.ok) {
    return failureResponse(ids.fallo);
  }

  let impedimento;

  try {
    /* `exigirActivos: false` — a baja at either end must stay revocable. */
    impedimento = await comprobarExtremos(tipo, ids.usuarioId, ids.recursoId, {
      exigirActivos: false,
    });
  } catch (error) {
    console.error(`DELETE /api/usuarios/[usuarioId]/asignaciones/${tipo}`, error);
    return failureResponse(ERROR_INTERNO);
  }

  if (impedimento !== null) {
    return failureResponse(impedimento);
  }

  try {
    await revocarRecurso(prisma, tipo, ids.usuarioId, ids.recursoId);
  } catch (error) {
    console.error(`DELETE /api/usuarios/[usuarioId]/asignaciones/${tipo}`, error);
    return failureResponse(errorDePrisma(error, tipo));
  }

  return respuesta(tipo, ids.usuarioId, ids.recursoId, false);
}
