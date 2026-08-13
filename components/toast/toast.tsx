"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./toast.module.css";

/** DESIGN.md "Componentes": "inferior centrado, ... ~2.8s". */
export const TOAST_DURATION_MS = 2800;

export interface ToastProps {
  /** Spanish, direct, no jargon — DESIGN.md's copy rule. */
  message: string;
  /** Overridable only for the rare longer confirmation; defaults to ~2.8s. */
  durationMs?: number;
  /** Fired once the lifetime is over, so an owner can drop it from a queue. */
  onDismiss?: () => void;
}

/**
 * Toast — DESIGN.md: "Confirma toda acción sin navegación (guardar, asignar,
 * enviar, agrupar)".
 *
 * It owns its own lifetime and hides itself, because this slice ships the
 * components layer only: there is no provider or queue yet, and a toast that
 * waited for an owner to unmount it would simply never go away. When a queue
 * arrives it can drive the same component through `onDismiss` and mount one
 * Toast per entry.
 *
 * A new `message` restarts the lifetime, which is also how the same
 * confirmation is shown twice: change the key, or the message.
 */
export function Toast({ message, durationMs = TOAST_DURATION_MS, onDismiss }: ToastProps) {
  /*
   * What is remembered is which confirmation has already run out, not a bare
   * boolean. A new confirmation therefore becomes visible again by deriving it
   * during render, with no effect resetting state behind the scenes.
   */
  const confirmation = `${durationMs}:${message}`;
  const [expired, setExpired] = useState<string | null>(null);

  /* Held in a ref so an inline callback does not restart the timer on every
     render of the owner — only a new confirmation may do that. */
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setExpired(confirmation);
      onDismissRef.current?.();
    }, durationMs);

    return () => {
      clearTimeout(timer);
    };
  }, [confirmation, durationMs]);

  if (expired === confirmation) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      {message}
    </div>
  );
}
