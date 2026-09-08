"use client";

import styles from "./theme-toggle.module.css";
import { useTheme } from "./use-theme";

/**
 * The theme switch — DESIGN.md "Toggles de tema", now an entry in the topbar's
 * session menu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT GOT ITS LABEL BACK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * For one release this was a bare ☾ disc with an `aria-label` and no visible
 * words, because loose in the bar a labelled control competed with the six-entry
 * panel nav for the eye. Behind a trigger that argument is gone: a menu is a
 * list of words by definition, and an unlabelled icon in one is a riddle.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY `menuitemcheckbox` AND NOT `menuitem`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This entry does not perform an action and leave; it turns a setting on and
 * off, and the reader needs to know which way it currently sits BEFORE pressing
 * it. `role="menuitem"` has nowhere to put that. `menuitemcheckbox` does —
 * `aria-checked` — and it is the role's whole purpose.
 *
 * That is also why the label stopped flipping. As an icon button it announced
 * the DESTINATION ("Cambiar a modo claro") because there was no state to
 * announce; as a checkbox the label must name the THING ("Modo oscuro") and let
 * `aria-checked` carry the state, or a screen reader ends up saying "cambiar a
 * modo claro, marcado", which nobody can parse.
 *
 * The ✓ is the same fact for whoever is looking rather than listening. It is
 * always in the DOM and toggles its opacity, so switching the theme does not
 * shift the row's layout under the pointer that just clicked it.
 *
 * THE MENU STAYS OPEN when this is pressed, which is the convention for a
 * checkable entry: you are flipping a switch, not choosing a destination, and
 * the whole point of `aria-checked` is that you can see the result. `SessionMenu`
 * closes on Escape, on Tab and on a click outside, and on nothing else.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={isDark}
      /*
       * Menu entries are reached with the arrow keys, never with Tab: the
       * trigger is the menu's single tab stop. `SessionMenu` moves focus here.
       */
      tabIndex={-1}
      className="lx-menu-item"
      onClick={toggleTheme}
    >
      {/*
       * A fixed moon, not the ☀/☾ pair the icon button flipped. The glyph names
       * the SETTING now, and the setting is "dark mode" whichever way it is
       * currently set; the ✓ is what changes.
       */}
      <span className={styles.glyph} aria-hidden="true">
        ☾
      </span>
      Modo oscuro
      <span className={styles.check} data-activo={isDark} aria-hidden="true">
        ✓
      </span>
    </button>
  );
}
