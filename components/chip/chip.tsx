"use client";

import type { ReactNode } from "react";

import styles from "./chip.module.css";

export interface FilterChipProps {
  label: string;
  /** The filter bar owns which chip is active, so this is always controlled. */
  selected?: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * Chip de filtro — DESIGN.md: "pill, activo = navy relleno, inactivo = borde +
 * --muted". `aria-pressed` is what tells assistive tech which filter is on;
 * the fill is only the visual half of that same fact.
 */
export function FilterChip({ label, selected = false, onSelect, disabled }: FilterChipProps) {
  return (
    <button
      type="button"
      className={styles.filter}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

/**
 * The semantic tones DESIGN.md names: "pendiente gris, en revisión ámbar,
 * aprobada verde, rechazada rojo, implementada navy", plus the violet the
 * colour section reserves for the AI agent type label. "info" is DERIVED — the
 * catalogue also has an "app" type and DESIGN.md gives it no colour, so it
 * takes the brand cyan-soft surface the rest of the system already uses.
 */
export type ChipTone = "neutral" | "info" | "ok" | "warn" | "danger" | "navy" | "agent";

export interface StatusChipProps {
  tone?: ChipTone;
  children: ReactNode;
}

/**
 * Chip de tipo/estado — DESIGN.md: "pill con fondo suave semántico + texto del
 * mismo tono". Static by design: it reports a state, it does not change one.
 */
export function StatusChip({ tone = "neutral", children }: StatusChipProps) {
  return (
    <span className={`${styles.status} lx-label`} data-tone={tone}>
      {children}
    </span>
  );
}
