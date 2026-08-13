import type { ZodError, ZodIssue } from "zod";

import { type ApiFailure, apiFailure } from "@/lib/api/errors";

/**
 * Every way a request about an `enlace` can fail, expressed as the one envelope
 * of ADR 0003.
 *
 * These are pure functions over data — they build an `ApiFailure`, they do not
 * build a `Response` — which is what lets the whole mapping be unit-tested
 * without a request, a database or a running server.
 *
 * TWO RULES GOVERN EVERY MESSAGE BELOW.
 *
 * They are Spanish the reader can act on. DESIGN.md: "Copys en español,
 * directos, sin jerga técnica". `codigo` is the stable handle the UI may branch
 * on; `mensaje` is the sentence it shows, and it is never a translation of a
 * library's error.
 *
 * They say nothing the database said. zod's own wording is English and
 * technical, and SQL Server's is worse — a constraint name, a table name and an
 * error number describe the schema to whoever provoked the failure while
 * telling the administrator nothing they can fix. So the mapping goes one way:
 * a failure is recognised and replaced, never forwarded.
 */

/**
 * One entry per field the client can send. Keyed on the field rather than on
 * zod's issue code on purpose: "missing", "empty after trimming" and "longer
 * than the column" are one problem to the person filling the form — the field
 * is wrong — and collapsing them keeps the copy short and specific, while
 * guaranteeing no zod string can leak by being passed through.
 */
const MENSAJES_POR_CAMPO: Record<string, { codigo: string; mensaje: string }> = {
  nombre: {
    codigo: "nombre_invalido",
    mensaje: "Escribe un nombre para el enlace, de hasta 150 caracteres.",
  },
  descripcion: {
    codigo: "descripcion_invalida",
    mensaje: "La descripción puede tener hasta 1000 caracteres.",
  },
  url: {
    codigo: "url_invalida",
    mensaje:
      "Escribe una dirección web válida que empiece por http:// o https://, de hasta 2048 caracteres.",
  },
  tipo: {
    codigo: "tipo_invalido",
    mensaje: "Elige si el enlace es una aplicación o un agente.",
  },
  activo: {
    codigo: "activo_invalido",
    mensaje: "El enlace solo puede quedar activo o dado de baja.",
  },
};

/** The body could not be read as an `enlace` at all. */
const DATOS_INVALIDOS = apiFailure(
  400,
  "datos_invalidos",
  "No pudimos leer los datos del enlace. Revísalos e inténtalo de nuevo.",
);

/** A PATCH that asked for nothing. Separated because the fix is different. */
const SIN_CAMBIOS = apiFailure(
  400,
  "sin_cambios",
  "No recibimos ningún cambio para guardar en este enlace.",
);

/**
 * The one answer to everything unrecognised.
 *
 * Deliberately incurious about what actually happened: the CHECK constraint on
 * `enlace.tipo` may surface as P2004 or as an untyped error depending on the
 * provider (Prisma issue #25562), and a dropped connection looks different
 * again. Trying to tell them apart would produce a lot of branching whose only
 * output is a message the reader cannot use anyway. The server log keeps the
 * detail; the browser gets this.
 */
export const ERROR_INTERNO: ApiFailure = apiFailure(
  500,
  "error_interno",
  "No pudimos completar la operación. Vuelve a intentarlo; si sigue igual, avisa al Área de Innovación.",
);

/** The `{id}` path segment was not a usable identifier. */
export function identificadorInvalido(): ApiFailure {
  return apiFailure(400, "id_invalido", "No reconocemos ese enlace. Vuelve al catálogo e inténtalo otra vez.");
}

/** No row with that id — deleted by someone else, or never there. */
export function enlaceNoEncontrado(): ApiFailure {
  return apiFailure(
    404,
    "enlace_no_encontrado",
    "Ese enlace ya no existe en el catálogo. Actualiza la página para ver la lista al día.",
  );
}

/**
 * The name is already taken.
 *
 * `enlace.nombre` is unique because the name is the enlace's identity to a
 * collaborator: two rows called "Facturación" are indistinguishable in the
 * dashboard, and the one they need is a coin toss. `url` is deliberately NOT
 * unique — registering the same system twice under two names, for two
 * audiences, is legitimate.
 */
export function nombreDuplicado(): ApiFailure {
  return apiFailure(
    409,
    "nombre_duplicado",
    "Ya existe un enlace con ese nombre. Elige otro para que se distingan en el portal.",
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
 * Only the FIRST issue is reported. The administration form highlights one
 * field at a time, and a body with five problems usually has one real cause;
 * answering with a list would put the burden of choosing back on the UI.
 */
export function errorDeValidacion(error: ZodError): ApiFailure {
  const issue = error.issues[0];
  const campo = campoDe(issue);

  if (campo !== null && campo in MENSAJES_POR_CAMPO) {
    const { codigo, mensaje } = MENSAJES_POR_CAMPO[campo];
    return apiFailure(400, codigo, mensaje);
  }

  /*
   * No field owns it. The only whole-body rule the schemas declare is the
   * update's "at least one change", which arrives as a custom issue; anything
   * else here means the body was not shaped like an enlace at all.
   */
  return issue?.code === "custom" ? SIN_CAMBIOS : DATOS_INVALIDOS;
}

/**
 * Prisma's error code, read structurally.
 *
 * Duck-typed rather than checked with `instanceof PrismaClientKnownRequestError`
 * because that guarantee does not hold: Prisma is reported to surface database
 * constraint failures as an untyped `PrismaClientUnknownRequestError` on some
 * providers (issue #25562). Reading the property when it is there, and treating
 * its absence as "unrecognised", is the behaviour that stays correct either
 * way — and it keeps this module free of the Prisma runtime, so the suite never
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
 * Exactly two database outcomes are worth distinguishing, because exactly two
 * of them are the administrator's to resolve: the name is taken (P2002 — and
 * `nombre` is the only unique constraint on this table, so P2002 here can mean
 * nothing else), and the row is gone (P2025, which `update` and `delete` raise
 * when they match nothing). Everything else is `ERROR_INTERNO`.
 */
export function errorDePrisma(error: unknown): ApiFailure {
  switch (codigoPrisma(error)) {
    case "P2002":
      return nombreDuplicado();
    case "P2025":
      return enlaceNoEncontrado();
    default:
      return ERROR_INTERNO;
  }
}
