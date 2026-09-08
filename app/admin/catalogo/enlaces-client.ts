import { ERROR_INTERNO } from "@/lib/enlaces/errors";
import type { EnlaceDTO } from "@/lib/enlaces/repository";
import type { ActualizarEnlace, CrearEnlace } from "@/lib/enlaces/schema";

/**
 * The browser's side of `/api/enlaces` — one function per administrative
 * action, and one shape for every answer.
 *
 * Every action has the same three outcomes (saved, refused, unreachable) and
 * the same unwrapping to do, so writing it once leaves the screen holding only
 * the decision of WHAT to send, and makes this contract testable without
 * rendering anything.
 *
 * NO MESSAGE IS WRITTEN HERE THAT THE API COULD HAVE WRITTEN. `lib/api/errors`
 * guarantees one envelope for every failing status code and documents `mensaje`
 * as the sentence shown to the reader as it stands, so it is forwarded
 * untouched; rewording it here would be a second copy of the copy.
 */

/** The collection route of ADR 0003. The item routes hang off it. */
const RUTA = "/api/enlaces";

/**
 * The one sentence this module owns, because it is the one failure the API
 * cannot answer for: the request never reached it. Everything else — a 400, a
 * 404, a 409, a 500 — already arrives carrying its own Spanish message.
 */
export const ERROR_DE_RED =
  "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.";

/**
 * What an action gives back: the saved row, or a sentence to show. Deliberately
 * not a thrown error — every caller has to render the failure anyway, and a
 * result the type system forces you to open is harder to forget than a `catch`.
 */
export type ResultadoEnlace =
  | { readonly ok: true; readonly enlace: EnlaceDTO }
  | { readonly ok: false; readonly mensaje: string };

/** The failure envelope's `mensaje`, when the body actually is one. */
function mensajeDe(cuerpo: unknown): string {
  if (typeof cuerpo === "object" && cuerpo !== null && "mensaje" in cuerpo) {
    const mensaje = (cuerpo as { mensaje: unknown }).mensaje;
    if (typeof mensaje === "string" && mensaje.length > 0) return mensaje;
  }

  /*
   * A failing response whose body is not the envelope: a proxy timing out, a
   * gateway page, a truncated stream. Reusing ERROR_INTERNO's own wording keeps
   * the reader's experience identical to the 500 they would otherwise have got.
   */
  return ERROR_INTERNO.error.mensaje;
}

/** The `{ enlace }` a successful response wraps, when it really carries one. */
function enlaceDe(cuerpo: unknown): EnlaceDTO | null {
  if (typeof cuerpo === "object" && cuerpo !== null && "enlace" in cuerpo) {
    const enlace = (cuerpo as { enlace: unknown }).enlace;
    if (typeof enlace === "object" && enlace !== null) return enlace as EnlaceDTO;
  }

  return null;
}

async function pedir(ruta: string, init: RequestInit): Promise<ResultadoEnlace> {
  let response: Response;

  try {
    response = await fetch(ruta, init);
  } catch {
    /* No status, no body: the server was never reached. */
    return { ok: false, mensaje: ERROR_DE_RED };
  }

  const cuerpo = await response.json().catch(() => undefined);

  if (!response.ok) {
    return { ok: false, mensaje: mensajeDe(cuerpo) };
  }

  const enlace = enlaceDe(cuerpo);

  /*
   * A 2xx with nothing usable in it is still a failure to the screen: reporting
   * success here would show a confirmation toast for a row nobody saved.
   */
  return enlace === null ? { ok: false, mensaje: ERROR_INTERNO.error.mensaje } : { ok: true, enlace };
}

function conCuerpo(method: string, datos: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  };
}

/** Alta — `POST /api/enlaces`. */
export function crearEnlace(datos: CrearEnlace): Promise<ResultadoEnlace> {
  return pedir(RUTA, conCuerpo("POST", datos));
}

/** Edición — `PATCH /api/enlaces/{id}`, carrying only what the form collected. */
export function editarEnlace(id: number, cambios: ActualizarEnlace): Promise<ResultadoEnlace> {
  return pedir(`${RUTA}/${id}`, conCuerpo("PATCH", cambios));
}

/** Baja — `DELETE /api/enlaces/{id}`. The row survives; the flag does not. */
export function darDeBajaEnlace(id: number): Promise<ResultadoEnlace> {
  return pedir(`${RUTA}/${id}`, { method: "DELETE" });
}

/**
 * The undo of the baja.
 *
 * It rides on the edit rather than on a verb of its own because `activo` is
 * exactly the field `actualizarEnlaceSchema` accepts for it — the schema's own
 * comment says the flag is editable precisely so an accidental baja stays
 * recoverable through the product.
 */
export function restaurarEnlace(id: number): Promise<ResultadoEnlace> {
  return editarEnlace(id, { activo: true });
}
