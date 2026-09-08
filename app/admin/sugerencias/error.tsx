"use client";

import { ErrorState } from "@/components/states/error-state";

/**
 * Error — DESIGN.md: "círculo rojo '!', lenguaje claro sin códigos, botón
 * Reintentar".
 *
 * Next hands this boundary the thrown error and a `reset` that re-renders the
 * segment. The error object is deliberately NOT shown: the reader gets the plain
 * sentence `ErrorState` already carries, and the detail stays in the server log
 * where the route handlers already send it.
 */
export default function ErrorSugerenciasAdmin({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="lx-main">
      <ErrorState
        title="No pudimos cargar las sugerencias"
        description="Hubo un problema al leer el buzón. Intenta de nuevo; si sigue ocurriendo, avisa al equipo de sistemas."
        onRetry={reset}
      />
    </main>
  );
}
