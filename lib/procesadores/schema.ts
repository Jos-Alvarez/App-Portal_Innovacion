import { z } from "zod";

/**
 * What a valid `procesador` is, expressed once.
 *
 * Same contract as `lib/enlaces/schema.ts`: one schema per resource, shared by
 * the route handler that writes the row and by the administration form that
 * will collect it (backlog item #6, part 2), so a form that accepts what the
 * API refuses is a class of bug this module removes.
 *
 * WHAT MAKES THIS RESOURCE DIFFERENT. Four of its columns are not independent.
 * `entradas_min`, `entradas_max`, `tamano_max` and `tamano_max_total` declare
 * the SHAPE of an execution, and ADR 0002 is explicit that "la fila es la única
 * fuente de verdad de la cardinalidad": the portal builds the upload screen
 * from them and the FastAPI pipeline validates a request against them. A row
 * can therefore be valid field by field and still describe an execution nobody
 * could ever perform — a maximum below its own minimum, a combined size cap
 * below the per-file one. Those rules live in `violacionesDelContrato`, and
 * they are applied through `.superRefine` rather than `.refine` so each
 * violation is attributed to the field that owns it: an error landing on the
 * whole body tells the person filling the form nothing about what to change.
 *
 * The length limits below are the physical widths of `prisma/schema.prisma`'s
 * columns, so an over-long value comes back as a Spanish 400 naming the field
 * instead of a SQL Server truncation error.
 *
 * Nothing in this file produces user-facing text: zod's own messages are
 * English and technical, and `errors.ts` replaces them with Spanish keyed on
 * the field. The messages passed to `ctx.addIssue` below are internal labels
 * for whoever reads a failing test, never copy.
 */

/** The `procesador.salida_esperada` vocabulary, identical to `procesador_salida_esperada_check`. */
export const SALIDAS_ESPERADAS = ["archivo", "zip"] as const;

export type SalidaEsperada = (typeof SALIDAS_ESPERADAS)[number];

/** `nombre NVARCHAR(150)`. */
export const NOMBRE_MAX = 150;
/** `descripcion NVARCHAR(1000)`. */
export const DESCRIPCION_MAX = 1000;
/** `clave_procesador NVARCHAR(100)`. */
export const CLAVE_MAX = 100;
/** `formatos_aceptados NVARCHAR(400)`, measured on the normalised string. */
export const FORMATOS_MAX = 400;
/** SQL Server's signed 32-bit maximum — the ceiling of every INT column here. */
export const INT_MAX = 2_147_483_647;

/**
 * The per-file ceiling, in BYTES.
 *
 * ADR 0002 states the business rule as "tamaño máximo — tope general 25 MB" and
 * ADR 0006 pins down what it measures: "El límite de 25 MB es del archivo
 * comprimido". The API speaks bytes throughout, in both directions; the
 * megabyte affordance belongs to the form of part 2, not to the contract.
 */
export const TAMANO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * The `{id}` segment of `/api/procesadores/{id}`, as it arrives: a string.
 *
 * Strict on purpose, exactly as `idEnlaceSchema`: only ASCII digits, and never
 * past what the INT column holds, so a bad link is a 400 the reader can act on
 * rather than a database error.
 */
export const idProcesadorSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(INT_MAX));

/**
 * The registry key of the Python module that runs this procesador (ADR 0006).
 *
 * VALIDATED FOR FORMAT ONLY, NEVER FOR EXISTENCE. ADR 0006 accepts row/module
 * desync as designed debt — "Si `clave_procesador` en BD no existe en el
 * registry (desincronización fila↔código), la ruta debe fallar con un error
 * claro" — and contains it at execution time in the FastAPI pipeline. A
 * registry check here would need the portal to know the service's module list,
 * which is precisely the coupling that ADR contract avoids.
 *
 * The format itself is not stated anywhere, so it is decided here from the two
 * jobs the value actually does. It is a key in a Python `dict` looked up by
 * `REGISTRY[clave]`, and it is spliced into an internal URL path
 * (`POST /interno/procesadores/maestro-excel/ejecutar`). Both wanted the same
 * thing, and the ADR's own examples — `maestro-excel`, `limpieza-word` — are
 * already it: lowercase ASCII, digits allowed, single hyphens between segments,
 * starting with a letter. That rules out whitespace and `/`, `.`, `%` and
 * friends, which would change the route the key is spliced into; it rules out
 * non-ASCII, which cannot survive the round trip to a registry lookup unchanged;
 * and it allows exactly one separator so two rows cannot differ by punctuation
 * alone and read as the same module to a human.
 */
const CLAVE_PATRON = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * The extension of one accepted format, once normalised: lowercase
 * alphanumerics, no dot. A compound suffix such as `tar.gz` is deliberately
 * refused rather than stored — the stored form is a flat comma-separated list
 * and the pipeline matches one segment, so accepting a value it can never match
 * would be a silent misconfiguration.
 */
const EXTENSION = /^[a-z0-9]+$/;

/**
 * `"xlsx, CSV, .pdf"` → `["xlsx", "csv", "pdf"]`.
 *
 * Exported because part 2's form shows the administrator the normalised list
 * back as they type, and it has to be the same function that decides it.
 */
export function normalizarFormatos(value: string): string[] {
  return value
    .split(",")
    .map((formato) => formato.trim().toLowerCase().replace(/^\./, ""))
    .filter((formato) => formato.length > 0);
}

const nombreSchema = z.string().trim().min(1).max(NOMBRE_MAX);

/** Optional, nullable and empty-collapsing, exactly as an enlace's. */
const descripcionSchema = z
  .string()
  .trim()
  .max(DESCRIPCION_MAX)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

/**
 * `z.string()` runs first so a non-string fails as a type error on this field,
 * then the value is normalised, and only then is the format checked — the same
 * ordering `urlSchema` uses, and for the same reason: the string the validator
 * judges must be the string that gets stored.
 */
const claveSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().max(CLAVE_MAX).regex(CLAVE_PATRON));

/**
 * Accepted as the comma-separated string the administrator types and stored as
 * the comma-separated string the column holds, normalised in between.
 *
 * Duplicates are REFUSED rather than collapsed. "xlsx, .xlsx" is someone who
 * believes the two forms mean different things; storing one of them silently
 * confirms the misunderstanding, while a 400 corrects it.
 */
const formatosSchema = z
  .string()
  .transform(normalizarFormatos)
  .pipe(
    z
      .array(z.string().regex(EXTENSION))
      .min(1)
      .refine((formatos) => new Set(formatos).size === formatos.length, "duplicated format"),
  )
  .transform((formatos) => formatos.join(","))
  .pipe(z.string().max(FORMATOS_MAX));

const tamanoMaxSchema = z.number().int().positive().max(TAMANO_MAX_BYTES);
const tamanoMaxTotalSchema = z.number().int().positive().max(INT_MAX).nullable();
/** ADR 0002: "`entradas_min` (int, ≥ 1, por defecto 1)". */
const entradasMinSchema = z.number().int().min(1).max(INT_MAX);
/** ADR 0002: "`entradas_max` (int, nulo = sin tope)". */
const entradasMaxSchema = z.number().int().min(1).max(INT_MAX).nullable();

/**
 * ADR 0002: "`salida_esperada` (`archivo` | `zip`): qué recibe el usuario. Es
 * **declarativo para la UI**".
 *
 * NO RUNTIME MEANING, AND NONE MAY BE BUILT ON IT. The pipeline packages
 * according to the real number of files the module returns, so a row declaring
 * `archivo` whose module returns three files still works and still downloads as
 * a ZIP — "una discrepancia entre lo declarado y lo real no rompe la ejecución".
 * The only thing this field changes is what the screen can say before the
 * upload. Part 2 must label it honestly as an announcement, not a setting.
 */
const salidaSchema = z.enum(SALIDAS_ESPERADAS);

/** The four columns that together declare the shape of one execution. */
export interface ContratoEjecucion {
  entradasMin: number;
  entradasMax: number | null;
  tamanoMax: number;
  tamanoMaxTotal: number | null;
}

/** The four column names, as the only place the list is written down. */
export const CAMPOS_CONTRATO = [
  "entradasMin",
  "entradasMax",
  "tamanoMax",
  "tamanoMaxTotal",
] as const satisfies ReadonlyArray<keyof ContratoEjecucion>;

export interface ViolacionContrato {
  /** The field that owns the violation, and that the form should highlight. */
  campo: keyof ContratoEjecucion;
  /** Internal label. Never shown; `errors.ts` writes what the reader sees. */
  motivo: string;
}

/**
 * The cross-field rules of ADR 0002, as a pure function over the four columns.
 *
 * A function and not a `.refine` chain because it is needed twice and in two
 * different situations: on the way in for a creation, where the whole contract
 * arrives at once, and against the MERGED row for an update, where it does not.
 * Being pure also means each rule can be tested at the level it lives at,
 * without building a request.
 *
 *   1. A maximum below the minimum admits nothing. ADR 0002: "`entradas_min`
 *      (int, ≥ 1, por defecto 1) y `entradas_max` (int, nulo = sin tope):
 *      cuántos archivos admite una ejecución. Un procesador de un solo archivo
 *      es `min = max = 1`". Equality is therefore valid and only `<` is not.
 *   2. A combined cap below the per-file cap makes the per-file cap
 *      unreachable. ADR 0002: "`tamano_max` acota cada archivo por separado;
 *      este campo acota el conjunto." A set can never be smaller than its
 *      largest permitted member, so a row saying otherwise permits a file it
 *      then refuses to receive.
 *
 * A null cap is not a violation in either rule: ADR 0002 reads NULL as "sin
 * tope" and "sin tope propio", which is an absence of a bound rather than a
 * bound of zero.
 */
export function violacionesDelContrato(contrato: ContratoEjecucion): ViolacionContrato[] {
  const violaciones: ViolacionContrato[] = [];

  if (contrato.entradasMax !== null && contrato.entradasMax < contrato.entradasMin) {
    violaciones.push({ campo: "entradasMax", motivo: "entradasMax is below entradasMin" });
  }

  if (contrato.tamanoMaxTotal !== null && contrato.tamanoMaxTotal < contrato.tamanoMax) {
    violaciones.push({ campo: "tamanoMaxTotal", motivo: "tamanoMaxTotal is below tamanoMax" });
  }

  return violaciones;
}

/**
 * Reports the violations as zod issues, one per owning field.
 *
 * `.superRefine` and not `.refine` precisely for the `path`: `.refine` puts a
 * single issue on the whole body, which the form can only render as a banner
 * detached from any input. Zod skips a refinement when the object's own fields
 * already failed to parse, so `contrato` here is always four real values.
 */
function aplicarReglasDelContrato(
  contrato: ContratoEjecucion,
  ctx: { addIssue: (issue: { code: "custom"; path: string[]; message: string }) => void },
): void {
  for (const { campo, motivo } of violacionesDelContrato(contrato)) {
    ctx.addIssue({ code: "custom", path: [campo], message: motivo });
  }
}

/**
 * The body of `POST /api/procesadores`.
 *
 * Unknown keys are stripped, which is what keeps `activo` and `id` out of a
 * creation: they are not declared, so they cannot be preset. The three
 * defaults are ADR 0002's own — `entradas_min` "por defecto 1", and both caps
 * absent meaning uncapped — applied here rather than left to the column so the
 * parsed output is a complete contract the cross-field rules can judge.
 */
export const crearProcesadorSchema = z
  .object({
    nombre: nombreSchema,
    descripcion: descripcionSchema,
    claveProcesador: claveSchema,
    formatosAceptados: formatosSchema,
    tamanoMax: tamanoMaxSchema,
    entradasMin: entradasMinSchema.default(1),
    entradasMax: entradasMaxSchema.default(null),
    tamanoMaxTotal: tamanoMaxTotalSchema.default(null),
    salidaEsperada: salidaSchema,
  })
  .superRefine(aplicarReglasDelContrato);

export type CrearProcesador = z.infer<typeof crearProcesadorSchema>;

/**
 * The body of `PATCH /api/procesadores/{id}`.
 *
 * Every field is optional, and — this is the subtle part — the cross-field
 * rules are DELIBERATELY NOT APPLIED HERE. A fragment is not a row:
 * `{ entradasMin: 5 }` is a perfectly good edit for a row whose maximum is 10,
 * and `{ entradasMax: 3 }` is a perfectly good edit for a row whose minimum is
 * 1. Judging the fragment would reject both of those legitimate edits while
 * still letting the pair through when sent one after the other. The route
 * therefore merges the fragment into the stored row and validates the RESULT
 * with `contratoProcesadorSchema`. Do not "simplify" this by attaching
 * `aplicarReglasDelContrato` to the schema below — it would be wrong in both
 * directions at once.
 *
 * `activo` is accepted here and nowhere else, so the logical baja performed by
 * `DELETE` stays recoverable without inventing a fourth verb.
 */
export const actualizarProcesadorSchema = z
  .object({
    nombre: nombreSchema.optional(),
    descripcion: descripcionSchema,
    claveProcesador: claveSchema.optional(),
    formatosAceptados: formatosSchema.optional(),
    tamanoMax: tamanoMaxSchema.optional(),
    entradasMin: entradasMinSchema.optional(),
    entradasMax: entradasMaxSchema.optional(),
    tamanoMaxTotal: tamanoMaxTotalSchema.optional(),
    salidaEsperada: salidaSchema.optional(),
    activo: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    /* No field owns this issue, so it reaches the client as a whole-body error. */
    path: [],
  });

export type ActualizarProcesador = z.infer<typeof actualizarProcesadorSchema>;

/**
 * The merged contract, judged as a whole. The four fields are re-validated
 * individually as well: the stored row is the input here, and a column that
 * drifted out of range by any other route should not be waved through just
 * because this request did not touch it.
 */
export const contratoProcesadorSchema = z
  .object({
    entradasMin: entradasMinSchema,
    entradasMax: entradasMaxSchema,
    tamanoMax: tamanoMaxSchema,
    tamanoMaxTotal: tamanoMaxTotalSchema,
  })
  .superRefine(aplicarReglasDelContrato);

/**
 * Does this edit move any of the four contract columns?
 *
 * When it does not, the stored row cannot become incoherent — it was validated
 * as a whole when it was written — and the extra read the merge needs is a
 * query the request can skip. `in` rather than a truthiness test, because
 * `{ entradasMax: null }` is a deliberate removal of a cap and `null` is falsy.
 */
export function afectaAlContrato(cambios: ActualizarProcesador): boolean {
  return CAMPOS_CONTRATO.some((campo) => campo in cambios);
}

/**
 * The stored contract with the edit applied on top.
 *
 * `??` is the wrong operator here and `in` is the right one: an explicit
 * `null` means "remove this cap" and must survive the merge, while an absent
 * key means "leave this column alone".
 */
export function fusionarContrato(
  actual: ContratoEjecucion,
  cambios: ActualizarProcesador,
): ContratoEjecucion {
  return {
    entradasMin: "entradasMin" in cambios ? (cambios.entradasMin as number) : actual.entradasMin,
    entradasMax: "entradasMax" in cambios ? (cambios.entradasMax as number | null) : actual.entradasMax,
    tamanoMax: "tamanoMax" in cambios ? (cambios.tamanoMax as number) : actual.tamanoMax,
    tamanoMaxTotal:
      "tamanoMaxTotal" in cambios
        ? (cambios.tamanoMaxTotal as number | null)
        : actual.tamanoMaxTotal,
  };
}
