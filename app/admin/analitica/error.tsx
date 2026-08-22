"use client";

import { ErrorState } from "@/components/states/error-state";

import styles from "./analitica.module.css";

/**
 * Error — DESIGN.md: "círculo rojo '!', lenguaje claro sin códigos, botón
 * Reintentar".
 *
 * This boundary catches the SERVER read only — the first period, computed in the
 * page. A failure while the reader is switching periods never reaches here: SWR
 * keeps the last good report on screen and the screen shows a notice above it,
 * because losing a whole dashboard to one bad minute is worse than reading
 * numbers that are sixty seconds old.
 *
 * The error object is deliberately not shown: the reader gets the plain sentence
 * `ErrorState` carries, and the detail stays in the server log where the route
 * handler already sends it.
 */
export default function ErrorAnalitica({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={styles.main}>
      <ErrorState
        title="No pudimos cargar la analítica"
        description="Hubo un problema al calcular los datos de uso del portal. Intenta de nuevo; si sigue ocurriendo, avisa al equipo de sistemas."
        onRetry={reset}
      />
    </main>
  );
}
