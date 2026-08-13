import { z } from "zod";

/**
 * What a valid `enlace` is, expressed once.
 *
 * One schema per resource, shared by the route handler that writes the row and
 * by the administration form that will collect it (backlog item #5, part 2).
 * The rules therefore live in exactly one place: a form that accepts something
 * the API would refuse, or refuses something the API would take, is a class of
 * bug this module removes rather than a bug to be found later.
 *
 * The limits below are the physical widths of `prisma/schema.prisma`'s columns.
 * Validating them here means an over-long value comes back as a Spanish 400
 * that names the field, instead of a SQL Server truncation error the reader
 * cannot act on.
 *
 * Nothing in this file produces user-facing text. zod's own messages are
 * English and technical — "Invalid URL", "Invalid option: expected one of
 * \"app\"|\"agente\"" — and DESIGN.md forbids exactly that. `errors.ts` turns
 * an issue into the Spanish message the reader sees, keyed on the field, so no
 * zod string can ever reach a browser.
 */

/** The `enlace.tipo` vocabulary, identical to the `enlace_tipo_check` constraint. */
export const TIPOS_ENLACE = ["app", "agente"] as const;

export type TipoEnlace = (typeof TIPOS_ENLACE)[number];

/** `nombre NVARCHAR(150)`. */
export const NOMBRE_MAX = 150;
/** `descripcion NVARCHAR(1000)`. */
export const DESCRIPCION_MAX = 1000;
/** `url NVARCHAR(2048)`. */
export const URL_MAX = 2048;
/** `id INT` — SQL Server's signed 32-bit maximum. */
export const ID_MAX = 2_147_483_647;

/**
 * The `{id}` segment of `/api/enlaces/{id}`, as it arrives: a string.
 *
 * Strict on purpose. The regex accepts only ASCII digits, so `1.5`, `-3`,
 * `1e3`, a padded ` 7` and a segment carrying anything else all fail here
 * rather than reaching Prisma as a `NaN` or a surprising coercion. The upper
 * bound is the INT column's own limit: without it, an id past 2³¹−1 becomes a
 * database error the reader cannot act on, instead of a 400 that says the link
 * they followed is wrong.
 */
export const idEnlaceSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(ID_MAX));

/**
 * The whole allowlist: a URL is acceptable when the parsed scheme is `http` or
 * `https`, and unacceptable otherwise.
 *
 * Written as an allowlist on purpose. A blocklist — "reject javascript: and
 * data:" — is a promise that the list of dangerous schemes is finite and
 * known, which it is not, and it is defeated by the parser's own leniency
 * anyway: a browser reads `java\tscript:` as `javascript:` because the URL
 * parser strips tab and newline before it decides what the scheme is. An
 * allowlist checked against the PARSED scheme inherits that same leniency and
 * comes out on the safe side of it, because anything the parser produces that
 * is not exactly `http` or `https` fails.
 *
 * zod's `z.url()` does NOT do this by itself: it accepts anything the WHATWG
 * `URL` constructor accepts, `javascript:` and `data:` included. The
 * `protocol` option below is what restricts it, and removing that one argument
 * silently reopens the hole.
 */
const PROTOCOLOS_PERMITIDOS = /^https?$/;

/**
 * ASCII control characters, which no legitimate URL contains. Written as
 * escapes and not as the literal bytes: a raw tab or NUL inside a character
 * class is invisible in a diff and unreviewable.
 */
const CONTROLES = /[\u0000-\u001F\u007F]/g;

/**
 * The normalisation the allowlist is applied AFTER.
 *
 * Two jobs. Trimming makes a pasted URL work regardless of the whitespace that
 * came with it. Stripping control characters makes the string the validator
 * judges the same string the browser will later parse — a tab or a newline
 * buried in `java\tscript:` is invisible in a form field, is discarded by the
 * URL parser, and would otherwise let a check that reads the raw text disagree
 * with the browser that eventually follows the link.
 */
export function normalizarUrl(value: string): string {
  return value.replace(CONTROLES, "").trim();
}

/**
 * `z.string()` runs first so a number or a null fails as a type error on this
 * field rather than throwing inside the transform; the normalisation then
 * happens; and only then is the parsed scheme checked against the allowlist.
 * The order is the security property, not a style choice.
 */
const urlSchema = z
  .string()
  .transform(normalizarUrl)
  .pipe(z.url({ protocol: PROTOCOLOS_PERMITIDOS }).max(URL_MAX));

const nombreSchema = z.string().trim().min(1).max(NOMBRE_MAX);

/**
 * Optional, nullable, and empty-collapsing — in that order.
 *
 * The transform sits INSIDE the string branch so it only ever runs on a string:
 * an absent key stays absent in the output (which is what makes a partial
 * update distinguishable from a deliberate blanking), and an explicit `null`
 * stays `null`. A description the administrator left blank becomes `null` so
 * that no screen downstream has to treat `""` and `NULL` as two ways of saying
 * the same nothing.
 */
const descripcionSchema = z
  .string()
  .trim()
  .max(DESCRIPCION_MAX)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

const tipoSchema = z.enum(TIPOS_ENLACE);

/**
 * The body of `POST /api/enlaces`.
 *
 * Unknown keys are stripped, which is zod's default and the right behaviour
 * here: a client that posts an extra field gets a working request, while the
 * extra field never reaches Prisma because the parsed output — not the raw
 * body — is what the repository writes. That is also what keeps `activo` and
 * `id` out of a creation: they are not declared, so they cannot be preset.
 */
export const crearEnlaceSchema = z.object({
  nombre: nombreSchema,
  descripcion: descripcionSchema,
  url: urlSchema,
  tipo: tipoSchema,
});

export type CrearEnlace = z.infer<typeof crearEnlaceSchema>;

/**
 * The body of `PATCH /api/enlaces/{id}`.
 *
 * Every field is optional because PATCH is a partial edit: the administration
 * form may send only what changed, and a field left out is a field left alone.
 * An empty body is refused rather than treated as a successful no-op, since it
 * is always a client defect and answering 200 to it would hide that.
 *
 * `activo` is accepted here and nowhere else. The baja has its own route
 * (`DELETE`), but the delete is logical — the row survives — so without a way
 * to set the flag back an accidental baja would be irreversible through the
 * product. The documents describe only "alta, edición y baja"; making the flag
 * part of the edit is the smallest way to keep the baja recoverable without
 * inventing a fourth verb.
 */
export const actualizarEnlaceSchema = z
  .object({
    nombre: nombreSchema.optional(),
    descripcion: descripcionSchema,
    url: urlSchema.optional(),
    tipo: tipoSchema.optional(),
    activo: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    /* No field owns this issue, so it reaches the client as a whole-body error. */
    path: [],
  });

export type ActualizarEnlace = z.infer<typeof actualizarEnlaceSchema>;
