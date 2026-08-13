"use client";

import { ErrorState } from "@/components/states/error-state";

import styles from "./enlaces.module.css";

/**
 * Error — DESIGN.md: "círculo rojo '!', lenguaje claro sin códigos, botón
 * Reintentar".
 *
 * Next hands this boundary the thrown error and a `reset` that re-renders the
 * segment. The error object is deliberately NOT shown: the reader gets the
 * plain sentence `ErrorState` already carries, and the detail stays in the
 * server log where the route handlers already send it.
 */
export default function ErrorEnlaces({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={styles.main}>
      <ErrorState
        title="No pudimos cargar el catálogo de enlaces"
        description="Hubo un problema al leer los enlaces. Intenta de nuevo; si sigue ocurriendo, avisa al Área de Innovación."
        onRetry={reset}
      />
    </main>
  );
}
