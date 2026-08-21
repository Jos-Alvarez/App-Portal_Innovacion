"use client";

import { ErrorState } from "@/components/states/error-state";

import styles from "./procesador.module.css";

/**
 * Error — DESIGN.md: "círculo rojo '!', lenguaje claro sin códigos, botón
 * Reintentar".
 *
 * THIS IS NOT THE PROCESSOR ERROR BANNER, AND THE TWO MUST NOT BE MERGED. This
 * boundary catches the SERVER READ failing: SQL Server did not answer, so the
 * page never learned which procesador it was showing and there is nothing on
 * screen to keep. The banner in `ejecutar-procesador.tsx` is the opposite — the
 * page is fine, the form is still usable, and one execution was refused for a
 * reason the reader can act on. DESIGN.md specifies them separately for exactly
 * that reason.
 *
 * Next hands this boundary the thrown error and a `reset` that re-renders the
 * segment. The error object is deliberately NOT shown: the reader gets the
 * plain sentence, and the detail stays in the server log.
 */
export default function ErrorProcesador({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={styles.main}>
      <ErrorState
        title="No pudimos cargar este procesador"
        description="Hubo un problema al leer su configuración. Intenta de nuevo; si sigue ocurriendo, avisa al Área de Innovación."
        onRetry={reset}
      />
    </main>
  );
}
