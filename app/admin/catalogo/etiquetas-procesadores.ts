import type { ChipTone } from "@/components/chip/chip";
import type { ProcesadorDTO } from "@/lib/procesadores/repository";
import type { SalidaEsperada } from "@/lib/procesadores/schema";

import { bytesAMegabytes } from "./edicion";

/**
 * How the catalogue's vocabulary is written on screen.
 *
 * Same job as `lib/enlaces/etiquetas.ts` and `./etiquetas-catalogo.ts`: `SALIDAS_ESPERADAS` is the
 * stored vocabulary — `archivo`, `zip` — and those are column values, not words
 * a reader should ever see. Keying the records on `SalidaEsperada` is what
 * keeps the promise mechanical: a third value added to the schema stops the
 * build here until it is given a name and a colour.
 *
 * The three `describir…` functions exist because the same fact is written in
 * the table and reasoned about in the form, and because a cap that is absent
 * has to SAY so. ADR 0002 reads NULL as "sin tope", which no empty cell
 * communicates on its own.
 */

export const ETIQUETA_SALIDA: Record<SalidaEsperada, string> = {
  archivo: "Un solo archivo",
  zip: "Un ZIP con varios archivos",
};

/**
 * DESIGN.md gives these two no colour of its own. "info" is the derived cyan
 * soft tone `chip.tsx` documents for exactly this case, and the navy is the
 * brand's own — enough to tell the two apart without inventing a meaning.
 */
export const TONO_SALIDA: Record<SalidaEsperada, ChipTone> = {
  archivo: "info",
  zip: "navy",
};

/** The absence of a cap, said in words rather than left as a blank. */
export const SIN_TOPE = "Sin tope";

/** `"xlsx,csv"` as stored → `"xlsx, csv"` as read. */
export function describirFormatos(formatosAceptados: string): string {
  return formatosAceptados.split(",").join(", ");
}

/** How many files one execution admits. */
export function describirEntradas(
  procesador: Pick<ProcesadorDTO, "entradasMin" | "entradasMax">,
): string {
  const maximo = procesador.entradasMax === null ? SIN_TOPE : `Máximo ${procesador.entradasMax}`;

  return `Mínimo ${procesador.entradasMin} · ${maximo}`;
}

/** The two size caps, in the megabytes the reader thinks in. */
export function describirTamanos(
  procesador: Pick<ProcesadorDTO, "tamanoMax" | "tamanoMaxTotal">,
): string {
  const conjunto =
    procesador.tamanoMaxTotal === null
      ? `${SIN_TOPE} en total`
      : `${bytesAMegabytes(procesador.tamanoMaxTotal)} MB en total`;

  return `${bytesAMegabytes(procesador.tamanoMax)} MB por archivo · ${conjunto}`;
}
