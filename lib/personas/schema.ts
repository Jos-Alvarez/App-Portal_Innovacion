import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/identity";

/**
 * What a valid request to `/api/personas` is — the people search and the
 * pre-registration behind the catalogue's "Asignar" dialog.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS NOT `lib/admins/schema.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * That module belongs to the administrator ROLE — who may enter the admin
 * panel. This one belongs to resource ASSIGNMENT — who may open one enlace or
 * one procesador. They are different products of the portal and a change to one
 * must never be forced on the other, so they get their own bounds and their own
 * sentences even where the numbers happen to agree today.
 *
 * The one thing the two DO share is `buscarPersonas` (`lib/admins/busqueda.ts`),
 * and that is deliberate: the degradation of ADR 0009 — directory when Graph can
 * be reached, portal rows when it cannot — is ONE decision about one external
 * dependency, and duplicating it would let the two screens disagree about
 * whether the company directory is available.
 */

/** Shortest term worth a round trip: one letter matches most of the company. */
export const BUSQUEDA_MIN = 2;

/** The e-mail column's own ceiling (RFC 5321), reused as the term's. */
export const BUSQUEDA_MAX = 320;

export const NOMBRE_MAX = 200;
export const AREA_MAX = 120;

/**
 * The `?q=` of `GET /api/personas`.
 *
 * Trimmed before it is measured, so `"  "` is short rather than mistaken for
 * two characters. NOT lowercased: both sources match case-insensitively, and
 * lowercasing here would only make the log line lie about what was typed.
 */
export const terminoSchema = z.string().trim().min(BUSQUEDA_MIN).max(BUSQUEDA_MAX);

/**
 * The body of `POST /api/personas` — the pre-registration.
 *
 * THE ADDRESS IS NORMALIZED HERE, AND THAT IS THE WHOLE POINT OF THE FEATURE.
 * `lib/auth/usuario-repository.ts` keys its sign-in upsert on
 * `normalizeEmail(...)`, so a row created with the very same normalization is
 * the row that login will FIND rather than duplicate — which is what makes the
 * grants handed out today still be there when that person finally signs in.
 * A row written with a different case would be orphaned in silence.
 *
 * `nombre` and `area` are optional because the caller may only know an address.
 * The route falls back exactly as the login does: the address becomes the name.
 */
export const registrarPersonaSchema = z.object({
  correo: z.string().transform(normalizeEmail).pipe(z.email().max(BUSQUEDA_MAX)),
  nombre: z.string().trim().max(NOMBRE_MAX).optional(),
  area: z.string().trim().max(AREA_MAX).optional(),
});

export type RegistrarPersona = z.infer<typeof registrarPersonaSchema>;
