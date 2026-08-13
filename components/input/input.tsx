"use client";

import { useId, type InputHTMLAttributes } from "react";

import styles from "./input.module.css";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Always required: DESIGN.md's forms are for non-technical users. */
  label: string;
  /**
   * The error message. Its presence is what switches the field to the error
   * treatment DESIGN.md describes ("borde rojo + mensaje en --danger-bg"), so
   * there is no separate `invalid` flag to keep in sync with it.
   */
  error?: string;
}

/**
 * Input — DESIGN.md "Componentes": "fondo --bg, borde --border, radio 9px, foco
 * cian (outline-color), error = borde rojo + mensaje en --danger-bg".
 *
 * The id is generated, so two fields with the same label still get separate
 * label associations; callers therefore cannot pass an id of their own.
 */
export function Input({ label, error, className, ...rest }: InputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const inputClasses = [styles.input, error ? styles.inputInvalid : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        {...rest}
        id={id}
        className={inputClasses}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
