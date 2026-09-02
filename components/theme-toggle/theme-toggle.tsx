"use client";

import styles from "./theme-toggle.module.css";
import { useTheme } from "./use-theme";

/**
 * The theme switch — DESIGN.md "Toggles de tema", now icon-only.
 *
 * IT LOST ITS LABEL, NOT ITS NAME. The visible word ("Oscuro"/"Claro") is gone
 * because the control moved up beside the reader's name, where a labelled pill
 * competed with the six-entry nav for the eye. `aria-label` still carries the
 * full sentence and still flips with the theme, so what assistive technology
 * announces did not change at all — only what is painted.
 *
 * The ☾/☀ glyph names the destination, not the current state: it shows the sun
 * while the portal is dark, because pressing it is what brings the light back.
 * `aria-pressed` is what reports the state, and the two do not contradict each
 * other — one is the action, the other is the condition.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="lx-icon-btn"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      <span className={styles.glyph} aria-hidden="true">
        {isDark ? "☀" : "☾"}
      </span>
    </button>
  );
}
