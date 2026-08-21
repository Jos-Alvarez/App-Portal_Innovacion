import { z } from "zod";

/**
 * What a valid `sugerencia` is, expressed once.
 *
 * One schema per resource, shared by the route handler that writes the row and
 * by the form that collects it — the same arrangement `lib/enlaces/schema.ts`
 * uses and for the same reason: a form that accepts something the API would
 * refuse, or refuses something the API would take, stops being a bug to find
 * later and becomes impossible.
 *
 * Nothing in this file produces user-facing text. zod's own messages are
 * English and technical, and DESIGN.md forbids exactly that; `errors.ts` turns
 * an issue into the Spanish sentence the reader sees, keyed on the field.
 */

/**
 * The `sugerencia.estado` vocabulary, identical to the `sugerencia_estado_check`
 * constraint written by the initial migration.
 *
 * The order is the funnel's order, not alphabetical: `pendiente` first because
 * it is where every suggestion enters, then the review, then the three ways a
 * review can end. Item #15 owns the transitions between them; this item only
 * ever produces the first member.
 */
export const ESTADOS_SUGERENCIA = [
  "pendiente",
  "en_revision",
  "aprobada",
  "rechazada",
  "implementada",
] as const;

export type EstadoSugerencia = (typeof ESTADOS_SUGERENCIA)[number];

/**
 * The state every suggestion is born in — the backlog's "alta en estado
 * `pendiente`", as a constant rather than as a literal repeated at each write.
 *
 * It matters that this is exported. The row's `estado` and the first entry of
 * its ledger have to agree, and `repository.ts` writes BOTH from this constant
 * instead of letting one come from the column's default and the other from a
 * string typed out nearby. See the note on `crearSugerencia`.
 */
export const ESTADO_INICIAL: EstadoSugerencia = "pendiente";

/** `titulo NVARCHAR(200)`. */
export const TITULO_MAX = 200;

/**
 * The description's cap — and it is NOT the column's.
 *
 * `sugerencia.descripcion` is `NVARCHAR(MAX)`: the database would take two
 * gigabytes. A Route Handler in the App Router has no default body-size limit
 * either, so without a number here the endpoint accepts whatever anyone cares
 * to send and writes it. The limit therefore has to be chosen by someone, and
 * choosing it here — where the form and the API read the same value — is the
 * only place it can be chosen once.
 *
 * 4000 characters is about two pages: generous for the idea this box exists to
 * collect, and far below the point where a single request becomes a problem for
 * anyone else. It is a product limit, not a storage one, which is why the
 * column stays `MAX` and this number can be raised without a migration.
 */
export const DESCRIPCION_MAX = 4000;

/** `area_destino NVARCHAR(120)`, the same width as `usuario.area`. */
export const AREA_DESTINO_MAX = 120;

const tituloSchema = z.string().trim().min(1).max(TITULO_MAX);

/**
 * Required, like the column. A suggestion with a title and no body is a subject
 * line: the Área de Innovación would have to go back and ask what it meant,
 * which is the conversation this box exists to avoid.
 */
const descripcionSchema = z.string().trim().min(1).max(DESCRIPCION_MAX);

/**
 * Free text, deliberately — the same shape as `usuario.area`, which arrives
 * from Entra ID's `department` claim and belongs to no list the portal
 * controls. The PRD lets a collaborator write a suggestion "para sí mismo, su
 * área u otra área", and an area with no registered user yet is still a legal
 * destination, so a closed list would refuse a valid answer.
 *
 * The cost is spelling drift, which item #19 groups by. See the open item in
 * this cycle's README: the fix belongs where the grouping happens.
 */
const areaDestinoSchema = z.string().trim().min(1).max(AREA_DESTINO_MAX);

/**
 * The body of `POST /api/sugerencias`.
 *
 * Unknown keys are stripped, which is zod's default and exactly what is wanted:
 * the repository writes the PARSED output, never the raw body, so `estado`,
 * `autorId` and `grupoId` cannot be preset by a client that sends them. Who the
 * author is comes from the session, and what state the suggestion starts in
 * comes from `ESTADO_INICIAL` — neither is ever read off the request.
 */
export const crearSugerenciaSchema = z.object({
  titulo: tituloSchema,
  descripcion: descripcionSchema,
  areaDestino: areaDestinoSchema,
});

export type CrearSugerencia = z.infer<typeof crearSugerenciaSchema>;

/**
 * The widest value `sugerencia.id` can hold — SQL Server's `INT`.
 *
 * The same bound `lib/enlaces/schema.ts` states, for the same reason: without
 * it, an id past 2³¹−1 reaches Prisma and comes back as a database error the
 * reader cannot act on, instead of a 400 that says the link they followed is
 * wrong.
 */
const ID_MAX = 2_147_483_647;

/**
 * A path parameter, parsed rather than coerced — item #15's routes address one
 * suggestion by id.
 *
 * The regex is what makes `Number` safe here: `"12abc"` and `" 12"` are refused
 * as text before any conversion happens, so nothing reaches Prisma as a `NaN` or
 * as a surprising coercion.
 */
export const idSugerenciaSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(ID_MAX));

/**
 * The body of `PATCH /api/sugerencias/{id}/estado` — ADR 0003's route for the
 * review funnel.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE FIELD, AND EVERY OTHER KEY IS DROPPED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `estado` is the only thing an administrator changes about a suggestion. The
 * title, the description and the destination area are what a collaborator WROTE:
 * the portal is a record of their idea, not a draft the reviewer edits, and the
 * PRD is explicit that the review is a state machine ("cambiar su estado
 * pendiente → en revisión → aprobada/rechazada/implementada") and nothing more.
 *
 * zod strips unknown keys, so a body that also carries `titulo` or `autorId` is
 * not refused — it is parsed down to the one field this endpoint accepts, and
 * the repository writes the PARSED output. There is no path by which a request
 * to this route rewrites somebody's words.
 *
 * `cambiadoPor` is deliberately absent too: who made the change comes from the
 * session, never from the body. An immutable ledger whose author column can be
 * filled in by the caller is not an audit trail.
 */
export const cambiarEstadoSchema = z.object({
  estado: z.enum(ESTADOS_SUGERENCIA),
});

export type CambiarEstado = z.infer<typeof cambiarEstadoSchema>;

/* ══════════════════════════════════════════════════════════════════════════
 *  ÍTEM #16 — LA AGRUPACIÓN
 * ══════════════════════════════════════════════════════════════════════════ */

/** `grupo_sugerencia.titulo NVARCHAR(200)`, the same width as a suggestion's. */
export const TITULO_GRUPO_MAX = 200;

/**
 * The most suggestions one request may file into a group.
 *
 * Not a rule of the domain — the column cannot express it and the database does
 * not care. It is a bound on a request: without it the endpoint accepts an array
 * of any length and turns it into an `UPDATE ... WHERE id IN (...)` of any
 * length, which is a request anyone can make expensive.
 *
 * A hundred is far past what this feature is for. A group is a bucket a person
 * reads — "these six are all about the same toll booth" — and the moment it is
 * in the hundreds, nobody is reading it as a group any more.
 */
export const SUGERENCIAS_POR_GRUPO_MAX = 100;

/**
 * The smallest group that is a group.
 *
 * TECH-DESIGN.md asks for "2+ sugerencias similares", and the number is load
 * bearing rather than decorative: a group of one is a suggestion with a label on
 * it, and rendering it as a group would show a bucket header over a single card.
 * The repository keeps this true AFTER writes as well — see
 * `disolverGruposSinMinimo`.
 */
export const MINIMO_POR_GRUPO = 2;

const idSugerencia = z.number().int().positive().max(ID_MAX);

/**
 * The body of `POST /api/sugerencias/grupos` — ADR 0003's route for grouping.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE DUPLICATE CHECK IS NOT PEDANTRY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `[7, 7]` has two entries and one suggestion. Without the check it passes the
 * minimum, and the repository then compares "how many rows did I find" against
 * "how many ids did I get" and refuses for a reason that is a lie — it would
 * report that a suggestion is missing when all of them are there. Refusing the
 * duplicate here means the answer names the actual problem.
 *
 * `creadoPor` is deliberately absent: who created the group comes from the
 * session, never from the body — the same rule `cambiarEstadoSchema` states for
 * the asiento's author.
 */
export const crearGrupoSchema = z.object({
  titulo: z.string().trim().min(1).max(TITULO_GRUPO_MAX),
  sugerenciaIds: z
    .array(idSugerencia)
    .min(MINIMO_POR_GRUPO)
    .max(SUGERENCIAS_POR_GRUPO_MAX)
    .refine((ids) => new Set(ids).size === ids.length),
});

export type CrearGrupo = z.infer<typeof crearGrupoSchema>;
