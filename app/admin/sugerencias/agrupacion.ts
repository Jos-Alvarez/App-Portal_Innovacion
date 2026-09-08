import type { SugerenciaAdminDTO } from "@/lib/sugerencias/repository";

/**
 * How a flat list of suggestions becomes the blocks the screen draws — "las
 * sugerencias agrupadas se muestran juntas" of item #16, worked out as data
 * rather than as JSX.
 *
 * It lives in its own module, beside the screen and not inside it, for the reason
 * `app/admin/catalogo/edicion.ts` does: this is the one part of the grouping
 * feature that is a decision rather than a rendering, and a decision is worth
 * testing without mounting anything.
 */

/** One thing the list draws: a lone suggestion, or a group with its members. */
export type Bloque =
  | { readonly tipo: "suelta"; readonly sugerencia: SugerenciaAdminDTO }
  | {
      readonly tipo: "grupo";
      readonly grupo: { readonly id: number; readonly titulo: string };
      /** The members that survived the active filter, in the list's own order. */
      readonly miembros: readonly SugerenciaAdminDTO[];
      /** How many members the group really has, filter or no filter. */
      readonly total: number;
    };

/**
 * Turns the visible suggestions into blocks.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A GROUP SITS WHERE ITS NEWEST MEMBER WOULD HAVE SAT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The list is ordered newest first and that ordering is a promise the screen
 * makes. Sorting groups separately — all groups first, or by group id — would
 * quietly break it: a bucket created today holding an idea from March would jump
 * to the top of a list that claims to be chronological.
 *
 * So the walk is a single pass over the already-ordered list, and a group is
 * emitted at the position of the FIRST of its members encountered, which in a
 * newest-first list is its newest. Every other member is folded into that block
 * and skipped when its turn comes. Nothing is sorted here; the caller's order is
 * preserved exactly.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FILTER FILTERS SUGGESTIONS, NOT GROUPS — AND `total` IS WHY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Two members of one group can be in two different states: item #16's whole
 * point is that grouping "conserva el estado individual de cada una". So with a
 * state filter on, a group can be partly visible, and there are two wrong ways
 * to handle that.
 *
 * Showing the WHOLE group when any member matches would put a `pendiente` card
 * on screen under an "Aprobada" filter — the filter would be lying.
 *
 * Showing the matching members with no further comment would leave a block that
 * looks like a group of one, contradicting the minimum the repository enforces
 * and making the reader think a member was lost.
 *
 * So the members are filtered and `total` carries the real size, counted from the
 * COMPLETE list rather than the visible one. The header can then say "2 de 5",
 * which is the only honest thing on screen.
 */
export function armarBloques(
  visibles: readonly SugerenciaAdminDTO[],
  todas: readonly SugerenciaAdminDTO[],
): Bloque[] {
  const bloques: Bloque[] = [];
  const emitidos = new Set<number>();

  for (const sugerencia of visibles) {
    if (sugerencia.grupo === null) {
      bloques.push({ tipo: "suelta", sugerencia });
      continue;
    }

    const { id, titulo } = sugerencia.grupo;

    /* Its block already went out at an earlier member's position. */
    if (emitidos.has(id)) {
      continue;
    }

    emitidos.add(id);

    bloques.push({
      tipo: "grupo",
      grupo: { id, titulo },
      miembros: visibles.filter((fila) => fila.grupo?.id === id),
      total: todas.filter((fila) => fila.grupo?.id === id).length,
    });
  }

  return bloques;
}

/**
 * The label under a group's title: how much of it the reader is looking at.
 *
 * Silent about the filter when nothing is hidden, because "5 de 5" is a sentence
 * that makes a reader look for the missing one.
 */
export function resumenDeGrupo(visibles: number, total: number): string {
  const sufijo = total === 1 ? "sugerencia" : "sugerencias";

  return visibles === total ? `${total} ${sufijo}` : `${visibles} de ${total} ${sufijo}`;
}
