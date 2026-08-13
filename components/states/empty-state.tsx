"use client";

import { MessageState } from "./message-state";

export interface EmptyStateProps {
  title: string;
  /** Defaults to naming who assigns access, per DESIGN.md's copy pattern. */
  description?: string;
  /**
   * The "salida útil". Rendered only when the caller supplies it, for the same
   * reason as ForbiddenState's Solicitar acceso: how one contacts the Área de
   * Innovación (mail, form, chat) is not defined anywhere yet.
   *
   * Deliberately NOT wired to the buzón — DESIGN.md: "El buzón es solo para
   * ideas nuevas", so it must not become the channel for access questions.
   */
  onContact?: () => void;
}

const DEFAULT_DESCRIPTION =
  "El Área de Innovación asigna los accesos y el contenido de esta sección. " +
  "Cuando te asignen algo, aparecerá aquí.";

/**
 * Vacío state — DESIGN.md: "icono suave + título + explicación de quién asigna
 * + salida útil (contactar Innovación)".
 *
 * The contact action is secondary, not primary: a view that shows an empty
 * state may still own its own primary action, and DESIGN.md allows only one.
 */
export function EmptyState({ title, description = DEFAULT_DESCRIPTION, onContact }: EmptyStateProps) {
  return (
    <MessageState
      icon="☐"
      title={title}
      description={description}
      actions={
        onContact ? (
          <button type="button" className="lx-btn lx-btn-secondary" onClick={onContact}>
            Contactar al Área de Innovación
          </button>
        ) : null
      }
    />
  );
}
