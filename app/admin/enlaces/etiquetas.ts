import type { ChipTone } from "@/components/chip/chip";
import type { TipoEnlace } from "@/lib/enlaces/schema";

/**
 * How the catalogue's vocabulary is written and coloured on screen.
 *
 * The schema's `TIPOS_ENLACE` is the vocabulary itself — `app`, `agente` — and
 * those are storage values, not words a reader should ever see. This module is
 * the single place they become Spanish, so the form's option list and the
 * table's chip cannot drift into naming the same thing two ways.
 *
 * Keying the records on `TipoEnlace` is what keeps that promise mechanical: a
 * third type added to the schema stops the build here until it is given a name
 * and a colour, instead of silently rendering as a raw `app`-style token.
 */

export const ETIQUETA_TIPO: Record<TipoEnlace, string> = {
  app: "Aplicación",
  agente: "Agente de IA",
};

/**
 * DESIGN.md reserves the violet `--agent` token for the AI agent type label and
 * gives the application type no colour of its own, so it takes "info" — the
 * derived cyan-soft tone `chip.tsx` documents for exactly this case.
 */
export const TONO_TIPO: Record<TipoEnlace, ChipTone> = {
  app: "info",
  agente: "agent",
};
