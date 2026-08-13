"use client";

import styles from "./theme-toggle.module.css";
import { useTheme } from "./use-theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      <span className={styles.glyph} aria-hidden="true">
        {isDark ? "☀" : "☾"}
      </span>
      {isDark ? "Claro" : "Oscuro"}
    </button>
  );
}
