import { mensajeDeError } from "@/lib/procesadores/mensajes";
import type { ProcesadorDTO } from "@/lib/procesadores/repository";
import { CAMPO_ARCHIVOS } from "@/lib/procesadores/servicio";

/**
 * The browser's side of `POST /api/procesadores/{id}/ejecutar`: what is sent,
 * what comes back, and how a file becomes a download.
 *
 * Separated from the component for the same reason as `mis-recursos-client.ts`
 * — every decision here is testable without rendering anything, and a component
 * that owns its own `fetch` is a component whose failure modes can only be
 * reached through the DOM.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SWR IS NOT USED HERE, AND THAT IS NOT AN OVERSIGHT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `mis-recursos-client.ts` predicted that "item #10 or #13 adds a second key
 * with the SAME needs" and that a provider would then be worth it. Item #10
 * turned out not to be that item. SWR caches and revalidates a GET whose answer
 * is a fact about the world; this is a POST that consumes a worker for up to
 * two minutes and produces a file. Nothing about it is cacheable, nothing about
 * it should be re-run when a tab regains focus, and running it twice is running
 * it twice. So the dashboard's SWR key is still the portal's only one, and the
 * provider is still not worth it.
 */

/** The contract the form is built from, as the row declares it. */
export interface ContratoUI {
  entradasMin: number;
  /** `null` is ADR 0002's "sin tope", not a limit of zero. */
  entradasMax: number | null;
  tamanoMax: number;
  tamanoMaxTotal: number | null;
  /** Already split and normalised; `procesador.formatos_aceptados` is one string. */
  formatos: readonly string[];
}

/** The row as it arrives from the server, reshaped into what the form needs. */
export function contratoDe(procesador: ProcesadorDTO): ContratoUI {
  return {
    entradasMin: procesador.entradasMin,
    entradasMax: procesador.entradasMax,
    tamanoMax: procesador.tamanoMax,
    tamanoMaxTotal: procesador.tamanoMaxTotal,
    formatos: procesador.formatosAceptados.split(",").filter((formato) => formato.length > 0),
  };
}

/**
 * The extension of a file name, as the service computes it.
 *
 * Deliberately identical to `_formato` in `app/recepcion.py`: split on the LAST
 * dot, lowercase, no leading dot, and an empty string when there is no dot at
 * all. A local check that classified `datos.tar.gz` differently from the service
 * would refuse an upload the service would have accepted — which is the one
 * direction this check must never fail in.
 */
export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf(".");

  return punto === -1 ? "" : nombre.slice(punto + 1).toLowerCase();
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS CHECK GRANTS NOTHING. IT ONLY SAVES AN UPLOAD.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The route deliberately does not validate files — it forwards them and lets
 * the service's common pipeline decide, because ADR 0006 puts enforcement there
 * and a second copy of a rule is a rule that drifts. Nothing about that changes
 * here. What the browser does is spend nothing to tell the reader something it
 * already knows: sending 25 MB over a corporate VPN to be told the file is a
 * PDF is two minutes the reader did not have to wait.
 *
 * SO THE ASYMMETRY IS THE POINT. A selection this function rejects is one the
 * service would certainly have rejected. A selection it accepts has been
 * granted nothing at all — the service still checks the count, the formats, the
 * per-file and combined sizes, the uncompressed size that no browser can see,
 * and the content rules that belong to the module. If this function ever
 * refuses something the service would have accepted, it is a bug in this
 * function, and the fix is to relax it rather than to make the service agree.
 *
 * THE ORDER MIRRORS THE PIPELINE — count, then format, then per-file size, then
 * the total — so the first thing the reader is told locally is the first thing
 * they would have been told remotely. And the sentences are not written here:
 * each branch builds the `contexto` the service would have sent and asks
 * `mensajeDeError` for the same words. Two detectors, one vocabulary.
 *
 * Returns `null` when there is nothing to say.
 */
export function revisarSeleccion(
  archivos: readonly File[],
  contrato: ContratoUI,
): string | null {
  const { entradasMin, entradasMax, tamanoMax, tamanoMaxTotal, formatos } = contrato;

  if (archivos.length < entradasMin || (entradasMax !== null && archivos.length > entradasMax)) {
    return mensajeDeError("cantidad", {
      minimo: entradasMin,
      /*
       * The service's `ContextoCantidad.maximo` is a plain int — it has a
       * contract with no nulls. An uncapped row can only fail this branch by
       * being under the minimum, and in that case the maximum is not part of
       * the sentence, so reporting the count itself keeps the message true.
       */
      maximo: entradasMax ?? archivos.length,
      recibido: archivos.length,
    });
  }

  /* Only when the row declares formats. An empty list is not "accept nothing". */
  if (formatos.length > 0) {
    for (const archivo of archivos) {
      const extension = extensionDe(archivo.name);

      if (!formatos.includes(extension)) {
        return mensajeDeError("formato", {
          archivo: archivo.name,
          formato_recibido: extension,
          formatos_aceptados: [...formatos],
        });
      }
    }
  }

  for (const archivo of archivos) {
    if (archivo.size > tamanoMax) {
      return mensajeDeError("tamano", {
        archivo: archivo.name,
        limite_bytes: tamanoMax,
        recibido_bytes: archivo.size,
      });
    }
  }

  const total = archivos.reduce((suma, archivo) => suma + archivo.size, 0);

  if (tamanoMaxTotal !== null && total > tamanoMaxTotal) {
    return mensajeDeError("tamano", {
      /* The batch shape: `archivos` and no `archivo`, so the sentence blames
         the set rather than any one file. */
      archivos: archivos.map((archivo) => archivo.name),
      limite_bytes: tamanoMaxTotal,
      recibido_bytes: total,
    });
  }

  return null;
}

/**
 * Shown when `fetch` itself rejects — no network, no server, a dropped
 * connection mid-upload. Same wording as the admin screens' `ERROR_DE_RED`,
 * because it is the same event from the reader's side.
 */
export const ERROR_DE_RED =
  "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.";

/**
 * Shown for a failing response the portal could not read a message out of.
 *
 * Every failing status this route can produce carries ADR 0003's
 * `{codigo, mensaje}`, so reaching this line means the answer did not come from
 * the route at all — a gateway's own error page, a truncated stream, a session
 * that expired into a redirect.
 */
const ERROR_SIN_MENSAJE =
  "No pudimos procesar tus archivos. Vuelve a intentarlo; si sigue igual, avisa al Área de " +
  "Innovación.";

export type ResultadoEnvio =
  | { readonly ok: true; readonly archivo: Blob; readonly nombre: string }
  | { readonly ok: false; readonly mensaje: string };

/** The name the download is saved under when the service named none. */
export const NOMBRE_POR_DEFECTO = "resultado";

/**
 * Reads the file name out of `Content-Disposition`.
 *
 * Starlette writes `filename="..."` for an ASCII name and adds the RFC 5987
 * `filename*=utf-8''...` form when the name has characters that do not survive
 * a quoted string — which, for a portal whose files are named in Spanish, is
 * the common case rather than the exotic one. The starred form wins when both
 * are present, exactly as the RFC says.
 *
 * The result is stripped of anything that looks like a path. A name is a name;
 * `download` treats separators as its own business, and a value that arrived
 * from a file somebody uploaded is not the place to find out how each browser
 * decided to interpret them.
 */
export function nombreDeDescarga(cabecera: string | null): string {
  if (!cabecera) {
    return NOMBRE_POR_DEFECTO;
  }

  const estrella = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(cabecera);
  const simple = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(cabecera);

  const crudo = estrella
    ? decodificar(estrella[1])
    : (simple?.[1] ?? simple?.[2] ?? "").trim();

  const limpio = crudo.replace(/[\\/]/g, "").trim();

  return limpio.length > 0 ? limpio : NOMBRE_POR_DEFECTO;
}

/** A percent-encoded name, or the raw value when it is not valid encoding. */
function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor.trim());
  } catch {
    return valor.trim();
  }
}

/** The message the route sent, or the fallback when there is none to read. */
function mensajeDe(cuerpo: unknown): string {
  if (typeof cuerpo === "object" && cuerpo !== null && "mensaje" in cuerpo) {
    const mensaje = (cuerpo as { mensaje: unknown }).mensaje;

    if (typeof mensaje === "string" && mensaje.length > 0) {
      return mensaje;
    }
  }

  return ERROR_SIN_MENSAJE;
}

/**
 * Sends the files and waits for the result.
 *
 * NO CLOCK HERE, DELIBERATELY. The route already aborts at two minutes and
 * answers a Spanish sentence saying so; a second timer in the browser would
 * either fire first — cutting an execution the server is still willing to
 * finish, and leaving its `evento_uso` row to be written for a file nobody
 * receives — or fire second and never be reached. One deadline, owned by the
 * side that can also stop the work.
 *
 * `FormData` and NOT a hand-built body: the browser generates the multipart
 * boundary and sets `Content-Type` with it. The field name is the portal's
 * shared constant, which `lib/procesadores/servicio.ts` explains at length —
 * the route forwards the body untouched, so this name is the name the service
 * reads.
 */
export async function ejecutarProcesador(
  id: number,
  archivos: readonly File[],
): Promise<ResultadoEnvio> {
  const cuerpo = new FormData();

  for (const archivo of archivos) {
    cuerpo.append(CAMPO_ARCHIVOS, archivo, archivo.name);
  }

  let response: Response;

  try {
    response = await fetch(`/api/procesadores/${id}/ejecutar`, { method: "POST", body: cuerpo });
  } catch {
    return { ok: false, mensaje: ERROR_DE_RED };
  }

  if (!response.ok) {
    return { ok: false, mensaje: mensajeDe(await response.json().catch(() => undefined)) };
  }

  /*
   * A 200 whose body cannot be read is not a success. Treating it as one would
   * hand the reader an empty file and a confirmation toast.
   */
  try {
    return {
      ok: true,
      archivo: await response.blob(),
      nombre: nombreDeDescarga(response.headers.get("content-disposition")),
    };
  } catch {
    return { ok: false, mensaje: ERROR_DE_RED };
  }
}

/**
 * Hands the file to the browser.
 *
 * An object URL and a synthetic anchor, because the file arrives as a body the
 * script already holds — there is no address to point a normal link at. The URL
 * is revoked immediately after the click: it keeps the whole blob alive in
 * memory for as long as it exists, and a screen that ran ten executions would
 * otherwise be holding ten results.
 *
 * The anchor is never attached to the layout. It exists for one synchronous
 * click inside a real user gesture, which is what keeps the download out of the
 * popup blocker's way.
 */
export function descargar(archivo: Blob, nombre: string): void {
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = "noopener";
  enlace.click();

  URL.revokeObjectURL(url);
}
