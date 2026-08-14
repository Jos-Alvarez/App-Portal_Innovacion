import { ERROR_INTERNO, type RecursoTipo } from "@/lib/asignaciones/errors";

/**
 * The browser's side of `/api/usuarios/{id}/asignaciones` — one function per
 * verb, and one shape for every answer.
 *
 * Same contract as `app/admin/enlaces/enlaces-client.ts` and its procesadores
 * sibling: every action has the three outcomes (done, refused, unreachable) and
 * the same unwrapping to do, so writing it once leaves the screen holding only
 * the decision of WHAT to send. No message is written here that the API could
 * have written — `mensaje` is forwarded untouched.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ANSWER IS READ, NEVER ASSUMED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `asignado` comes out of the response body. It would be trivial — and wrong —
 * to return `true` from `asignarRecurso` on any 2xx, because that is the intent
 * that was SENT and not the state that IS. ADR 0007 stakes the whole
 * authorization design on the server being the only truth about a grant; this
 * function is the narrowest place that promise can be broken, so it is the
 * place that keeps it. A screen built on this can only draw a switch from
 * something the server said.
 *
 * Nothing travels in a body: an assignment row has no columns beyond its
 * composite key, so the two identifiers in the path are the entire request.
 */

/** The route family of ADR 0003. The user's id and the resource's complete it. */
const RUTA = "/api/usuarios";

/** How each resource type is spelled in the URL: singular in code, plural in the path. */
const SEGMENTO: Record<RecursoTipo, string> = {
  enlace: "enlaces",
  procesador: "procesadores",
};

/**
 * The one sentence this module owns, because it is the one failure the API
 * cannot answer for: the request never reached it.
 */
export const ERROR_DE_RED =
  "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.";

/** What a toggle gives back: the grant as the server now reports it, or a sentence to show. */
export type ResultadoAsignacion =
  | { readonly ok: true; readonly asignado: boolean }
  | { readonly ok: false; readonly mensaje: string };

/** The failure envelope's `mensaje`, when the body actually is one. */
function mensajeDe(cuerpo: unknown): string {
  if (typeof cuerpo === "object" && cuerpo !== null && "mensaje" in cuerpo) {
    const mensaje = (cuerpo as { mensaje: unknown }).mensaje;
    if (typeof mensaje === "string" && mensaje.length > 0) return mensaje;
  }

  /* A failing response whose body is not the envelope: a proxy timing out, a
     gateway page, a truncated stream. Reusing ERROR_INTERNO's wording keeps the
     reader's experience identical to the 500 they would otherwise have got. */
  return ERROR_INTERNO.error.mensaje;
}

/** The `{ asignacion: { asignado } }` a successful response wraps, when it really carries one. */
function asignadoDe(cuerpo: unknown): boolean | null {
  if (typeof cuerpo !== "object" || cuerpo === null || !("asignacion" in cuerpo)) return null;

  const asignacion = (cuerpo as { asignacion: unknown }).asignacion;
  if (typeof asignacion !== "object" || asignacion === null || !("asignado" in asignacion)) {
    return null;
  }

  const asignado = (asignacion as { asignado: unknown }).asignado;
  return typeof asignado === "boolean" ? asignado : null;
}

async function pedir(
  usuarioId: number,
  tipo: RecursoTipo,
  recursoId: number,
  method: "PUT" | "DELETE",
): Promise<ResultadoAsignacion> {
  let response: Response;

  try {
    response = await fetch(`${RUTA}/${usuarioId}/asignaciones/${SEGMENTO[tipo]}/${recursoId}`, {
      method,
    });
  } catch {
    /* No status, no body: the server was never reached. */
    return { ok: false, mensaje: ERROR_DE_RED };
  }

  const cuerpo = await response.json().catch(() => undefined);

  if (!response.ok) {
    return { ok: false, mensaje: mensajeDe(cuerpo) };
  }

  /* A 2xx with nothing usable in it is still a failure to the screen: moving a
     switch on it would show an access nobody can prove exists. */
  const asignado = asignadoDe(cuerpo);

  return asignado === null
    ? { ok: false, mensaje: ERROR_INTERNO.error.mensaje }
    : { ok: true, asignado };
}

/** Grants the resource. Idempotent at the API: a repeat answers the same 200. */
export function asignarRecurso(
  usuarioId: number,
  tipo: RecursoTipo,
  recursoId: number,
): Promise<ResultadoAsignacion> {
  return pedir(usuarioId, tipo, recursoId, "PUT");
}

/** Removes the grant. Idempotent in the same way, and allowed over a baja. */
export function revocarRecurso(
  usuarioId: number,
  tipo: RecursoTipo,
  recursoId: number,
): Promise<ResultadoAsignacion> {
  return pedir(usuarioId, tipo, recursoId, "DELETE");
}
