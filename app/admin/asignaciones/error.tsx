"use client";

import { ErrorState } from "@/components/states/error-state";

import styles from "./asignaciones.module.css";

/**
 * Error — DESIGN.md: "círculo rojo '!', lenguaje claro sin códigos, botón
 * Reintentar".
 *
 * One boundary for both screens: `[usuarioId]` has no `error.tsx` of its own,
 * so a failed read of either the person list or one person's accesses lands
 * here, and the copy is written to cover both.
 *
 * Next hands this boundary the thrown error and a `reset` that re-renders the
 * segment. The error object is deliberately NOT shown: the reader gets the
 * plain sentence, and the detail stays in the server log.
 */
export default function ErrorAsignaciones({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={styles.main}>
      <ErrorState
        title="No pudimos cargar las asignaciones"
        description="Hubo un problema al leer las personas o sus accesos. Intenta de nuevo; si sigue ocurriendo, avisa al Área de Innovación."
        onRetry={reset}
      />
    </main>
  );
}
