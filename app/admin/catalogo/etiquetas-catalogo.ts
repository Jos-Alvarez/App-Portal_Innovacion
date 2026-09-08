import type { ChipTone } from "@/components/chip/chip";

import type { TipoRecurso } from "./catalogo";

/**
 * How the unified catalogue's vocabulary is written and coloured on screen.
 *
 * It extends `lib/enlaces/etiquetas.ts` with the third thing the portal offers
 * — the procesador — WITHOUT touching it: that module is the vocabulary of the
 * `enlace` table and of the API that serves it, and a procesador is not a value
 * that table can ever hold. Widening it would have made `TipoEnlace` lie.
 *
 * Keying the records on `TipoRecurso` keeps the promise mechanical: a fourth
 * kind added later stops the build here until it is given a name and a colour.
 */

export const ETIQUETA_RECURSO: Record<TipoRecurso, string> = {
  app: "Aplicación",
  agente: "Agente de IA",
  procesador: "Procesador",
};

/**
 * The two enlace tones are `lib/enlaces/etiquetas.ts`'s own, unchanged. The
 * procesador takes the brand navy: DESIGN.md gives it no colour of its own, and
 * navy is the one tone left that means "the portal's own thing" rather than a
 * state — the semantic ok/warn/danger are spoken for by the Estado column.
 */
export const TONO_RECURSO: Record<TipoRecurso, ChipTone> = {
  app: "info",
  agente: "agent",
  procesador: "navy",
};
