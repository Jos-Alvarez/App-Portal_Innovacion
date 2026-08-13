/**
 * Every authorization rule of the portal, expressed as pure functions.
 *
 * ADR 0007 is the whole of the policy: the session identifies the user and
 * nothing else, so the role and the assignments are re-read from SQL Server on
 * every request and a revocation applies to the very next one. Nothing in this
 * file caches anything; the reads that feed it are deduplicated only within a
 * single server request (`request-source.ts`).
 *
 * These functions take rows and return decisions. They know nothing about
 * Auth.js, about Prisma or about how a denial is shown, which is what lets the
 * two entry points on top of them — a Server Component screen and a Route
 * Handler response — share one rule set instead of drifting apart.
 */

/** The two grant tables of ADR 0002's split model. */
export type RecursoTipo = "enlace" | "procesador";

/** A resource the guard is asked about: which table, which row. */
export interface RecursoRef {
  tipo: RecursoTipo;
  id: number;
}

/** The `usuario` columns authorization depends on, as stored. */
export interface UsuarioAuthzRow {
  id: number;
  correo: string;
  nombre: string;
  esAdmin: boolean;
  activo: boolean;
}

/**
 * The signed-in collaborator, as the rest of the application may see them.
 *
 * `activo` is deliberately absent: an authorized user is active by
 * construction, and carrying the flag further would invite a second, weaker
 * check somewhere downstream.
 */
export interface AuthorizedUsuario {
  id: number;
  correo: string;
  nombre: string;
  esAdmin: boolean;
}

/**
 * What the assignment lookup found. `null` means no grant row at all; a value
 * carries the state of the resource the grant points at, because a grant over
 * a resource the catalogue deactivated is not access.
 */
export interface ResourceGrant {
  recursoActivo: boolean;
}

/**
 * Why a request was refused. Kept precise on the server side — the code sent
 * to the browser is coarser on purpose (`errorForDenial`).
 */
export type DenialReason =
  | "no-session"
  | "unknown-account"
  | "inactive-account"
  | "not-admin"
  | "not-assigned"
  | "inactive-resource";

/**
 * The result of a guard. A discriminated union rather than a thrown error or a
 * bare boolean: the caller cannot reach `usuario` without having handled the
 * denial first, so forgetting the check is a type error and not a leak.
 */
export type Authorization =
  | { readonly allowed: true; readonly usuario: AuthorizedUsuario }
  | { readonly allowed: false; readonly reason: DenialReason };

export function allow(usuario: AuthorizedUsuario): Authorization {
  return { allowed: true, usuario };
}

export function deny(reason: DenialReason): Authorization {
  return { allowed: false, reason };
}

/**
 * Turns the row read for the session's e-mail into a decision.
 *
 * A missing row is a denial and never an error: the sign-in upserts it, so its
 * absence means the account was removed while the session was still alive —
 * exactly the revocation ADR 0007 requires to bite immediately.
 *
 * `activo === false` denies too. The flag would otherwise be decorative: the
 * authentication gate only checks that a session exists, so if authorization
 * ignored `activo`, deactivating a collaborator would change nothing at all.
 */
export function authorizeAccount(row: UsuarioAuthzRow | null): Authorization {
  if (!row) {
    return deny("unknown-account");
  }

  if (!row.activo) {
    return deny("inactive-account");
  }

  return allow({ id: row.id, correo: row.correo, nombre: row.nombre, esAdmin: row.esAdmin });
}

/** Narrows an authorized account to an administrator (`usuario.es_admin`). */
export function authorizeAdmin(account: Authorization): Authorization {
  if (!account.allowed) {
    return account;
  }

  return account.usuario.esAdmin ? account : deny("not-admin");
}

/**
 * Narrows an authorized account to one holding a usable grant over a resource.
 *
 * An administrator gets no implicit grant here. ADR 0007 states the rule
 * without exception — "sin fila de asignación → 403 inmediato" — and the
 * administrator's power in this product is to hand out assignments, not to
 * hold every one of them silently.
 */
export function authorizeGrant(account: Authorization, grant: ResourceGrant | null): Authorization {
  if (!account.allowed) {
    return account;
  }

  if (!grant) {
    return deny("not-assigned");
  }

  return grant.recursoActivo ? account : deny("inactive-resource");
}

/**
 * What the reader has to do about a denial, which is the only distinction the
 * browser ever needs: sign in again, ask about their account, or ask for the
 * access. Both entry points derive their status code and their copy from this,
 * so a JSON error and a 403 screen can never tell two different stories.
 */
export type DenialKind = "session" | "account" | "resource";

export function denialKind(reason: DenialReason): DenialKind {
  if (reason === "no-session") {
    return "session";
  }

  if (reason === "unknown-account" || reason === "inactive-account") {
    return "account";
  }

  return "resource";
}

/**
 * 401 for "we do not know who you are", 403 for "we know, and the answer is
 * no". Only the first is worth retrying with a fresh sign-in, which is what
 * makes the distinction useful to the client rather than pedantic.
 */
export function statusForDenial(reason: DenialReason): 401 | 403 {
  return denialKind(reason) === "session" ? 401 : 403;
}

/** The JSON error body of ADR 0003: a code, and a Spanish message the UI can show as-is. */
export interface ApiError {
  codigo: string;
  mensaje: string;
}

const ERRORS: Record<DenialKind, ApiError> = {
  session: {
    codigo: "sesion_requerida",
    mensaje: "Tu sesión ya no está activa. Vuelve a iniciar sesión para continuar.",
  },
  account: {
    codigo: "cuenta_no_habilitada",
    mensaje:
      "Tu cuenta no está habilitada en el portal. Escríbele al Área de Innovación para revisarlo.",
  },
  resource: {
    codigo: "acceso_denegado",
    mensaje:
      "No tienes acceso a este recurso. El Área de Innovación administra los accesos del portal.",
  },
};

/**
 * The error the browser receives.
 *
 * Every missing-permission reason collapses into one code: telling the caller
 * whether they failed the administrator check or the assignment check would
 * describe the portal's internal structure to someone who just proved they are
 * not entitled to it, and it would change nothing they can do about it.
 */
export function errorForDenial(reason: DenialReason): ApiError {
  return ERRORS[denialKind(reason)];
}
