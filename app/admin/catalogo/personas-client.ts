import type { OrigenBusqueda, PersonaEncontrada } from "@/lib/admins/busqueda";
import { ERROR_INTERNO } from "@/lib/personas/errors";
import type { UsuarioRegistradoDTO } from "@/lib/usuarios/repository";

/**
 * The browser's side of `/api/personas` — the type-ahead behind the "Asignar"
 * dialog and the pre-registration it needs.
 *
 * Same contract as `enlaces-client.ts` and `asignaciones-client.ts`: three
 * outcomes (answered, refused, unreachable), one shape, and no message written
 * here that the API could have written — `mensaje` is forwarded untouched.
 *
 * THE SEARCH TAKES AN `AbortSignal`, and it is not a nicety. A type-ahead fires
 * a request per keystroke, and without cancellation the answers race: the reply
 * to "she" can land after the reply to "sheyla" and repaint the list with the
 * wider result. The caller aborts the previous request before starting the
 * next, so only the newest one can ever resolve.
 */

const RUTA = "/api/personas";

/**
 * The one sentence this module owns, because it is the one failure the API
 * cannot answer for: the request never reached it.
 */
export const ERROR_DE_RED =
  "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.";

/** The search's answer: who matched and which source said so, or a sentence. */
export type ResultadoPersonas =
  | { readonly ok: true; readonly origen: OrigenBusqueda; readonly personas: PersonaEncontrada[] }
  | { readonly ok: false; readonly mensaje: string }
  /* The caller started a newer search; this one has nothing to say. */
  | { readonly ok: false; readonly cancelada: true; readonly mensaje: string };

/** The pre-registration's answer: the account, now certain to exist. */
export type ResultadoRegistro =
  | { readonly ok: true; readonly usuario: UsuarioRegistradoDTO }
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

/** The `{ origen, personas }` a successful search wraps, when it really does. */
function resultadoDe(cuerpo: unknown): { origen: OrigenBusqueda; personas: PersonaEncontrada[] } | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  if (!("origen" in cuerpo) || !("personas" in cuerpo)) return null;

  const { origen, personas } = cuerpo as { origen: unknown; personas: unknown };
  if (origen !== "directorio" && origen !== "portal") return null;
  if (!Array.isArray(personas)) return null;

  return { origen, personas: personas as PersonaEncontrada[] };
}

/**
 * Everybody in the company — or, when Graph cannot be reached, everybody who
 * has already signed in — matching what was typed.
 *
 * `origen` travels to the screen and must: in the degraded mode a colleague who
 * has never signed in simply is not there, and without being told why, the
 * honest conclusion — "that person does not work here" — is the wrong one.
 */
export async function buscarColaboradores(
  termino: string,
  signal?: AbortSignal,
): Promise<ResultadoPersonas> {
  let response: Response;

  try {
    response = await fetch(`${RUTA}?q=${encodeURIComponent(termino)}`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, cancelada: true, mensaje: "" };
    }

    /* No status, no body: the server was never reached. */
    return { ok: false, mensaje: ERROR_DE_RED };
  }

  const cuerpo = await response.json().catch(() => undefined);

  if (!response.ok) {
    return { ok: false, mensaje: mensajeDe(cuerpo) };
  }

  const resultado = resultadoDe(cuerpo);

  return resultado === null
    ? { ok: false, mensaje: ERROR_INTERNO.error.mensaje }
    : { ok: true, ...resultado };
}

/**
 * Makes sure the portal has an account for this address, and gives back its id.
 *
 * Idempotent at the API: somebody who has already signed in comes back
 * unchanged, so the caller never has to know whether they were there.
 */
export async function registrarPersona(persona: {
  correo: string;
  nombre?: string;
  area?: string;
}): Promise<ResultadoRegistro> {
  let response: Response;

  try {
    response = await fetch(RUTA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(persona),
    });
  } catch {
    return { ok: false, mensaje: ERROR_DE_RED };
  }

  const cuerpo = await response.json().catch(() => undefined);

  if (!response.ok) {
    return { ok: false, mensaje: mensajeDe(cuerpo) };
  }

  if (typeof cuerpo === "object" && cuerpo !== null && "usuario" in cuerpo) {
    const usuario = (cuerpo as { usuario: unknown }).usuario;
    if (typeof usuario === "object" && usuario !== null && "id" in usuario) {
      return { ok: true, usuario: usuario as UsuarioRegistradoDTO };
    }
  }

  /* A 2xx with no account in it: there is no id to hang a grant on. */
  return { ok: false, mensaje: ERROR_INTERNO.error.mensaje };
}
