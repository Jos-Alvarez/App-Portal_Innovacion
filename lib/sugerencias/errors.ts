import type { ZodError, ZodIssue } from "zod";

import { type ApiFailure, apiFailure } from "@/lib/api/errors";

import { AREA_DESTINO_MAX, DESCRIPCION_MAX, TITULO_MAX } from "@/lib/sugerencias/schema";

/**
 * Every way a request about a `sugerencia` can fail, expressed as the one
 * envelope of ADR 0003.
 *
 * Pure functions over data — they build an `ApiFailure`, not a `Response` — so
 * the whole mapping is unit-testable without a request, a database or a server.
 * The two rules `lib/enlaces/errors.ts` states apply here unchanged: the
 * messages are Spanish the reader can act on, and nothing the database or a
 * validation library said is ever forwarded.
 *
 * ONE DIFFERENCE FROM THE CATALOGUE'S MAPPING IS WORTH NAMING. The person
 * reading these sentences is not an administrator who knows the portal's
 * internals; it is any collaborator in the company, writing an idea. So the
 * copy never mentions a column, a limit expressed as a constraint, or an
 * action they cannot take — it says what to change about what they wrote.
 */

/**
 * One entry per field the client can send. Keyed on the field rather than on
 * zod's issue code, exactly as the catalogue's mapping is: "missing", "empty
 * after trimming" and "longer than allowed" are one problem to the person
 * filling the form — this field is wrong — and collapsing them keeps the copy
 * short while guaranteeing no zod string can leak by being passed through.
 *
 * The numbers are interpolated from the schema's own constants so the sentence
 * and the rule can never drift apart.
 */
const MENSAJES_POR_CAMPO: Record<string, { codigo: string; mensaje: string }> = {
  titulo: {
    codigo: "titulo_invalido",
    mensaje: `Escribe un título para tu sugerencia, de hasta ${TITULO_MAX} caracteres.`,
  },
  descripcion: {
    codigo: "descripcion_invalida",
    mensaje: `Cuéntanos tu idea con algo más de detalle, en hasta ${DESCRIPCION_MAX} caracteres.`,
  },
  areaDestino: {
    codigo: "area_destino_invalida",
    mensaje: `Indica a qué área va dirigida tu sugerencia, en hasta ${AREA_DESTINO_MAX} caracteres.`,
  },
};

/** The body could not be read as a suggestion at all. */
const DATOS_INVALIDOS = apiFailure(
  400,
  "datos_invalidos",
  "No pudimos leer tu sugerencia. Revisa los datos e inténtalo de nuevo.",
);

/**
 * The one answer to everything unrecognised.
 *
 * Deliberately incurious about what actually happened, for the same reason the
 * catalogue's is: telling a dropped connection apart from a CHECK violation
 * would produce a lot of branching whose only output is a message the reader
 * cannot use. The server log keeps the detail; the browser gets this.
 *
 * The second sentence is doing real work. A suggestion is something the person
 * WROTE, and the worst outcome of a failed send is their believing it is safely
 * recorded when it is not — so the message says plainly that it was not saved.
 */
export const ERROR_INTERNO: ApiFailure = apiFailure(
  500,
  "error_interno",
  "No pudimos registrar tu sugerencia. No se guardó nada, así que vuelve a intentarlo; si sigue igual, avisa al Área de Innovación.",
);

/**
 * The author's own row is gone — the account was removed between the guard and
 * the write.
 *
 * `sugerencia.autor_id` is a foreign key with `onDelete: NoAction`, so the
 * insert fails rather than creating an orphan. It is a 409 and not a 500
 * because nothing is broken: the state of the world changed underneath a
 * request that was valid when it started, and signing in again is a real fix
 * the reader can perform.
 */
export function autorNoEncontrado(): ApiFailure {
  return apiFailure(
    409,
    "autor_no_encontrado",
    "Tu cuenta ya no está activa en el portal. Vuelve a iniciar sesión e inténtalo otra vez.",
  );
}

/** The field an issue belongs to, or `null` when it is about the whole body. */
function campoDe(issue: ZodIssue | undefined): string | null {
  const first = issue?.path?.[0];
  return typeof first === "string" ? first : null;
}

/**
 * A rejected body, as the client sees it.
 *
 * Only the FIRST issue is reported: the form highlights one field at a time,
 * and a body with three problems usually has one cause. Answering with a list
 * would put the burden of choosing back on the UI.
 */
export function errorDeValidacion(error: ZodError): ApiFailure {
  const campo = campoDe(error.issues[0]);

  if (campo !== null && campo in MENSAJES_POR_CAMPO) {
    const { codigo, mensaje } = MENSAJES_POR_CAMPO[campo];
    return apiFailure(400, codigo, mensaje);
  }

  return DATOS_INVALIDOS;
}

/**
 * Prisma's error code, read structurally.
 *
 * Duck-typed rather than `instanceof PrismaClientKnownRequestError`, for the
 * reason `lib/enlaces/errors.ts` documents at length: Prisma is reported to
 * surface database constraint failures as an untyped error on some providers
 * (issue #25562). Reading the property when it is there stays correct either
 * way, and keeps this module free of the Prisma runtime so the suite never
 * loads a client that wants a connection string.
 */
function codigoPrisma(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * A failed write, as the client sees it.
 *
 * Exactly one database outcome is worth distinguishing, because exactly one of
 * them has a fix the reader can perform: the author's row is gone (P2003, the
 * foreign key on `autor_id` — the only foreign key this insert touches, since
 * the ledger entry it nests points back at the very row being created).
 *
 * There is deliberately no P2002 branch: `sugerencia` carries no unique
 * constraint, and it must not grow one. Two people having the same idea, or one
 * person sending the same idea twice, is information the Área de Innovación
 * wants — item #16 exists to group duplicates, not to prevent them.
 */
export function errorDePrisma(error: unknown): ApiFailure {
  return codigoPrisma(error) === "P2003" ? autorNoEncontrado() : ERROR_INTERNO;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  ÍTEM #15 — LA REVISIÓN
 *
 * Everything above is written for a collaborator sending an idea. Everything
 * below is read by an administrator moving one through the funnel, and the copy
 * changes accordingly: they are not being told their suggestion was not saved,
 * they are being told a state change did not apply and why.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Why a state change could not be applied — the three cases worth telling apart. */
export type MotivoTransicion = "no_encontrada" | "sin_cambio" | "conflicto";

/**
 * A refused transition, thrown by the repository and mapped by the route.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY AN EXCEPTION AND NOT A RESULT TYPE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * These three cases are decided INSIDE an interactive transaction, and throwing
 * is what rolls it back. A result type would leave the caller holding a "no" with
 * the transaction still open and the row already updated on two of the three
 * paths — so the mechanism that reports the refusal has to be the same one that
 * undoes the work, or the refusal is a lie.
 *
 * `motivo` is a closed union rather than a message, so the mapping to a status
 * code and a Spanish sentence stays in this module with every other one.
 */
export class TransicionRechazada extends Error {
  constructor(readonly motivo: MotivoTransicion) {
    super(`Transición rechazada: ${motivo}`);
    this.name = "TransicionRechazada";
  }
}

/**
 * The failing end of `PATCH /api/sugerencias/{id}/estado`, one sentence per
 * reason.
 *
 * `no_encontrada` is a 404 and the other two are 409, and the split is the usual
 * one: 404 says the thing you addressed is not there, 409 says it is there and
 * the state of the world is not what your request assumed.
 *
 * `sin_cambio` is the double click, and answering it is not pedantry — see
 * `cambiarEstadoSugerencia`, where refusing it is what keeps the immutable ledger
 * a record of changes rather than of button presses.
 *
 * `conflicto` is the one that would otherwise be invisible: two administrators
 * reviewing the same suggestion in the same seconds. The message names the fix
 * (reload and look at where it actually is now) because the second reviewer's
 * decision was made against a state that no longer exists.
 */
const MENSAJES_TRANSICION: Record<MotivoTransicion, ApiFailure> = {
  no_encontrada: apiFailure(
    404,
    "sugerencia_no_encontrada",
    "Esa sugerencia ya no existe. Actualiza la lista para ver las que siguen vigentes.",
  ),
  sin_cambio: apiFailure(
    409,
    "estado_sin_cambio",
    "La sugerencia ya está en ese estado, así que no registramos ningún cambio.",
  ),
  conflicto: apiFailure(
    409,
    "estado_en_conflicto",
    "Otra persona cambió el estado de esta sugerencia mientras la revisabas. Actualiza la lista y vuelve a decidir sobre el estado actual.",
  ),
};

/**
 * The one answer to everything unrecognised while reviewing.
 *
 * Separate from `ERROR_INTERNO` because that one says "no pudimos registrar tu
 * sugerencia … no se guardó nada", which would be actively misleading here: the
 * suggestion exists, it is the state change that did not apply. Same incuriosity
 * about the cause, different fact being reported.
 */
export const ERROR_INTERNO_REVISION: ApiFailure = apiFailure(
  500,
  "error_interno",
  "No pudimos cambiar el estado de la sugerencia. Quedó como estaba; vuelve a intentarlo en un momento.",
);

/** A path parameter that is not an id at all. */
export function identificadorInvalido(): ApiFailure {
  return apiFailure(
    400,
    "identificador_invalido",
    "No reconocimos esa sugerencia. Vuelve a la lista y elígela de nuevo.",
  );
}

/**
 * A failed transition, as the administrator sees it.
 *
 * The typed refusals get their own sentence; anything else — a dropped
 * connection, a CHECK violation, a deadlock — is the internal error. There is
 * deliberately no P2003 branch on `cambiado_por`: an administrator whose own row
 * vanished mid-request is a session problem, not something a sentence about
 * suggestions can help with, and the guard re-reads that row on the next request
 * anyway.
 */
export function errorDeTransicion(error: unknown): ApiFailure {
  return error instanceof TransicionRechazada
    ? MENSAJES_TRANSICION[error.motivo]
    : ERROR_INTERNO_REVISION;
}

/**
 * The admin list could not be read.
 *
 * Its own sentence for the same reason `ERROR_INTERNO_REVISION` has one: nothing
 * was being written, so promising that "no se guardó nada" would answer a
 * question nobody asked.
 */
export const ERROR_INTERNO_LISTADO: ApiFailure = apiFailure(
  500,
  "error_interno",
  "No pudimos cargar las sugerencias. Vuelve a intentarlo en un momento.",
);

/**
 * A rejected body on `PATCH /api/sugerencias/{id}/estado`.
 *
 * It takes no `ZodError` and branches on nothing, unlike `errorDeValidacion`
 * above — and that is a property of the schema rather than a shortcut.
 * `cambiarEstadoSchema` has exactly one field, so "missing", "not a string" and
 * "not one of the five states" are all the same sentence: the state you sent is
 * not a state. Threading the issue through only to arrive at one message would
 * suggest there were others to arrive at.
 *
 * A person cannot produce this from the screen, where the five states are
 * buttons. It answers a hand-made request, so the copy says what the endpoint
 * accepts instead of asking the reader to fix a field they never typed.
 */
export function estadoInvalido(): ApiFailure {
  return apiFailure(
    400,
    "estado_invalido",
    "Ese no es un estado válido para una sugerencia. Elige uno de la lista y vuelve a intentarlo.",
  );
}
