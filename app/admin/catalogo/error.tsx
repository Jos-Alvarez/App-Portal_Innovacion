"use client";

import { ErrorState } from "@/components/states/error-state";

/**
 * Error — DESIGN.md: "círculo rojo '!', lenguaje claro sin códigos, botón
 * Reintentar".
 *
 * Next hands this boundary the thrown error and a `reset` that re-renders the
 * segment. The error object is deliberately NOT shown: the reader gets the
 * plain sentence `ErrorState` already carries, and the detail stays in the
 * server log where the route handlers already send it.
 *
 * It does not name which of the two reads failed, and that is on purpose: the
 * page reads enlaces and procesadores together, the reader sees one catalogue,
 * and telling them which table was unreachable asks them to know about a split
 * this screen exists to hide.
 */
export default function ErrorCatalogo({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="lx-main">
      <ErrorState
        title="No pudimos cargar el catálogo"
        description="Hubo un problema al leer los recursos del portal. Intenta de nuevo; si sigue ocurriendo, avisa al Área de Innovación."
        onRetry={reset}
      />
    </main>
  );
}
