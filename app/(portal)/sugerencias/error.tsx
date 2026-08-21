"use client";

import { ErrorState } from "@/components/states/error-state";

import styles from "./sugerencias.module.css";

/**
 * Error — DESIGN.md: "círculo rojo '!', lenguaje claro sin códigos, botón
 * Reintentar".
 *
 * THIS IS NOT THE FAILED-SEND ALERT, AND THE TWO MUST NOT BE MERGED. This
 * boundary catches the SERVER READ failing: SQL Server did not answer, so the
 * page never learned what this collaborator had sent and there is nothing on
 * screen to keep — the whole view is the error. The red line beside the form in
 * `buzon.tsx` is the opposite case: the page is fine, everything the reader
 * typed is still in the fields, and one send was refused for a reason they can
 * act on.
 *
 * The copy says the suggestions could not be READ, and deliberately says nothing
 * about sending. Nothing was being sent when this boundary rendered, and a
 * message that implied otherwise would make someone wonder whether an idea they
 * had already submitted was lost.
 *
 * Next hands this boundary the thrown error and a `reset` that re-renders the
 * segment. The error object is deliberately NOT shown: the reader gets the plain
 * sentence, and the detail stays in the server log.
 */
export default function ErrorSugerencias({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={styles.main}>
      <ErrorState
        title="No pudimos cargar tus sugerencias"
        description="Hubo un problema al leer lo que enviaste. Intenta de nuevo; si sigue ocurriendo, avisa al Área de Innovación."
        onRetry={reset}
      />
    </main>
  );
}
