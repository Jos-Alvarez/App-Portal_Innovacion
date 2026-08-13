"use client";

import { useState } from "react";

import styles from "./switch.module.css";

export interface SwitchProps {
  /** Accessible name — what access this switch grants or revokes. */
  label: string;
  /** Controlled state. Omit it to let the switch keep its own. */
  checked?: boolean;
  /** Initial state when the switch is uncontrolled. */
  defaultChecked?: boolean;
  /** Receives the state the switch is moving to, not the one it is leaving. */
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Switch — DESIGN.md "Componentes": "44×24px, verde asignado / borde gris sin
 * acceso, knob animado".
 *
 * A button with role="switch" rather than a checkbox: the knob is drawn, not a
 * native control, and the button already gives the keyboard behaviour for free.
 *
 * There is no "guardar cambios" here on purpose — DESIGN.md: "Todo cambio
 * administrativo se confirma con toast y aplica de inmediato". Persisting the
 * change is the caller's job; this component only reports the intent.
 */
export function Switch({
  label,
  checked,
  defaultChecked = false,
  onCheckedChange,
  disabled,
}: SwitchProps) {
  const [ownChecked, setOwnChecked] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isOn = isControlled ? checked : ownChecked;

  function toggle() {
    const next = !isOn;
    if (!isControlled) setOwnChecked(next);
    onCheckedChange?.(next);
  }

  return (
    <button
      type="button"
      role="switch"
      className={styles.switch}
      aria-checked={isOn}
      aria-label={label}
      disabled={disabled}
      onClick={toggle}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}
