import type { ReactNode } from "react";

import type { ChipTone } from "@/components/chip/chip";

import styles from "./status-dot.module.css";

export interface StatusDotProps {
  tone?: ChipTone;
  children: ReactNode;
}

/**
 * Estado con punto — DESIGN.md "Componentes": "punto 7px + texto 600 del color
 * semántico (catálogo)".
 *
 * The lighter sibling of StatusChip: same tone vocabulary, no pill surface. Use
 * it inside catalogue rows, where a filled chip on every row would compete with
 * the row's own actions.
 *
 * The dot is decorative. It restates what the label already says, so it is
 * hidden from assistive tech rather than announced twice.
 */
export function StatusDot({ tone = "neutral", children }: StatusDotProps) {
  return (
    <span className={styles.status} data-tone={tone}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
