import type { PrismaClient } from "@prisma/client";

import type { RecursoTipo } from "@/lib/authz";

/**
 * The only writer of `evento_uso`.
 *
 * The table has existed and been empty since item #2 created it with its four
 * indexes; this module writes its first row. Every event the portal will ever
 * record goes through here — the `apertura` of item #8 below, the `ejecucion`
 * and the three typed errors of item #10 — so the shape of a row is decided in
 * one place and item #19's analytics read one consistent history.
 *
 * The Prisma client is a parameter and not a module import, exactly as in
 * `lib/enlaces/repository.ts` and `lib/authz/repository.ts`: production passes
 * the singleton, the suite passes a double and never reaches SQL Server.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE REFERENCE IS POLYMORPHIC, AND NOTHING BELOW THIS LINE CHECKS IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0002 splits the resources into `enlace` and `procesador` with no shared
 * parent, so `evento_uso` points at one of them with a pair of plain columns —
 * `tipo_recurso` and `id_recurso` — and NO foreign key. The schema says so in
 * as many words: "the application layer guarantees its integrity".
 *
 * What that means for a caller is worth stating plainly, because the failure it
 * allows is silent. A row naming `enlace` with a procesador's id is accepted by
 * SQL Server without complaint, joins to the wrong catalogue row in item #18's
 * `GROUP BY`, and shows up in item #19 as usage of a resource nobody touched.
 * Nothing later can detect it: there is no constraint to violate and no join
 * that comes back empty. So the type and the id travel together, as one
 * argument, and the caller that knows which table it is looking at is the one
 * that names it.
 */

/** The slice of Prisma this function uses. */
export type EventosClient = Pick<PrismaClient, "eventoUso">;

/**
 * The `evento_uso.tipo_evento` vocabulary, identical to the enum-shaped values
 * documented on the column in `prisma/schema.prisma` and to the CHECK
 * constraint the migrations enforce. `lib/prisma-schema.test.ts` compares the
 * schema against the migrations; `lib/procesadores/ejecucion-errores.test.ts`
 * compares this list against what the execution proxy actually writes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FIVE `error_*` MEMBERS MIRROR THE SERVICE ONE FOR ONE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The processing service defines exactly five typed errors — `formato`,
 * `tamano`, `contenido`, `cantidad`, `clave_inexistente` — and this list now
 * has a member for each. That is a property worth keeping, not a coincidence:
 * a total mapping is what stops the execution proxy from ever having to decide
 * what to do with an error it cannot name.
 *
 * IT WAS NOT ALWAYS TOTAL, AND THE GAP WAS EXPENSIVE. The list originally
 * carried only the three errors ADR 0006 happens to name in passing, so
 * `cantidad` and `clave_inexistente` arrived with nowhere to go. Recording
 * nothing looked like the safe option and was not: a procesador whose
 * `clave_procesador` matches no module in the registry produces no events at
 * all, which reads in item #19 exactly like a procesador nobody wants — and an
 * administrator acting on that would retire the very resource people were
 * failing to use. See the migration
 * `20260821143000_evento_uso_errores_tipificados_completos`.
 *
 * A sixth typed error in the service therefore needs a member here, a CHECK
 * widened in a new migration, and a branch in `EVENTO_POR_TIPO` — in that
 * order, and none of them optional.
 */
export const TIPOS_EVENTO = [
  "apertura",
  "ejecucion",
  "error_formato",
  "error_tamano",
  "error_contenido",
  "error_cantidad",
  "error_clave_inexistente",
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/**
 * One thing that happened, as the row records it.
 *
 * `fecha` is deliberately absent — see below — and there is no `id`: the column
 * is an identity and the caller has nothing to say about it.
 */
export interface EventoNuevo {
  usuarioId: number;
  tipoRecurso: RecursoTipo;
  idRecurso: number;
  tipoEvento: TipoEvento;
}

/**
 * Records the event.
 *
 * `fecha` is not written, so the column's `now()` default timestamps the row
 * with the DATABASE's clock. That is not a shortcut: SQL Server and the Node
 * process are separate machines in this deployment, and every analytics query
 * of ADR 0010 is bounded by a date range, so two clocks that drift apart would
 * put events either side of a boundary that neither of them agrees on.
 *
 * Nothing is selected back and nothing is returned. The caller has no use for
 * the row it just wrote — the id is meaningful only to the analytics reads —
 * and asking SQL Server to return it would add a round trip to a path that runs
 * in front of a person waiting for a page to open.
 *
 * A failure is NOT caught here. Whether a missing event is tolerable belongs to
 * the caller and genuinely differs between them: the apertura route treats it
 * as fatal because the record is the reason the click comes through the portal
 * at all. A repository that swallowed the error would take that decision away
 * from every future caller at once.
 */
export async function registrarEvento(client: EventosClient, evento: EventoNuevo): Promise<void> {
  await client.eventoUso.create({
    data: {
      usuarioId: evento.usuarioId,
      tipoRecurso: evento.tipoRecurso,
      idRecurso: evento.idRecurso,
      tipoEvento: evento.tipoEvento,
    },
  });
}
