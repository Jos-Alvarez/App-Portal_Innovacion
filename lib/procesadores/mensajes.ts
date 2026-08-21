import type { ContextoServicio, TipoErrorServicio } from "@/lib/procesadores/resultado";
import { enMegabytes } from "@/lib/procesadores/tamanos";

/**
 * Every sentence the portal writes about a refused execution, in one place.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SERVICE SENDS NO MESSAGES, ON PURPOSE, AND THAT IS THIS MODULE'S JOB
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A typed error arrives as `{"tipo": "formato", "contexto": {...}}` and nothing
 * else — no `mensaje`, no `detail`, not one word of Spanish. The service is
 * deliberately mute: its handlers construct bodies with structured facts and
 * never prose, and its non-typed failures answer with an empty body so a Python
 * traceback can never reach a browser.
 *
 * So every sentence is written here, from the facts in `contexto`. DESIGN.md
 * asks for "banner rojo con título 700 + motivo específico (formato / tamaño /
 * contenido) + Reintentar", and "motivo específico" is the whole point: "el
 * archivo no es válido" is not a motivo, "al archivo «ventas.xlsx» le falta la
 * columna «Fecha»" is. That is why each branch reads the context rather than
 * mapping the type to a fixed string.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS A MODULE OF ITS OWN, AND WHY IT IMPORTS NO HTTP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TWO DETECTORS, ONE VOCABULARY. The service is not the only thing that can
 * notice that a file is the wrong format: the upload form knows the same
 * contract — it is built from the same `procesador` row — and checks the
 * selection before spending a 25 MB upload to be told what it could have said
 * immediately.
 *
 * The two must say the SAME sentence. A local "formato no permitido" that reads
 * differently from the one the service produces teaches the reader that the two
 * are different problems. So the browser's check does not write its own copy: it
 * builds the `contexto` the service would have sent and calls the same function
 * the route calls.
 *
 * That is why this module imports nothing from `next/server`. Its sibling
 * `ejecucion-errores.ts` maps these messages onto HTTP statuses and
 * `evento_uso` rows and therefore pulls in `NextResponse`; a client component
 * importing that would drag the server runtime into the browser bundle. Pure
 * text here, HTTP next door.
 *
 * EVERY BRANCH DEGRADES. `contexto` is data from another repository, released
 * on its own schedule; a missing field must produce a vaguer sentence, never a
 * thrown TypeError inside an error handler. So each builder checks what it
 * needs and falls back to the type's generic sentence when it is not there.
 */

/** `«ventas.xlsx»`, or nothing at all when no file was named. */
function citar(valor: string | undefined): string | null {
  const limpio = (valor ?? "").trim();

  return limpio.length > 0 ? `«${limpio}»` : null;
}

/** `xlsx, csv` — normalised and lowercased by whoever produced the list. */
function lista(valores: string[] | undefined): string | null {
  const limpios = (valores ?? []).filter((valor) => typeof valor === "string" && valor.length > 0);

  return limpios.length > 0 ? limpios.join(", ") : null;
}

function esNumero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

const FORMATO_GENERICO =
  "Uno de los archivos tiene un formato que este procesador no acepta. Revisa los formatos " +
  "permitidos y vuelve a intentarlo.";

function mensajeFormato(contexto: ContextoServicio): string {
  const archivo = citar(contexto.archivo);
  const aceptados = lista(contexto.formatos_aceptados);
  const recibido = (contexto.formato_recibido ?? "").trim();

  if (!archivo || !aceptados) {
    return FORMATO_GENERICO;
  }

  /* The extension travels with no dot; the reader recognises it with one, and
     a file named without an extension at all is a real case. */
  const suEs = recibido.length > 0 ? `es .${recibido}` : "no tiene extensión";

  return (
    `El archivo ${archivo} ${suEs} y este procesador solo acepta ${aceptados}. ` +
    "Cambia el archivo y vuelve a intentarlo."
  );
}

const TAMANO_GENERICO =
  "Los archivos superan el tamaño que admite este procesador. Reduce su tamaño y vuelve a " +
  "intentarlo.";

/**
 * One type, two context shapes — the service's `ErrorTamano` carries either a
 * single guilty file or the whole batch, and its ADR 0021 is explicit that they
 * are siblings rather than one extending the other. The reader is told two
 * different things because two different things went wrong: shrink THIS file,
 * or send FEWER files.
 */
function mensajeTamano(contexto: ContextoServicio): string {
  if (!esNumero(contexto.limite_bytes) || !esNumero(contexto.recibido_bytes)) {
    return TAMANO_GENERICO;
  }

  const limite = enMegabytes(contexto.limite_bytes);
  const recibido = enMegabytes(contexto.recibido_bytes);
  const archivo = citar(contexto.archivo);

  if (archivo) {
    return (
      `El archivo ${archivo} pesa ${recibido} y el máximo por archivo es ${limite}. ` +
      "Reduce el archivo y vuelve a intentarlo."
    );
  }

  if (Array.isArray(contexto.archivos)) {
    return (
      `Los archivos suman ${recibido} y el máximo por ejecución es ${limite}. ` +
      "Envía menos archivos o reemplázalos por otros más livianos."
    );
  }

  return TAMANO_GENERICO;
}

const CONTENIDO_GENERICO =
  "El contenido de uno de los archivos no es el que este procesador espera. Revísalo y vuelve a " +
  "intentarlo.";

function mensajeContenido(contexto: ContextoServicio): string {
  /*
   * `sin_salidas` is the sibling shape: the module ran to completion and
   * produced nothing, so there is no guilty file to name. The service files it
   * under `contenido` and it stays there — the input is what decided it.
   */
  if (contexto.motivo === "sin_salidas") {
    return (
      "El procesador no generó ningún archivo con lo que enviaste. Revisa el contenido y vuelve " +
      "a intentarlo; si sigue igual, avisa al Área de Innovación."
    );
  }

  const archivo = citar(contexto.archivo);

  if (!archivo) {
    return CONTENIDO_GENERICO;
  }

  if (contexto.motivo === "cero_filas") {
    return `El archivo ${archivo} no tiene filas para procesar. Revisa su contenido y vuelve a intentarlo.`;
  }

  if (contexto.motivo === "columna_faltante") {
    const columna = citar(contexto.columna ?? undefined);

    return columna
      ? `Al archivo ${archivo} le falta la columna ${columna}. Corrígelo y vuelve a intentarlo.`
      : `Al archivo ${archivo} le falta una columna obligatoria. Corrígelo y vuelve a intentarlo.`;
  }

  return CONTENIDO_GENERICO;
}

const CANTIDAD_GENERICO =
  "La cantidad de archivos no es la que este procesador admite. Ajusta la selección y vuelve a " +
  "intentarlo.";

function mensajeCantidad(contexto: ContextoServicio): string {
  const { minimo, maximo, recibido } = contexto;

  if (!esNumero(minimo) || !esNumero(maximo) || !esNumero(recibido)) {
    return CANTIDAD_GENERICO;
  }

  const admite =
    minimo === maximo
      ? `exactamente ${minimo} ${minimo === 1 ? "archivo" : "archivos"}`
      : `entre ${minimo} y ${maximo} archivos`;

  return (
    `Este procesador admite ${admite} y enviaste ${recibido}. ` +
    "Ajusta la selección y vuelve a intentarlo."
  );
}

/**
 * The row exists in SQL Server and its `clave_procesador` matches no module in
 * the service's registry — the desync ADR 0006 accepts as designed debt and
 * requires to fail with "un error claro" rather than a generic 500.
 *
 * Addressed to the reader and not to their files: nothing they change about the
 * upload would help, so the sentence names who fixes it instead of asking them
 * to try something.
 */
const CLAVE_INEXISTENTE =
  "Este procesador todavía no está disponible en el servicio de procesamiento. Avisa al Área de " +
  "Innovación para que lo habilite.";

const POR_TIPO: Record<TipoErrorServicio, (contexto: ContextoServicio) => string> = {
  formato: mensajeFormato,
  tamano: mensajeTamano,
  contenido: mensajeContenido,
  cantidad: mensajeCantidad,
  clave_inexistente: () => CLAVE_INEXISTENTE,
};

/**
 * The sentence for one typed error.
 *
 * A `Record` over the full union and not a `switch`, so a sixth member of
 * `TipoErrorServicio` is a compile error here rather than an `undefined`
 * rendered into a banner.
 */
export function mensajeDeError(tipo: TipoErrorServicio, contexto: ContextoServicio): string {
  return POR_TIPO[tipo](contexto);
}
