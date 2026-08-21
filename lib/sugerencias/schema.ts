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
