import { type ApiFailure, apiFailure } from "@/lib/api/errors";

/**
 * Every way the collaborator's two routes can fail, expressed as the one
 * envelope of ADR 0003.
 *
 * These are pure functions over data — they build an `ApiFailure`, not a
 * `Response` — which is what lets the whole mapping be unit-tested without a
 * request, a database or a running server.
 *
 * WHY THIS EXISTS NEXT TO `lib/enlaces/errors.ts` INSTEAD OF BORROWING FROM IT.
 * The audience is different, and the audience is the whole content of a
 * message. That module writes for an administrator — "vuelve al catálogo",
 * "elige otro nombre" — instructions aimed at someone who owns the row and can
 * change it. The person reading these has no catalogue and nothing to edit;
 * their only useful next step is to try again or to tell the Área de
 * Innovación, so that is what every sentence below says. Sharing the strings
 * would have meant one of the two audiences reading advice meant for the other.
 *
 * The two rules of `lib/enlaces/errors.ts` still hold. The Spanish is plain and
 * actionable (DESIGN.md: "Copys en español, directos, sin jerga técnica"), and
 * nothing the database or a library said is ever forwarded — a failure is
 * recognised and replaced, never passed through.
 */

/**
 * The one answer to everything unrecognised.
 *
 * Deliberately incurious about what actually happened: a dropped connection, a
 * timeout and a permissions problem on the SQL Server login all produce the
 * same sentence, because they produce the same next step for the reader. The
 * server log keeps the detail.
 */
export const ERROR_INTERNO: ApiFailure = apiFailure(
  500,
  "error_interno",
  "No pudimos cargar tus recursos. Vuelve a intentarlo; si sigue igual, avísale al Área de Innovación.",
);

/** The `{id}` segment of the link that was followed was not an identifier. */
export function identificadorInvalido(): ApiFailure {
  return apiFailure(
    400,
    "id_invalido",
    "Ese enlace no es válido. Vuelve a tu panel y ábrelo desde ahí.",
  );
}

/** No row with that id — the enlace was removed after the page was rendered. */
export function enlaceNoEncontrado(): ApiFailure {
  return apiFailure(
    404,
    "enlace_no_encontrado",
    "Ese enlace ya no está disponible. Actualiza tu panel para ver lo que tienes asignado.",
  );
}

/**
 * The stored address did not survive the re-check performed just before the
 * redirect.
 *
 * The reader is told the portal REFUSED, not merely that something failed: a
 * redirect that silently did not happen looks like a broken link and invites
 * them to keep clicking. Who can fix it is named, because the address lives in
 * a row only the Área de Innovación can edit.
 */
export function destinoNoPermitido(): ApiFailure {
  return apiFailure(
    500,
    "destino_no_permitido",
    "Este enlace apunta a una dirección que el portal no puede abrir de forma segura, así que no lo abrimos. Avísale al Área de Innovación.",
  );
}

/**
 * The apertura could not be recorded, so the redirect did not happen.
 *
 * Saying so plainly is the difference between a reader who retries and a reader
 * who concludes the portal is broken — and the retry is very likely to work,
 * since what failed is a single insert.
 */
export function aperturaNoRegistrada(): ApiFailure {
  return apiFailure(
    500,
    "apertura_no_registrada",
    "No pudimos registrar la apertura de este enlace, así que no lo abrimos. Vuelve a intentarlo; si sigue igual, avísale al Área de Innovación.",
  );
}
