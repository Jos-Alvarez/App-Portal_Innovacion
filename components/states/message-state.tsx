import type { ReactNode } from "react";

import styles from "./states.module.css";

/**
 * Shell shared by the Vacío, Error and Sin permiso states. DESIGN.md gives all
 * three the same anatomy — icon, title, explanation, exit — so the geometry is
 * defined once here and the three states differ only in tone and copy.
 *
 * Not exported from the folder's public surface: it is an internal detail, not
 * a component views are meant to reach for directly.
 */
export interface MessageStateProps {
  /** Discreet unicode glyph. DESIGN.md: functional iconography only. */
  icon: string;
  /** "danger" is reserved for the Error state — red is never decorative. */
  tone?: "neutral" | "danger";
  title: string;
  description: string;
  /** "alert" interrupts the reader; "status" waits its turn. */
  live?: "status" | "alert";
  actions?: ReactNode;
}

export function MessageState({
  icon,
  tone = "neutral",
  title,
  description,
  live = "status",
  actions,
}: MessageStateProps) {
  const iconClass = tone === "danger" ? `${styles.icon} ${styles.iconDanger}` : styles.icon;

  return (
    <div className={styles.message} role={live}>
      <span className={iconClass} aria-hidden="true">
        {icon}
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
