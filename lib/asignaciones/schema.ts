import { z } from "zod";

/**
 * What a valid assignment request is, expressed once.
 *
 * WHY THIS FILE IS SO MUCH SMALLER THAN ITS SIBLINGS. `lib/enlaces/schema.ts`
 * and `lib/procesadores/schema.ts` describe rows with fields — names, URLs,
 * size caps, cross-field rules. `asignacion_enlace` and `asignacion_procesador`
 * have no fields at all: two foreign keys that together form the primary key,
 * no surrogate id, no `activo`, no timestamps. THE ROW IS THE GRANT. There is
 * nothing to validate but the two identifiers in the path, and no request body
 * to parse — which is exactly why the endpoints are PUT and DELETE rather than
 * a POST carrying a payload.
 *
 * Nothing here produces user-facing text; `errors.ts` writes what the reader
 * sees, in Spanish, as it does for every other resource.
 */

/** SQL Server's signed 32-bit maximum — the ceiling of every INT column here. */
export const INT_MAX = 2_147_483_647;

/**
 * One `{id}` segment of the assignment routes, as it arrives: a string.
 *
 * Used for BOTH identifiers — the `usuarioId` and the resource id — because
 * both are `INT IDENTITY` primary keys and neither has any rule the other does
 * not. Strict on purpose, exactly as `idEnlaceSchema` and `idProcesadorSchema`:
 * ASCII digits only, and never past what the column holds. An id of
 * 99999999999 is a 400 the administrator can act on, decided here, instead of
 * an arithmetic overflow decided by SQL Server and surfaced as a 500.
 */
export const idRutaSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(INT_MAX));
