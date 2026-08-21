import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/identity";

/**
 * What a valid administrator-management request is — backlog item #17.
 *
 * Three shapes only, because the feature has exactly three requests: search the
 * directory, grant the role, take it away. Nothing here produces user-facing
 * text; `errors.ts` writes what the reader sees, in Spanish, as it does for
 * every other resource.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THERE IS NO `nombre` AND NO `area` IN ANY BODY, ON PURPOSE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The obvious design is for the screen to POST back the whole person it found
 * in the directory. It is rejected: the client would then be the source of an
 * identity the portal stores, and a hand-made request could create a `usuario`
 * row with any name and any area it liked, under an address that never had one.
 *
 * So the body carries the ADDRESS and the server resolves the rest — from the
 * `usuario` row when the person has signed in before, from Microsoft Graph when
 * they have not. The address is the identity key of the upsert (ADR 0009), and
 * it is the one field a caller cannot forge into something else: it is checked
 * against the corporate domain before anything is written.
 */

/** SQL Server's signed 32-bit maximum — the ceiling of `usuario.id`. */
export const INT_MAX = 2_147_483_647;

/**
 * Shortest term the directory search accepts.
 *
 * One letter would match a sizeable share of the company on a `startsWith`
 * filter, and the reader cannot do anything useful with two hundred rows. Two
 * is also what keeps an accidental keystroke from becoming a Graph call.
 */
export const BUSQUEDA_MIN = 2;

/** `usuario.correo NVARCHAR(320)` — the widest thing worth searching for. */
export const BUSQUEDA_MAX = 320;

/**
 * How many people one search answers with.
 *
 * The cap is applied to BOTH sources (Graph and the portal's own table) so the
 * screen looks the same whether the directory is reachable or not. A search that
 * needs more than twenty results is a search that has to be narrowed, and the
 * screen says so.
 */
export const RESULTADOS_MAX = 20;

/**
 * The `?q=` of `GET /api/admins/directorio`.
 *
 * Trimmed before it is measured, so `"  "` is short rather than mistaken for
 * two characters. It is NOT lowercased: the term is matched case-insensitively
 * by both sources, and lowercasing it here would only make the log line lie
 * about what the administrator typed.
 */
export const terminoBusquedaSchema = z.string().trim().min(BUSQUEDA_MIN).max(BUSQUEDA_MAX);

/**
 * A path parameter, parsed rather than coerced — `DELETE /api/admins/{id}`.
 *
 * The regex is what makes `Number` safe here: `"12abc"` and `" 12"` are refused
 * as text before any conversion happens, so nothing reaches Prisma as a `NaN`.
 * The upper bound turns an id past 2³¹−1 into a 400 the administrator can act
 * on instead of an overflow SQL Server reports as a 500.
 */
export const idUsuarioSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(INT_MAX));

/**
 * The body of `POST /api/admins`: one address, normalized the way the login
 * normalizes it.
 *
 * `normalizeEmail` is reused rather than re-implemented because the value has to
 * key the SAME row the sign-in upserts. If the two normalizations disagreed by a
 * single space or a capital letter, promoting `Ana@Corp.com` would create a
 * second `usuario` row for a person who already has one — and the duplicate
 * would hold the administrator role while the row they actually sign in with
 * would not.
 *
 * The corporate-domain rule is deliberately NOT here. It needs
 * `ALLOWED_EMAIL_DOMAIN`, which is environment and not shape, and a schema that
 * reads `process.env` cannot be unit-tested without one. `errors.ts` names the
 * refusal and the route applies it.
 */
export const promoverSchema = z.object({
  correo: z
    .string()
    .transform(normalizeEmail)
    .pipe(z.email().max(BUSQUEDA_MAX)),
});

export type Promover = z.infer<typeof promoverSchema>;
