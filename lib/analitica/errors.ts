import { RANGOS } from "@/lib/analitica/periodos";
import { type ApiFailure, apiFailure } from "@/lib/api/errors";

/**
 * The two ways an analytics request can fail, as the one envelope of ADR 0003.
 *
 * There are only two, and that is a property of the endpoint rather than an
 * omission: it reads and never writes, so there is no state to collide with, no
 * row to be missing and nothing to be already done. Either the question is
 * malformed, or the database could not answer it.
 *
 * Same two rules as every other error module here: the messages are Spanish the
 * reader can act on, and nothing the database or a validation library said is
 * ever forwarded. The reader is an administrator, so the copy may name the
 * portal's own vocabulary — the four periods are on their screen.
 */

/** The query string does not describe a period this engine can answer for. */
export function consultaInvalida(): ApiFailure {
  return apiFailure(
    400,
    "consulta_invalida",
    `Elige un periodo válido (${RANGOS.join(", ")}). Para un rango personalizado, indica las dos fechas, con la de inicio antes que la de fin.`,
  );
}

/**
 * The aggregation could not be run.
 *
 * The sentence promises nothing about data, because there is nothing to promise:
 * this endpoint writes nothing, so a failure leaves the portal exactly as it
 * was. What it does say is that the numbers are ABSENT rather than zero — the
 * distinction that matters most on an analytics screen, where a zero is itself a
 * finding somebody might act on.
 */
export const ERROR_INTERNO: ApiFailure = apiFailure(
  500,
  "error_interno",
  "No pudimos calcular las métricas. No es que no haya datos: no pudimos leerlos. Vuelve a intentarlo; si sigue igual, avisa al equipo de sistemas.",
);
