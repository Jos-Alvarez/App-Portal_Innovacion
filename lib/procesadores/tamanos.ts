/**
 * Bytes as a person reads them, in Spanish.
 *
 * The API speaks bytes in both directions — `procesador.tamano_max` is a byte
 * count and so is the service's `limite_bytes` — and a reader has never once
 * wanted to know that their file is 26 214 400 bytes. Every place a size
 * reaches a human goes through here: the contract shown above the upload form,
 * the client-side check that saves a doomed upload, and the sentence the portal
 * writes when the service refuses a file for being too big.
 *
 * ONE FUNCTION, SO THE THREE NEVER DISAGREE. A limit rendered as "25 MB" in the
 * form and as "26214400 bytes" in the error is the same number told twice in a
 * way that makes the reader doubt both.
 *
 * MEBIBYTES, NOT MEGABYTES, AND THE LABEL SAYS "MB" ANYWAY. `tamano_max` is
 * built from `25 * 1024 * 1024` on both sides of the wire — the schema's
 * `TAMANO_MAX_BYTES` and the service's `CONTRATO_POR_DEFECTO` — so dividing by
 * 1000 would render that exact limit as "26,2 MB" and make a 25 MB file look
 * like it fits under a cap it does not. The unit written to the reader is the
 * one they know; the arithmetic is the one the limit was built with.
 *
 * The formatting is done by hand rather than with `toLocaleString`, so the
 * output does not depend on which ICU data the runtime happens to ship. The
 * decimal separator is a comma because the reader is Peruvian, and it appears
 * only when it carries information: "25 MB", never "25,0 MB".
 */

const KIB = 1024;
const MIB = KIB * KIB;

export function enMegabytes(bytes: number): string {
  /* Below a megabyte, "0,1 MB" tells the reader nothing they can compare
     against a file listing. Kilobytes do. */
  if (bytes < MIB) {
    return `${redondear(bytes / KIB)} KB`;
  }

  return `${redondear(bytes / MIB)} MB`;
}

/** One decimal at most, and none when it would be a zero. */
function redondear(valor: number): string {
  const redondeado = Math.round(valor * 10) / 10;

  return Number.isInteger(redondeado)
    ? String(redondeado)
    : redondeado.toFixed(1).replace(".", ",");
}
