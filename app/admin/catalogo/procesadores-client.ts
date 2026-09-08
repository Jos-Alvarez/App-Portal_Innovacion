import { ERROR_INTERNO } from "@/lib/procesadores/errors";
import type { ProcesadorDTO } from "@/lib/procesadores/repository";
import type { ActualizarProcesador, CrearProcesador } from "@/lib/procesadores/schema";

/**
 * The browser's side of `/api/procesadores` — one function per administrative
 * action, and one shape for every answer.
 *
 * Same contract as `app/admin/catalogo/enlaces-client.ts`, and for the same
 * reasons: every action has the three outcomes (saved, refused, unreachable)
 * and the same unwrapping to do, so writing it once leaves the screen holding
 * only the decision of WHAT to send.
 *
 * NO MESSAGE IS WRITTEN HERE THAT THE API COULD HAVE WRITTEN. `lib/api/errors`
 * guarantees one envelope for every failing status code and documents `mensaje`
 * as the sentence shown to the reader as it stands, so it is forwarded
 * untouched.
 *
 * THE BODY IS SERIALISED WITH `JSON.stringify`, WHICH IS PART OF THE CONTRACT
 * HERE. It drops a key whose value is `undefined` and keeps one whose value is
 * `null`, and that is precisely the difference the PATCH handler reads: an
 * absent key leaves the column alone, a present `null` removes a cap.
 */

/** The collection route of ADR 0003. The item routes hang off it. */
const RUTA = "/api/procesadores";

/**
 * The one sentence this module owns, because it is the one failure the API
 * cannot answer for: the request never reached it.
 */
export const ERROR_DE_RED =
  "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.";

/** What an action gives back: the saved row, or a sentence to show. */
export type ResultadoProcesador =
  | { readonly ok: true; readonly procesador: ProcesadorDTO }
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

/** The `{ procesador }` a successful response wraps, when it really carries one. */
function procesadorDe(cuerpo: unknown): ProcesadorDTO | null {
  if (typeof cuerpo === "object" && cuerpo !== null && "procesador" in cuerpo) {
    const procesador = (cuerpo as { procesador: unknown }).procesador;
    if (typeof procesador === "object" && procesador !== null) return procesador as ProcesadorDTO;
  }

  return null;
}

async function pedir(ruta: string, init: RequestInit): Promise<ResultadoProcesador> {
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

  const procesador = procesadorDe(cuerpo);

  /* A 2xx with nothing usable in it is still a failure to the screen: reporting
     success would show a confirmation toast for a row nobody saved. */
  return procesador === null
    ? { ok: false, mensaje: ERROR_INTERNO.error.mensaje }
    : { ok: true, procesador };
}

function conCuerpo(method: string, datos: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  };
}

/** Alta — `POST /api/procesadores`, carrying the whole execution contract. */
export function crearProcesador(datos: CrearProcesador): Promise<ResultadoProcesador> {
  return pedir(RUTA, conCuerpo("POST", datos));
}

/** Edición — `PATCH /api/procesadores/{id}`, carrying only the fields that moved. */
export function editarProcesador(
  id: number,
  cambios: ActualizarProcesador,
): Promise<ResultadoProcesador> {
  return pedir(`${RUTA}/${id}`, conCuerpo("PATCH", cambios));
}

/** Baja — `DELETE /api/procesadores/{id}`. The row survives; the flag does not. */
export function darDeBajaProcesador(id: number): Promise<ResultadoProcesador> {
  return pedir(`${RUTA}/${id}`, { method: "DELETE" });
}

/**
 * The undo of the baja.
 *
 * It rides on the edit rather than on a verb of its own because `activo` is
 * exactly the field `actualizarProcesadorSchema` accepts for it — the schema's
 * own comment says the flag is editable precisely so an accidental baja stays
 * recoverable through the product.
 */
export function restaurarProcesador(id: number): Promise<ResultadoProcesador> {
  return editarProcesador(id, { activo: true });
}
