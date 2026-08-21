/**
 * What the processing service just said, as a value the rest of the portal can
 * branch on.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE STATUS CODE IS NOT ENOUGH, AND THAT IS THE WHOLE REASON THIS EXISTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The service answers 422 for two entirely different situations, and the only
 * thing that tells them apart is whether the body has a `tipo` in it:
 *
 *   422 + {"tipo": ..., "contexto": {...}}  a typed error — the collaborator's
 *                                           files were refused for a reason
 *                                           they can act on
 *   422 + <empty body>                      the REQUEST was malformed
 *                                           (`app/core/validacion_http.py`) —
 *                                           the portal built it wrong, and the
 *                                           collaborator can do nothing
 *
 * The same split exists at 500: `clave_inexistente` arrives as a typed body,
 * while a crashed module, a dead child process and a malformed output set all
 * arrive as a bare 500 (`app/core/fallos_http.py`, which documents the empty
 * body as deliberate — the Python traceback must never reach a client).
 *
 * A handler that mapped on status alone would tell a collaborator to fix their
 * file when the portal is the thing that is broken. So the body is parsed, and
 * the outcome is a discriminated union rather than a number.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NOTHING HERE PRODUCES USER-FACING TEXT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This module decides WHAT HAPPENED. `ejecucion-errores.ts` decides what the
 * reader is told and which `evento_uso` row is written. The split is what lets
 * every branch below be tested against a real `Response` object with no Spanish
 * copy in sight, and every message be tested with no HTTP at all.
 */

/**
 * ADR 0014's closed vocabulary, verified against `app/core/errores.py`:
 * `TipoError` is a `StrEnum` with exactly these five members, and the service's
 * own docstring calls adding a sixth "cuatro ediciones coordinadas".
 *
 * Mirrored here rather than imported, because the two repositories share no
 * code (ADR 0004: "los tipos no se comparten entre portal y servicio"). The
 * mirror is narrow on purpose: an unrecognised `tipo` is not accepted as typed,
 * it degrades to `respuesta_inesperada`, so a service that grows a sixth member
 * makes the portal say "something went wrong" instead of silently misfiling it
 * as one of these five.
 */
export const TIPOS_ERROR_SERVICIO = [
  "formato",
  "tamano",
  "contenido",
  "cantidad",
  "clave_inexistente",
] as const;

export type TipoErrorServicio = (typeof TIPOS_ERROR_SERVICIO)[number];

/**
 * The `contexto` object of a typed error, as far as the portal is willing to
 * commit to it.
 *
 * DELIBERATELY LOOSE. The service's `Contexto` is a union of seven `TypedDict`s
 * and two of the five error types carry more than one shape — `tamano` is
 * either per-file or per-batch, `contenido` is either a bad file or no output at
 * all. Restating that union here would create a second definition of a contract
 * this repository does not own, and the message builder has to tolerate a
 * missing field anyway: the portal must not throw because the service added a
 * key. So every field is optional, and `ejecucion-errores.ts` reads what it
 * finds and falls back to a generic sentence when it finds nothing.
 */
export interface ContextoServicio {
  /** `formato`, `tamano` (single file), `contenido`. */
  archivo?: string;
  /** `tamano` (batch). */
  archivos?: string[];
  /** `formato`. */
  formato_recibido?: string;
  formatos_aceptados?: string[];
  /** `tamano`, both shapes. */
  limite_bytes?: number;
  recibido_bytes?: number;
  /** `contenido`: "columna_faltante" | "cero_filas" | "sin_salidas". */
  motivo?: string;
  columna?: string | null;
  /** `cantidad`. */
  minimo?: number;
  maximo?: number;
  recibido?: number;
  /** `clave_inexistente`. */
  clave_procesador?: string;
  causa?: string;
}

/**
 * Everything that is not a typed error and not a file.
 *
 * Each member is a distinct thing that went wrong, and they are kept apart
 * because the reader is told something different for each — see
 * `ejecucion-errores.ts`. They are NOT collapsed into "error" because the
 * difference between "the service is busy, try again in a moment" and "this
 * processor is not installed, tell Innovación" is the whole difference between
 * a reader who retries and a reader who reports.
 */
export type MotivoInfraestructura =
  /** 401. The portal's own token is wrong or missing. Never the reader's fault. */
  | "no_autenticado"
  /** 422 with no body: the portal built a request the service could not parse. */
  | "peticion_invalida"
  /** 503: the service's bounded concurrency window is full (`AdmisionDeBorde`). */
  | "saturado"
  /** 504 from the service, or the portal's own 2-minute clock firing. */
  | "expirado"
  /** 500 with no body: the module crashed, the child died, or packaging failed. */
  | "fallo_interno"
  /** The connection never produced an answer: DNS, refused, reset, no route. */
  | "inalcanzable"
  /** A status or body this portal has no mapping for. */
  | "respuesta_inesperada";

export type ResultadoEjecucion =
  /** The service produced a file. `respuesta` still holds its unread body. */
  | { readonly clase: "exito"; readonly respuesta: Response }
  | {
      readonly clase: "tipificado";
      readonly tipo: TipoErrorServicio;
      readonly contexto: ContextoServicio;
    }
  | { readonly clase: "infraestructura"; readonly motivo: MotivoInfraestructura };

function esTipoConocido(valor: unknown): valor is TipoErrorServicio {
  return (
    typeof valor === "string" && (TIPOS_ERROR_SERVICIO as readonly string[]).includes(valor)
  );
}

/** The typed envelope, or `null` for a body that is empty, not JSON, or not one. */
async function envelopeTipificado(
  respuesta: Response,
): Promise<{ tipo: TipoErrorServicio; contexto: ContextoServicio } | null> {
  /* `.catch` and not a try/block: an empty body is the NORMAL case for three of
     the statuses handled below, not an exception worth a stack trace. */
  const cuerpo = await respuesta.json().catch(() => undefined);

  if (typeof cuerpo !== "object" || cuerpo === null || !("tipo" in cuerpo)) {
    return null;
  }

  const { tipo, contexto } = cuerpo as { tipo: unknown; contexto?: unknown };

  if (!esTipoConocido(tipo)) {
    return null;
  }

  return {
    tipo,
    /* A typed error with no context is still a typed error: the reader gets the
       generic sentence for that type instead of the specific one. */
    contexto:
      typeof contexto === "object" && contexto !== null ? (contexto as ContextoServicio) : {},
  };
}

function infraestructura(motivo: MotivoInfraestructura): ResultadoEjecucion {
  return { clase: "infraestructura", motivo };
}

/**
 * Reads the service's answer.
 *
 * THE SUCCESS BRANCH DOES NOT TOUCH THE BODY. `respuesta` is returned with its
 * stream unread so the route can pipe it straight to the browser; consuming it
 * here to "check" it would mean buffering the whole file to prove it exists.
 *
 * Every failure branch, by contrast, reads the body — it is at most a small
 * JSON object, and reading it is the only way to tell the two 422s apart.
 */
export async function interpretarRespuesta(respuesta: Response): Promise<ResultadoEjecucion> {
  if (respuesta.ok) {
    return { clase: "exito", respuesta };
  }

  switch (respuesta.status) {
    case 401:
      return infraestructura("no_autenticado");

    case 503:
      return infraestructura("saturado");

    case 504:
      return infraestructura("expirado");

    /*
     * The two statuses that carry a typed body — and that also arrive empty.
     * They share a branch because the decision is identical: believe the body if
     * there is one, fall back to the status if there is not.
     */
    case 422:
    case 500: {
      const envelope = await envelopeTipificado(respuesta);

      if (envelope) {
        return { clase: "tipificado", tipo: envelope.tipo, contexto: envelope.contexto };
      }

      return infraestructura(respuesta.status === 422 ? "peticion_invalida" : "fallo_interno");
    }

    default:
      return infraestructura("respuesta_inesperada");
  }
}

/**
 * Reads a `fetch` that never produced a response at all.
 *
 * The distinction is `AbortSignal.timeout`, which rejects with a `TimeoutError`
 * — and a real user abort, which rejects with an `AbortError`. Both mean the
 * portal stopped waiting, and both reach the reader as the same sentence;
 * anything else means the service was never reached.
 *
 * `name` and not `instanceof DOMException`: the suite runs in Node and in jsdom,
 * and the class identity of a `DOMException` is not stable across them, while
 * the name is part of the web standard.
 */
export function interpretarFallo(error: unknown): ResultadoEjecucion {
  const nombre = error instanceof Error ? error.name : "";

  if (nombre === "TimeoutError" || nombre === "AbortError") {
    return infraestructura("expirado");
  }

  return infraestructura("inalcanzable");
}
