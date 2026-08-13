"use client";

import { MessageState } from "./message-state";

export interface ErrorStateProps {
  title?: string;
  /**
   * Plain-language reason. DESIGN.md: "lenguaje claro sin códigos" — there is
   * deliberately no prop for an error code, status or stack. Technical detail
   * belongs in logs, never on screen.
   */
  description?: string;
  /** Required: DESIGN.md gives the Error state a Reintentar button, always. */
  onRetry: () => void;
}

const DEFAULT_TITLE = "No pudimos cargar la información";
const DEFAULT_DESCRIPTION =
  "Hubo un problema al mostrar esta sección. Intenta de nuevo; " +
  "si sigue ocurriendo, avisa al Área de Innovación.";

/** Error state — DESIGN.md: círculo rojo "!", lenguaje claro, botón Reintentar. */
export function ErrorState({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  onRetry,
}: ErrorStateProps) {
  return (
    <MessageState
      icon="!"
      tone="danger"
      live="alert"
      title={title}
      description={description}
      actions={
        <button type="button" className="lx-btn lx-btn-primary" onClick={onRetry}>
          Reintentar
        </button>
      }
    />
  );
}
