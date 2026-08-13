"use client";

import type { ButtonHTMLAttributes } from "react";

/**
 * DESIGN.md "Componentes" defines the primary and secondary fills; "Reglas"
 * adds the text button ("el resto secundarias o de texto"). Nothing else.
 */
export type ButtonVariant = "primary" | "secondary" | "text";

/**
 * The variants are the shared classes in globals.css, not styles of their own.
 * Slice 2 put them there deliberately so the treatment lives in one place; this
 * component only chooses between them.
 */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "lx-btn-primary",
  secondary: "lx-btn-secondary",
  text: "lx-btn-text",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Defaults to "secondary" on purpose: DESIGN.md allows "una acción primaria
   * (navy) por vista", so the emphatic variant has to be asked for by name.
   */
  variant?: ButtonVariant;
}

export function Button({ variant = "secondary", type = "button", className, ...rest }: ButtonProps) {
  /* Default type="button" so a button inside a form never submits by accident. */
  const classes = ["lx-btn", VARIANT_CLASS[variant], className].filter(Boolean).join(" ");

  return <button {...rest} type={type} className={classes} />;
}
