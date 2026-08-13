import type { ZodError, ZodIssue } from "zod";

import { type ApiFailure, apiFailure } from "@/lib/api/errors";

/**
 * Every way a request about a `procesador` can fail, expressed as the one
 * envelope of ADR 0003.
 *
 * Same two rules as `lib/enlaces/errors.ts`. The messages are Spanish the
 * reader can act on (DESIGN.md: "Copys en español, directos, sin jerga
 * técnica"), and they say nothing the database or the validation library said —
 * a failure is recognised and replaced, never forwarded.
 *
 * THE ONE THING THIS MODULE DOES THAT THE ENLACES ONE DOES NOT. Two of this
 * resource's failures are about a RELATION between fields, not about a field.
 * Mapping by field alone would answer "revisa el máximo de archivos" to
 * `entradas_max: 3` under `entradas_min: 5` — true, useless, and identical to
 * the answer for `entradas_max: 0`, which needs a completely different fix. So
 * the cross-field issues get their own entries, recognised by being the custom
 * issues that `schema.ts` attributes to a field.
 */

/**
 * One entry per field the client can send. Keyed on the field rather than on
 * zod's issue code: "missing", "empty after trimming" and "longer than the
 * column" are one problem to the person filling the form.
 */
const MENSAJES_POR_CAMPO: Record<string, { codigo: string; mensaje: string }> = {
  nombre: {
    codigo: "nombre_invalido",
    mensaje: "Escribe un nombre para el procesador, de hasta 150 caracteres.",
  },
  descripcion: {
    codigo: "descripcion_invalida",
    mensaje: "La descripción puede tener hasta 1000 caracteres.",
  },
  claveProcesador: {
    codigo: "clave_invalida",
    mensaje:
      "La clave debe empezar por una letra y llevar solo minúsculas, números y guiones, por ejemplo: maestro-excel.",
  },
  formatosAceptados: {
    codigo: "formatos_invalidos",
    mensaje:
      "Escribe al menos un formato, separados por comas y sin repetirlos, por ejemplo: xlsx, csv.",
  },
  tamanoMax: {
    codigo: "tamano_max_invalido",
    mensaje: "El tamaño máximo por archivo debe ser mayor que cero y no pasar de 25 MB.",
  },
  entradasMin: {
    codigo: "entradas_min_invalida",
    mensaje: "Una ejecución necesita al menos un archivo de entrada.",
  },
  entradasMax: {
    codigo: "entradas_max_invalida",
    mensaje: "El máximo de archivos debe ser uno o más. Déjalo vacío si no quieres poner tope.",
  },
  tamanoMaxTotal: {
    codigo: "tamano_max_total_invalido",
    mensaje: "El tamaño máximo del conjunto debe ser mayor que cero. Déjalo vacío si no quieres tope.",
  },
  salidaEsperada: {
    codigo: "salida_esperada_invalida",
    mensaje: "Elige si el usuario recibirá un solo archivo o un ZIP.",
  },
  activo: {
    codigo: "activo_invalido",
    mensaje: "El procesador solo puede quedar activo o dado de baja.",
  },
};

/**
 * The cross-field rules of ADR 0002, keyed on the field each one is attributed
 * to. Consulted BEFORE `MENSAJES_POR_CAMPO` and only for a custom issue, so a
 * violation of the relation never collapses into the field's ordinary message.
 */
const MENSAJES_CRUZADOS: Record<string, { codigo: string; mensaje: string }> = {
  entradasMax: {
    codigo: "rango_entradas_incoherente",
    mensaje:
      "El máximo de archivos no puede ser menor que el mínimo. Sube el máximo o baja el mínimo.",
  },
  tamanoMaxTotal: {
    codigo: "topes_tamano_incoherentes",
    mensaje:
      "El tamaño máximo del conjunto no puede ser menor que el de un archivo suelto. Ajusta uno de los dos.",
  },
};

/** The body could not be read as a `procesador` at all. */
const DATOS_INVALIDOS = apiFailure(
  400,
  "datos_invalidos",
  "No pudimos leer los datos del procesador. Revísalos e inténtalo de nuevo.",
);

/** A PATCH that asked for nothing. Separated because the fix is different. */
const SIN_CAMBIOS = apiFailure(
  400,
  "sin_cambios",
  "No recibimos ningún cambio para guardar en este procesador.",
);

/**
 * The one answer to everything unrecognised. Deliberately incurious about what
 * happened: the server log keeps the detail, the browser gets this.
 */
export const ERROR_INTERNO: ApiFailure = apiFailure(
  500,
  "error_interno",
  "No pudimos completar la operación. Vuelve a intentarlo; si sigue igual, avisa al Área de Innovación.",
);

/** The `{id}` path segment was not a usable identifier. */
export function identificadorInvalido(): ApiFailure {
  return apiFailure(
    400,
    "id_invalido",
    "No reconocemos ese procesador. Vuelve al catálogo e inténtalo otra vez.",
  );
}

/** No row with that id — dado de baja by someone else, or never there. */
export function procesadorNoEncontrado(): ApiFailure {
  return apiFailure(
    404,
    "procesador_no_encontrado",
    "Ese procesador ya no existe en el catálogo. Actualiza la página para ver la lista al día.",
  );
}

/**
 * The registry key is already taken.
 *
 * `clave_procesador` is unique because it is a lookup key: two rows claiming
 * `maestro-excel` would both resolve to the same Python module, and which row's
 * limits applied to an execution would depend on which one the query happened
 * to return.
 */
export function claveDuplicada(): ApiFailure {
  return apiFailure(
    409,
    "clave_duplicada",
    "Ya hay un procesador con esa clave. Cada clave apunta a un módulo distinto, así que elige otra.",
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
 * and a body with five problems usually has one real cause.
 *
 * The order of the three branches is the behaviour. A custom issue carrying a
 * field is one of ADR 0002's cross-field rules and gets the message about the
 * relation; a custom issue carrying no field is the update's "at least one
 * change"; anything else is a field that failed on its own terms.
 */
export function errorDeValidacion(error: ZodError): ApiFailure {
  const issue = error.issues[0];
  const campo = campoDe(issue);

  if (issue?.code === "custom" && campo !== null && campo in MENSAJES_CRUZADOS) {
    const { codigo, mensaje } = MENSAJES_CRUZADOS[campo];
    return apiFailure(400, codigo, mensaje);
  }

  if (campo !== null && campo in MENSAJES_POR_CAMPO) {
    const { codigo, mensaje } = MENSAJES_POR_CAMPO[campo];
    return apiFailure(400, codigo, mensaje);
  }

  return issue?.code === "custom" ? SIN_CAMBIOS : DATOS_INVALIDOS;
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
 * A failed write, as the client sees it.
 *
 * Two outcomes are worth distinguishing because two of them are the
 * administrator's to resolve: the key is taken (P2002 — `clave_procesador` is
 * the only unique constraint on this table, so it can mean nothing else), and
 * the row is gone (P2025, which `update` raises when it matches nothing).
 */
export function errorDePrisma(error: unknown): ApiFailure {
  switch (codigoPrisma(error)) {
    case "P2002":
      return claveDuplicada();
    case "P2025":
      return procesadorNoEncontrado();
    default:
      return ERROR_INTERNO;
  }
}
