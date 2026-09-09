import { type ApiFailure, apiFailure } from "@/lib/api/errors";

import { BUSQUEDA_MIN } from "@/lib/personas/schema";

/**
 * What `/api/personas` answers when it refuses — ADR 0003's envelope, in the
 * plain Spanish DESIGN.md requires.
 *
 * Its own sentences and not `lib/admins/errors.ts`': the reader of this family
 * is an administrator handing out access to ONE resource, and every refusal
 * here has to name that, not the administrator role. "No puede ser
 * administradora" in front of somebody assigning a procesador would describe a
 * rule that has nothing to do with what they were doing.
 */

/** The `?q=` was missing, blank or too long to be a search. */
export function terminoInvalido(): ApiFailure {
  return apiFailure(
    400,
    "termino_invalido",
    `Escribe al menos ${BUSQUEDA_MIN} letras del nombre o del correo de la persona que buscas.`,
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
 * The check that rejects it is the SAME rule the sign-in applies
 * (`isEmailFromAllowedDomain`), and that is exactly why it exists: creating a
 * row for an address that could never sign in would leave a person in the
 * portal's lists, holding grants, who can never come and use them.
 */
export function dominioNoCorporativo(): ApiFailure {
  return apiFailure(
    409,
    "dominio_no_corporativo",
    "Esa dirección no es del dominio corporativo, así que esa persona no puede entrar al portal ni recibir accesos.",
  );
}

/** Nothing left to degrade to: the database itself could not be read. */
export const ERROR_INTERNO: ApiFailure = apiFailure(
  500,
  "error_interno",
  "No pudimos completar la operación. Vuelve a intentarlo en un momento.",
);
