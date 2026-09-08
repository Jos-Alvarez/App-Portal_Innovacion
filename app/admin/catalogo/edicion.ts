import type { ProcesadorDTO } from "@/lib/procesadores/repository";
import type { ActualizarProcesador } from "@/lib/procesadores/schema";

/**
 * The two things this form has to do that the API's contract does not: speak
 * megabytes, and describe an edit as only what moved.
 *
 * They are one module because they are one safety property. `lib/procesadores`
 * stores both sizes in BYTES — the unit the FastAPI pipeline compares against —
 * and no administrator types 26214400, so the boxes on screen hold megabytes and
 * this module converts on the way in and on the way out.
 *
 * THE CONVERSION IS LOSSY IN ONE DIRECTION, AND THAT IS SAFE ONLY BECAUSE OF
 * THE DIFF. A stored size that is not a whole number of megabytes is shown
 * rounded to two decimals (≈ 10 KB of precision, which is enough to recognise
 * the value without filling the box with digits). Written back, that rounding
 * would not land on the byte count it came from. It never gets written back:
 * `cambiosDelProcesador` compares the parsed form against the stored row and
 * emits only the fields that differ, so a size nobody touched is not in the
 * PATCH body at all and the column keeps its exact value. Whoever later makes
 * this form send everything on screen: that is what breaks the conversion.
 *
 * When the administrator DOES edit a size, what gets stored is exactly what
 * they typed — megabytes × 1 048 576, rounded to the whole byte the INT column
 * holds.
 */

/** A megabyte as the sizes are meant here: 2²⁰ bytes, the binary MiB. */
const BYTES_POR_MB = 1024 * 1024;

/** How many decimals a size is shown with. 0.01 MB ≈ 10 KB. */
const DECIMALES = 2;

/**
 * A stored size, as the form shows it.
 *
 * The fallback to the exact quotient covers sizes under ~5 KB, which two
 * decimals would render as a flat "0" — a size nobody could have typed, and one
 * the schema refuses. Division by a power of two always terminates, so the
 * exact form is finite even when it is long.
 */
export function bytesAMegabytes(bytes: number): string {
  const megabytes = bytes / BYTES_POR_MB;
  const factor = 10 ** DECIMALES;
  const redondeado = Math.round(megabytes * factor) / factor;

  return String(redondeado === 0 && megabytes > 0 ? megabytes : redondeado);
}

/**
 * What was typed in a size box, as the bytes the column stores.
 *
 * NaN and not `null` for an unreadable value, deliberately: `null` is a real
 * value in `tamano_max_total` — ADR 0002's "sin tope" — and returning it for
 * a typo would turn "veinticinco" into "no cap", which is a silent change of
 * meaning. `z.number()` refuses NaN, so garbage arrives at the reader as the
 * field's own Spanish message instead.
 *
 * The decimal comma is accepted because it is how a size is written in Spanish;
 * a zero is passed through so the schema can answer about the SIZE rather than
 * about the type.
 */
export function megabytesABytes(texto: string): number {
  const normalizado = texto.trim().replace(",", ".");

  if (!/^\d+(\.\d+)?$/.test(normalizado)) return NaN;

  return Math.round(Number(normalizado) * BYTES_POR_MB);
}

/**
 * What was typed in a count box, as a whole number of files.
 *
 * Digits only: "2.5" is not half a file, and accepting it would store a
 * truncated count the administrator never asked for.
 */
export function aEntero(texto: string): number {
  const normalizado = texto.trim();

  return /^\d+$/.test(normalizado) ? Number(normalizado) : NaN;
}

/**
 * The PATCH body: the stored row subtracted from what the form now holds.
 *
 * `null` is emitted as a PRESENT key whenever a cap was removed, because the
 * API reads an absent key as "leave this column alone" — the exact opposite of
 * what clearing a cap asks for. `fusionarContrato` in `lib/procesadores/schema`
 * is written around the same distinction, with `in` rather than `??`.
 */
export function cambiosDelProcesador(
  actual: ProcesadorDTO,
  valores: ActualizarProcesador,
): ActualizarProcesador {
  const cambios: ActualizarProcesador = {};

  if (valores.nombre !== undefined && valores.nombre !== actual.nombre) {
    cambios.nombre = valores.nombre;
  }

  /* The schema collapses a blank description to null, and so does the column. */
  const descripcion = valores.descripcion ?? null;
  if (descripcion !== actual.descripcion) {
    cambios.descripcion = descripcion;
  }

  if (valores.claveProcesador !== undefined && valores.claveProcesador !== actual.claveProcesador) {
    cambios.claveProcesador = valores.claveProcesador;
  }

  if (
    valores.formatosAceptados !== undefined &&
    valores.formatosAceptados !== actual.formatosAceptados
  ) {
    cambios.formatosAceptados = valores.formatosAceptados;
  }

  if (valores.tamanoMax !== undefined && valores.tamanoMax !== actual.tamanoMax) {
    cambios.tamanoMax = valores.tamanoMax;
  }

  if (valores.entradasMin !== undefined && valores.entradasMin !== actual.entradasMin) {
    cambios.entradasMin = valores.entradasMin;
  }

  if (valores.entradasMax !== undefined && valores.entradasMax !== actual.entradasMax) {
    cambios.entradasMax = valores.entradasMax;
  }

  if (valores.tamanoMaxTotal !== undefined && valores.tamanoMaxTotal !== actual.tamanoMaxTotal) {
    cambios.tamanoMaxTotal = valores.tamanoMaxTotal;
  }

  if (valores.salidaEsperada !== undefined && valores.salidaEsperada !== actual.salidaEsperada) {
    cambios.salidaEsperada = valores.salidaEsperada;
  }

  return cambios;
}
