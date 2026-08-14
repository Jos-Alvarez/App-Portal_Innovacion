import { type ApiFailure, apiFailure } from "@/lib/api/errors";

/**
 * Every way an assignment request can fail, expressed as the one envelope of
 * ADR 0003.
 *
 * Same two rules as its siblings: the messages are Spanish the administrator
 * can act on (DESIGN.md: "Copys en español, directos, sin jerga técnica"), and
 * nothing the database said is ever forwarded to the browser.
 *
 * There is no `errorDeValidacion` here. An assignment carries no body — the two
 * identifiers in the path are the whole request — so there is no zod error to
 * translate and no form field to attribute one to.
 */

/** The two tables an assignment can land in, named by the resource they grant. */
export type RecursoTipo = "enlace" | "procesador";

/** How each type is named to the reader. Spanish copy, singular, lowercase. */
const ETIQUETA: Record<RecursoTipo, string> = {
  enlace: "enlace",
  procesador: "procesador",
};

/**
 * The one answer to everything unrecognised. Deliberately incurious about what
 * happened: the server log keeps the detail, the browser gets this.
 */
export const ERROR_INTERNO: ApiFailure = apiFailure(
  500,
  "error_interno",
  "No pudimos completar la operación. Vuelve a intentarlo; si sigue igual, avisa al Área de Innovación.",
);

/** The `{usuarioId}` path segment was not a usable identifier. */
export function identificadorDeUsuarioInvalido(): ApiFailure {
  return apiFailure(
    400,
    "usuario_id_invalido",
    "No reconocemos a esa persona. Vuelve a la lista de usuarios e inténtalo otra vez.",
  );
}

/** The resource path segment was not a usable identifier. */
export function identificadorDeRecursoInvalido(tipo: RecursoTipo): ApiFailure {
  return apiFailure(
    400,
    `${tipo}_id_invalido`,
    `No reconocemos ese ${ETIQUETA[tipo]}. Actualiza la página e inténtalo otra vez.`,
  );
}

/** No `usuario` row with that id. */
export function usuarioNoEncontrado(): ApiFailure {
  return apiFailure(
    404,
    "usuario_no_encontrado",
    "Esa persona ya no está en el portal. Actualiza la página para ver la lista al día.",
  );
}

/** No resource row with that id. */
export function recursoNoEncontrado(tipo: RecursoTipo): ApiFailure {
  return apiFailure(
    404,
    `${tipo}_no_encontrado`,
    `Ese ${ETIQUETA[tipo]} ya no existe en el catálogo. Actualiza la página para ver la lista al día.`,
  );
}

/**
 * The resource exists but is dado de baja, so it cannot be GRANTED.
 *
 * 409 and not 400: the request is well formed and both rows are there. What
 * forbids it is the state one of them is in, and the administrator resolves it
 * by reactivating the resource, not by correcting the request.
 *
 * Note what this does NOT block: revoking. Removing a grant over a resource
 * that was taken down is precisely the clean-up the assignment screen exists to
 * allow, and refusing it would strand rows nobody could ever remove.
 */
export function recursoDadoDeBaja(tipo: RecursoTipo): ApiFailure {
  return apiFailure(
    409,
    `${tipo}_dado_de_baja`,
    `Ese ${ETIQUETA[tipo]} está dado de baja, así que no puedes darlo de alta a nadie. Puedes quitar accesos antiguos; para concederlos, reactívalo primero.`,
  );
}

/**
 * The account exists but is dada de baja, so it cannot RECEIVE a grant.
 *
 * The same reasoning as `recursoDadoDeBaja`, applied to the other end of the
 * row, and deliberately symmetric with it: the authorization guard already
 * denies an inactive account every resource it asks for, so a grant written to
 * one is a row that can never do anything except mislead whoever reads the
 * assignment screen next.
 */
export function usuarioDadoDeBaja(): ApiFailure {
  return apiFailure(
    409,
    "usuario_dado_de_baja",
    "Esa persona está dada de baja en el portal, así que no puede recibir accesos nuevos. Reactívala primero si vuelve a necesitarlos.",
  );
}

/**
 * Prisma's error code, read structurally rather than with `instanceof`: Prisma
 * is reported to surface constraint failures as an untyped error on some
 * providers (issue #25562), and this also keeps the module free of the Prisma
 * runtime so the suite never loads a client that wants a connection string.
 */
function codigoPrisma(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * "The row is already there" — the write found the composite primary key taken.
 *
 * The composite `@@id([usuarioId, enlaceId])` is the ONLY unique constraint on
 * either assignment table, so P2002 here can mean nothing else. `repository.ts`
 * reads that as the grant already existing, which is success.
 */
export function esFilaYaExistente(error: unknown): boolean {
  return codigoPrisma(error) === "P2002";
}

/**
 * "The row is not there" — the delete matched nothing.
 *
 * `repository.ts` reads that as the grant already being gone, which is success.
 */
export function esFilaAusente(error: unknown): boolean {
  return codigoPrisma(error) === "P2025";
}

/**
 * A failed write, as the client sees it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  READ THIS BEFORE COPYING `errorDePrisma` FROM enlaces OR procesadores
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Those two modules map P2002 → 409 "ya existe" and P2025 → 404 "no existe",
 * and both mappings are WRONG for an assignment. This one INVERTS them, and
 * that inversion is the single easiest thing in this feature to destroy with a
 * well-meaning copy-paste.
 *
 * The reason is that an assignment has no lifecycle of its own. A `procesador`
 * with a duplicate `clave_procesador` is a genuine conflict — two rows would
 * point at two different Python modules and the administrator must choose. An
 * assignment row carries nothing to conflict about: it either exists or it does
 * not, and its existence IS the grant. So:
 *
 *   · P2002 on `create`  means the grant asked for is already in place.
 *   · P2025 on `delete`  means the grant asked to be removed is already gone.
 *
 * In both cases the state the caller requested is the state of the database.
 * Answering 409 or 404 would turn an administrator's double-click, or two
 * administrators fixing the same rota at once, into a red toast that reports a
 * failure where nothing failed — and would push whoever saw it into "un-doing"
 * a change that had in fact worked.
 *
 * `repository.ts` therefore swallows those two codes as successes and they
 * never reach this function. If one does arrive, that handling was removed, and
 * the 500 below is the honest answer to a write nobody understood any more.
 *
 * P2003 is the one code with a real answer here: a foreign key failed, so the
 * `usuario` or the resource stopped existing between the check and the write.
 * Nothing in the portal hard-deletes those rows today — bajas are logical — so
 * this is a race that should not be reachable, but "refresh and look again" is
 * a far better answer than "try again" if it ever is.
 */
export function errorDePrisma(error: unknown, tipo: RecursoTipo): ApiFailure {
  if (codigoPrisma(error) === "P2003") {
    return apiFailure(
      404,
      "asignacion_no_disponible",
      `Ya no existe esa persona o ese ${ETIQUETA[tipo]}. Actualiza la página para ver los datos al día.`,
    );
  }

  return ERROR_INTERNO;
}
