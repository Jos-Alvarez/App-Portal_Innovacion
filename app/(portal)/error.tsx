"use client";

import { ErrorState } from "@/components/states/error-state";

import styles from "./portal.module.css";

/**
 * Error — DESIGN.md: "círculo rojo '!', lenguaje claro sin códigos, botón
 * Reintentar".
 *
 * This boundary catches the SERVER read failing — the page never got a list to
 * paint, so there is nothing to keep on screen and the whole view is the error.
 * That is the opposite case to a failed SWR revalidation, which leaves a working
 * list in place and only adds a line saying it may be stale (`mis-recursos.tsx`
 * explains why the two failures are shown so differently).
 *
 * Next hands this boundary the thrown error and a `reset` that re-renders the
 * segment. The error object is deliberately NOT shown: the reader gets the plain
 * sentence, and the detail stays in the server log.
 */
export default function ErrorPortal({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={styles.main}>
      <ErrorState
        title="No pudimos cargar tus recursos"
        description="Hubo un problema al leer lo que tienes asignado. Intenta de nuevo; si sigue ocurriendo, avisa al Área de Innovación."
        onRetry={reset}
      />
    </main>
  );
}
