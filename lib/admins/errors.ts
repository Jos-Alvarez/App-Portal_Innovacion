import { BUSQUEDA_MIN } from "@/lib/admins/schema";
import { type ApiFailure, apiFailure } from "@/lib/api/errors";

/**
 * Every way a request about the administrator role can fail, expressed as the
 * one envelope of ADR 0003 — backlog item #17.
 *
 * Pure functions over data: they build an `ApiFailure`, not a `Response`, so the
 * whole mapping is unit-testable without a request, a database or a server. The
 * two rules the other error modules state apply here unchanged — the messages
 * are Spanish the reader can act on, and nothing the database, Microsoft Graph
 * or a validation library said is ever forwarded.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHO READS THESE SENTENCES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * An administrator, and only an administrator: every route in this family is
 * behind `guardRouteAdmin`. So unlike `lib/sugerencias/errors.ts`, the copy may
 * name the portal's own rules — "siempre debe quedar al menos 1 administrador"
 * is a rule this reader is responsible for, not an internal detail leaking to a
 * stranger. What it still may never name is a column, a Graph permission scope
 * or an error code.
 */

/** The `?q=` was missing, blank or too long to be a search. */
export function terminoInvalido(): ApiFailure {
  return apiFailure(
    400,
    "termino_invalido",
    `Escribe al menos ${BUSQUEDA_MIN} caracteres del nombre o del correo de la persona que buscas.`,
  );
}

/** The `{usuarioId}` segment is not a usable identifier. */
export function identificadorInvalido(): ApiFailure {
  return apiFailure(
    400,
    "identificador_invalido",
    "No pudimos identificar a esa persona. Vuelve a la lista y elígela de nuevo.",
  );
}

/** The body did not carry an address the portal can key a `usuario` row on. */
export function correoInvalido(): ApiFailure {
  return apiFailure(
    400,
    "correo_invalido",
    "No pudimos leer el correo de esa persona. Búscala otra vez y elígela de la lista.",
  );
}

/**
 * The address is not corporate.
 *
 * The domain check that rejects it is the SAME rule the sign-in applies
 * (`isEmailFromAllowedDomain`), and that is why this refusal exists at all:
 * promoting an outside address would write a `usuario` row holding the
 * administrator role that its owner can never sign in to use — a role granted to
 * nobody, sitting in the list forever.
 */
export function dominioNoCorporativo(): ApiFailure {
  return apiFailure(
    409,
    "dominio_no_corporativo",
    "Esa dirección no es del dominio corporativo, así que no puede entrar al portal ni ser administradora.",
  );
}

/** Nobody with that address exists, in the portal or in the directory. */
export function personaNoEncontrada(): ApiFailure {
  return apiFailure(
    404,
    "persona_no_encontrada",
    "No encontramos a esa persona. Búscala de nuevo y elígela de la lista de resultados.",
  );
}

/**
 * The directory could not be reached AND the person has never signed in.
 *
 * This is the exact boundary of ADR 0009's agreed degradation: without Graph the
 * portal can still promote anyone it already knows, and it cannot invent a row
 * for someone it does not. Saying so plainly is what lets the administrator act
 * — asking that person to sign in once is a real fix, and it is in the sentence.
 */
export function directorioNoDisponible(): ApiFailure {
  return apiFailure(
    409,
    "directorio_no_disponible",
    "Ahora mismo no podemos consultar el directorio de la empresa, y esa persona todavía no entró al portal. Pídele que inicie sesión una vez y vuelve a intentarlo.",
  );
}

/** The role was already granted. TECH-DESIGN: no duplicate roles are created. */
export function yaEsAdministrador(): ApiFailure {
  return apiFailure(409, "ya_es_administrador", "Esa persona ya es administradora del portal.");
}

/**
 * The account exists but is deactivated.
 *
 * Same asymmetry `lib/asignaciones/handlers.ts` documents for a grant: giving a
 * role to an account the authorization guard refuses on every request produces a
 * row that can only mislead whoever reads this screen next. TAKING the role away
 * from a deactivated account stays allowed, for the same reason revoking a grant
 * over a baja stays allowed — those rows have to be tidiable.
 */
export function cuentaDadaDeBaja(): ApiFailure {
  return apiFailure(
    409,
    "cuenta_dada_de_baja",
    "Esa cuenta está dada de baja en el portal, así que no puede recibir el rol de administradora.",
  );
}

/** The revocation named somebody who does not hold the role. */
export function noEsAdministrador(): ApiFailure {
  return apiFailure(
    409,
    "no_es_administrador",
    "Esa persona ya no tiene el rol de administradora. Actualiza la pantalla para ver la lista al día.",
  );
}

/** The revocation named an id that is not in `usuario` at all. */
export function usuarioNoEncontrado(): ApiFailure {
  return apiFailure(
    404,
    "usuario_no_encontrado",
    "Esa cuenta ya no existe en el portal. Actualiza la pantalla para ver la lista al día.",
  );
}

/**
 * The hard rule of the PRD: the portal never reaches zero administrators.
 *
 * It covers self-revocation without a special case — an administrator alone in
 * the list is the last one whether they are revoking themselves or somebody
 * else, and the count that refuses it does not ask who asked.
 */
export function ultimoAdministrador(): ApiFailure {
  return apiFailure(
    409,
    "ultimo_administrador",
    "No puedes quitar el rol: el portal siempre debe tener al menos una persona administradora. Nombra a otra antes de quitarte el rol.",
  );
}

/**
 * The account pinned by `ADMIN_EMAIL`, which the login re-promotes on EVERY
 * sign-in (`lib/auth/usuario-repository.ts`).
 *
 * That module states the obligation this function discharges: item #17 "MUST
 * refuse the revocation outright and explain that this account is pinned by the
 * `ADMIN_EMAIL` environment variable, instead of accepting an operation that
 * silently undoes itself". A revocation that reverts the next time its subject
 * signs in is worse than a refusal — the list would agree with the administrator
 * for a few hours and then disagree, with nothing on screen ever explaining why.
 *
 * The sentence says WHERE the pin lives without naming the variable: the person
 * who can change it is whoever deploys the portal, and that is what it points at.
 */
export function cuentaFijada(): ApiFailure {
  return apiFailure(
    409,
    "cuenta_fijada",
    "Esa cuenta es la administradora de respaldo del portal y está fijada en la configuración del despliegue. Para quitarle el rol hay que cambiar esa configuración; desde aquí no se puede.",
  );
}

/**
 * Two administrators changed the roles at the same instant and one of the two
 * transactions was rolled back.
 *
 * A retry is a real fix and the sentence asks for one. This is the visible face
 * of the serializable transaction in `repository.ts` — see the note there on why
 * the minimum-one rule cannot be kept without it.
 */
export function conflictoDeConcurrencia(): ApiFailure {
  return apiFailure(
    409,
    "conflicto_de_roles",
    "Otra persona estaba cambiando los roles al mismo tiempo. Vuelve a intentarlo.",
  );
}

/**
 * The one answer to everything unrecognised.
 *
 * The second sentence is doing real work, exactly as it does for a suggestion:
 * the worst outcome of a failed role change is an administrator believing it
 * applied. Nothing partial can survive — every write in this family is inside a
 * transaction — so the message can promise that and be true.
 */
export const ERROR_INTERNO: ApiFailure = apiFailure(
  500,
  "error_interno",
  "No pudimos completar el cambio de rol. No se guardó nada, así que vuelve a intentarlo; si sigue igual, avisa al equipo de sistemas.",
);

/* ══════════════════════════════════════════════════════════════════════════
 *  THE REFUSALS THE REPOSITORY RAISES FROM INSIDE A TRANSACTION
 * ══════════════════════════════════════════════════════════════════════════ */

/** Why a promotion or a revocation was refused by the transaction itself. */
export type MotivoRechazo =
  | "no_encontrado"
  | "dado_de_baja"
  | "ya_es_admin"
  | "no_es_admin"
  | "cuenta_fijada"
  | "ultimo_admin"
  | "conflicto";

/**
 * A refusal raised from inside `$transaction`.
 *
 * It is thrown rather than returned for one reason: throwing is what rolls the
 * transaction back. A returned value would leave the interactive transaction to
 * commit whatever it had already written — and in the revocation that is exactly
 * the `es_admin = 0` the rule exists to undo.
 */
export class RolRechazado extends Error {
  constructor(readonly motivo: MotivoRechazo) {
    super(`Cambio de rol rechazado: ${motivo}`);
    this.name = "RolRechazado";
  }
}

const POR_MOTIVO: Record<MotivoRechazo, () => ApiFailure> = {
  no_encontrado: usuarioNoEncontrado,
  dado_de_baja: cuentaDadaDeBaja,
  ya_es_admin: yaEsAdministrador,
  no_es_admin: noEsAdministrador,
  cuenta_fijada: cuentaFijada,
  ultimo_admin: ultimoAdministrador,
  conflicto: conflictoDeConcurrencia,
};

/**
 * Prisma's error code, read structurally.
 *
 * Duck-typed rather than `instanceof PrismaClientKnownRequestError`, for the
 * reason `lib/enlaces/errors.ts` documents at length: Prisma is reported to
 * surface database failures as an untyped error on some providers (issue
 * #25562). Reading the property when it is there stays correct either way, and
 * keeps this module free of the Prisma runtime so the suite never loads a client
 * that wants a connection string.
 */
function codigoPrisma(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * A failed role change, as the client sees it.
 *
 * Three things are worth distinguishing because each has a fix the reader can
 * perform: the refusals the rule itself raised, and two database outcomes that
 * both mean "somebody else got here first".
 *
 *   · P2034 — Prisma's write conflict or deadlock, which is precisely what the
 *     serializable transaction of the revocation produces when two
 *     administrators collide.
 *   · P2002 — the unique index on `usuario.correo`. A promotion reads that the
 *     row does not exist and then creates it; between those two statements
 *     either another promotion or that person's own first sign-in can insert it.
 *
 * Both are answered as a conflict rather than as "ya es administradora": a
 * retry resolves them correctly, and only a retry can tell the two causes apart
 * — a sign-in creates the row WITHOUT the role, so claiming the role was already
 * granted would be a lie in exactly the case the administrator most needs to act
 * on. Everything else is a 500.
 */
export function errorDeRol(error: unknown): ApiFailure {
  if (error instanceof RolRechazado) {
    return POR_MOTIVO[error.motivo]();
  }

  const codigo = codigoPrisma(error);

  return codigo === "P2034" || codigo === "P2002" ? conflictoDeConcurrencia() : ERROR_INTERNO;
}
