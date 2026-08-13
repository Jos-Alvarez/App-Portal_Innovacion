"use client";

import { MessageState } from "./message-state";

export interface ForbiddenStateProps {
  title?: string;
  description?: string;
  /** The safe exit. A callback, so this component pulls in no router. */
  onBackToPortal: () => void;
  /**
   * PENDING PRODUCT DECISION — where "Solicitar acceso" leads is undefined.
   * DESIGN.md names the button but never says what it does, and the product
   * decision has not been made (mail to the Área de Innovación? a request form?
   * a ticket?). Rather than invent a destination, the caller owns the behaviour:
   * supply a handler and the action appears, omit it and the state renders
   * cleanly with only "Volver al portal". Resolve this before wiring Item #4.
   */
  onRequestAccess?: () => void;
}

const DEFAULT_TITLE = "No tienes acceso a esta sección";
const DEFAULT_DESCRIPTION =
  "El Área de Innovación administra los accesos del portal. " +
  "Si necesitas entrar aquí, solicítalo y lo revisarán.";

/**
 * Sin permiso (403) — DESIGN.md: candado + explicación + "Volver al portal" /
 * "Solicitar acceso".
 *
 * "Volver al portal" is the primary action, not "Solicitar acceso": it is the
 * one always present, which keeps exactly one navy action on screen whether or
 * not the optional request action is supplied.
 */
export function ForbiddenState({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  onBackToPortal,
  onRequestAccess,
}: ForbiddenStateProps) {
  return (
    <MessageState
      icon="🔒"
      live="alert"
      title={title}
      description={description}
      actions={
        <>
          <button type="button" className="lx-btn lx-btn-primary" onClick={onBackToPortal}>
            Volver al portal
          </button>
          {onRequestAccess ? (
            <button type="button" className="lx-btn lx-btn-secondary" onClick={onRequestAccess}>
              Solicitar acceso
            </button>
          ) : null}
        </>
      }
    />
  );
}
