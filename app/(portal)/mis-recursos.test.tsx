import { render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RecursoAsignado } from "@/lib/mis-recursos/repository";

const obtenerMisRecursos = vi.fn();

vi.mock("./mis-recursos-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mis-recursos-client")>()),
  obtenerMisRecursos: (ruta: string) => obtenerMisRecursos(ruta),
}));

import { AVISO_SIN_ACTUALIZAR } from "./mis-recursos-client";
import { MisRecursos } from "./mis-recursos";

/**
 * The dashboard's own layer: what a row looks like per kind of resource, what
 * clicking one does, what an empty list says, and how the SWR wiring behaves.
 *
 * WHAT IS NOT RE-TESTED HERE. Part 1 covers `GET /api/mis-recursos` and
 * `GET /api/enlaces/{id}/abrir` with 62 tests — the guard, the merged list, the
 * 302, the recorded apertura, the status codes. None of that is reachable
 * through a rendered table, and asserting it here would only assert the mock.
 * `mis-recursos-client.test.ts` owns the fetcher's contract. What is left is
 * this screen's own behaviour, and it is where every test below points.
 */

const APP: RecursoAsignado = {
  tipo: "app",
  id: 4,
  nombre: "Portal de Compras",
  descripcion: "Solicitudes y órdenes de compra",
};

const AGENTE: RecursoAsignado = {
  tipo: "agente",
  id: 9,
  nombre: "Asistente de Contratos",
  descripcion: null,
};

const PROCESADOR: RecursoAsignado = {
  tipo: "procesador",
  id: 4,
  nombre: "Maestro de Excel",
  descripcion: "Consolida varias hojas en una",
};

/**
 * A fresh SWR cache per test. Without it the module-level cache would carry one
 * test's resources into the next, and the second render would paint rows the
 * test never gave it.
 */
function montar(recursosIniciales: readonly RecursoAsignado[]): ReactNode {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <MisRecursos recursosIniciales={recursosIniciales} />
    </SWRConfig>
  );
}

/** The row whose accessible name contains this resource's name. */
function fila(nombre: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(nombre, "i") });
}

describe("MisRecursos", () => {
  beforeEach(() => {
    /* Never resolving by default: a test that cares about revalidation says so. */
    obtenerMisRecursos.mockReset().mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("lo que se ve por tipo de recurso", () => {
    it("lista los tres tipos en una sola tabla", () => {
      render(montar([AGENTE, PROCESADOR, APP]));

      expect(screen.getByText("Portal de Compras")).toBeInTheDocument();
      expect(screen.getByText("Asistente de Contratos")).toBeInTheDocument();
      expect(screen.getByText("Maestro de Excel")).toBeInTheDocument();
    });

    it("pone en cada fila el chip que nombra su tipo", () => {
      render(montar([APP, AGENTE, PROCESADOR]));

      expect(within(fila("Portal de Compras")).getByText("Aplicación")).toBeInTheDocument();
      expect(within(fila("Asistente de Contratos")).getByText("Agente de IA")).toBeInTheDocument();
      expect(within(fila("Maestro de Excel")).getByText("Procesador")).toBeInTheDocument();
    });

    it("muestra la descripción cuando la hay y no inventa nada cuando no", () => {
      render(montar([APP, AGENTE]));

      expect(screen.getByText("Solicitudes y órdenes de compra")).toBeInTheDocument();
      /* The agente has none: its row carries its name and its chip, nothing else. */
      expect(within(fila("Asistente de Contratos")).getByText("Agente de IA")).toBeInTheDocument();
    });

    it("distingue un enlace y un procesador que comparten el id", () => {
      /* ADR 0002 keeps them in different tables, so `id` alone is not a key. */
      render(montar([APP, PROCESADOR]));

      expect(screen.getAllByRole("row")).toHaveLength(3); /* cabecera + dos filas */
    });
  });

  describe("la acción de abrir un enlace", () => {
    it("apunta a la ruta del portal, nunca al destino externo", () => {
      render(montar([APP]));

      const abrir = within(fila("Portal de Compras")).getByRole("link");

      expect(abrir).toHaveAttribute("href", "/api/enlaces/4/abrir");
    });

    it("abre en una pestaña nueva sin entregarle el control de esta", () => {
      render(montar([AGENTE]));

      const abrir = within(fila("Asistente de Contratos")).getByRole("link");

      expect(abrir).toHaveAttribute("target", "_blank");
      /* Sin `noopener`, la página abierta puede navegar la pestaña del portal. */
      expect(abrir).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("nombra el recurso en la acción, porque todas las filas dicen «Abrir»", () => {
      render(montar([APP, AGENTE]));

      expect(
        screen.getByRole("link", { name: /Portal de Compras/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Asistente de Contratos/i }),
      ).toBeInTheDocument();
    });

    it("trata igual una aplicación y un agente: ambos se abren", () => {
      render(montar([APP, AGENTE]));

      expect(screen.getAllByRole("link")).toHaveLength(2);
    });
  });

  describe("el procesador, que todavía no se puede ejecutar", () => {
    it("aparece en la lista: está asignado", () => {
      render(montar([PROCESADOR]));

      expect(screen.getByText("Maestro de Excel")).toBeInTheDocument();
    });

    it("no ofrece ningún enlace ni botón que no lleve a ninguna parte", () => {
      render(montar([PROCESADOR]));

      const suFila = fila("Maestro de Excel");

      expect(within(suFila).queryByRole("link")).not.toBeInTheDocument();
      expect(within(suFila).queryByRole("button")).not.toBeInTheDocument();
    });

    it("dice en la fila que su ejecución todavía no está disponible", () => {
      render(montar([PROCESADOR]));

      expect(within(fila("Maestro de Excel")).getByText("Disponible próximamente")).toBeInTheDocument();
    });

    it("explica una sola vez quién avisará cuando se habilite", () => {
      render(montar([PROCESADOR, APP]));

      expect(screen.getByText(/el Área de Innovación te avisará/i)).toBeInTheDocument();
    });

    it("calla esa explicación cuando no hay ningún procesador asignado", () => {
      render(montar([APP, AGENTE]));

      expect(screen.queryByText(/el Área de Innovación te avisará/i)).not.toBeInTheDocument();
    });
  });

  describe("el estado vacío", () => {
    it("no dibuja una tabla sin filas", () => {
      render(montar([]));

      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("dice qué falta y quién lo resuelve, sin culpar a nadie", () => {
      render(montar([]));

      expect(
        screen.getByRole("heading", { name: "Todavía no tienes recursos asignados" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/El Área de Innovación asigna/i)).toBeInTheDocument();
    });

    it("no distingue entre «no te asignaron nada» y «no hay nada que asignar»", () => {
      /* The collaborator cannot tell the two apart and the next step is the same
         either way; the screen would need a count of a catalogue it has no
         business reading to say something it could not act on. */
      render(montar([]));

      expect(screen.queryByText(/catálogo/i)).not.toBeInTheDocument();
      expect(screen.getAllByRole("heading")).toHaveLength(1);
    });
  });

  describe("la revalidación de SWR", () => {
    it("pinta la lista del servidor sin esperar a la primera petición", () => {
      /* The fetcher never resolves in this test: whatever is on screen came from
         `fallbackData`. No spinner, no empty flash between paint and hydration. */
      render(montar([APP]));

      expect(screen.getByText("Portal de Compras")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("vuelve a preguntar al montar, sin esperar al intervalo", async () => {
      render(montar([APP]));

      await waitFor(() => expect(obtenerMisRecursos).toHaveBeenCalledWith("/api/mis-recursos"));
    });

    it("quita de la pantalla un recurso que el servidor ya no devuelve", async () => {
      obtenerMisRecursos.mockResolvedValue([APP]);

      render(montar([APP, AGENTE]));

      expect(screen.getByText("Asistente de Contratos")).toBeInTheDocument();

      await waitFor(() =>
        expect(screen.queryByText("Asistente de Contratos")).not.toBeInTheDocument(),
      );
      expect(screen.getByText("Portal de Compras")).toBeInTheDocument();
    });

    it("agrega un recurso nuevo sin recargar la página", async () => {
      obtenerMisRecursos.mockResolvedValue([APP, PROCESADOR]);

      render(montar([APP]));

      await waitFor(() => expect(screen.getByText("Maestro de Excel")).toBeInTheDocument());
    });

    it("cae al estado vacío cuando el servidor confirma que ya no queda nada", async () => {
      obtenerMisRecursos.mockResolvedValue([]);

      render(montar([APP]));

      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: "Todavía no tienes recursos asignados" }),
        ).toBeInTheDocument(),
      );
    });

    it("NO vacía un dashboard que funciona cuando la actualización falla", async () => {
      obtenerMisRecursos.mockRejectedValue(new Error("500"));

      render(montar([APP, PROCESADOR]));

      await waitFor(() => expect(screen.getByText(AVISO_SIN_ACTUALIZAR)).toBeInTheDocument());

      /* Lo que importa: las filas siguen ahí y siguen siendo usables. */
      expect(screen.getByText("Portal de Compras")).toBeInTheDocument();
      expect(screen.getByText("Maestro de Excel")).toBeInTheDocument();
      expect(within(fila("Portal de Compras")).getByRole("link")).toHaveAttribute(
        "href",
        "/api/enlaces/4/abrir",
      );
    });

    it("no muestra el aviso de desactualización mientras todo va bien", async () => {
      obtenerMisRecursos.mockResolvedValue([APP]);

      render(montar([APP]));

      await waitFor(() => expect(obtenerMisRecursos).toHaveBeenCalled());
      expect(screen.queryByText(AVISO_SIN_ACTUALIZAR)).not.toBeInTheDocument();
    });

    it("avisa sin interrumpir: el aviso es «status», no «alert»", async () => {
      obtenerMisRecursos.mockRejectedValue(new Error("500"));

      render(montar([APP]));

      await waitFor(() => expect(screen.getByText(AVISO_SIN_ACTUALIZAR)).toBeInTheDocument());
      expect(screen.getByRole("status")).toHaveTextContent(AVISO_SIN_ACTUALIZAR);
    });

    it("retira el aviso en cuanto una revalidación posterior sí llega", async () => {
      obtenerMisRecursos.mockRejectedValueOnce(new Error("500")).mockResolvedValue([APP, AGENTE]);

      render(montar([APP]));

      /* Con temporizadores reales, para que el fallo del montaje sea lo único
         que ocurra: el reintento con backoff de SWR queda a segundos de aquí. */
      await waitFor(() => expect(screen.getByText(AVISO_SIN_ACTUALIZAR)).toBeInTheDocument());

      vi.useFakeTimers();
      await vi.advanceTimersByTimeAsync(5_001);
      window.dispatchEvent(new Event("focus"));

      await vi.waitFor(() => expect(screen.getByText("Asistente de Contratos")).toBeInTheDocument());
      expect(screen.queryByText(AVISO_SIN_ACTUALIZAR)).not.toBeInTheDocument();
    });

    it("se pone al día al volver a la pestaña", async () => {
      /* El caso que ADR 0007 realmente cubre: el colaborador dejó la pestaña
         abierta, se fue a una reunión y volvió. `revalidateOnFocus` es la mitad
         de la política que atiende ese momento. */
      vi.useFakeTimers();
      obtenerMisRecursos.mockResolvedValueOnce([APP]).mockResolvedValue([APP, AGENTE]);

      render(montar([APP]));

      await vi.waitFor(() => expect(obtenerMisRecursos).toHaveBeenCalledTimes(1));

      /* SWR limita las revalidaciones por foco a una cada `focusThrottleInterval`
         (5 s por defecto), contadas desde el montaje. Un intervalo de 60 s no
         llega a dispararse aquí, así que lo que se observa es el foco. */
      await vi.advanceTimersByTimeAsync(5_001);
      window.dispatchEvent(new Event("focus"));

      await vi.waitFor(() => expect(screen.getByText("Asistente de Contratos")).toBeInTheDocument());
    });

    it("vuelve a preguntar sola al cabo de un minuto, sin que nadie toque nada", async () => {
      vi.useFakeTimers();
      obtenerMisRecursos.mockResolvedValue([APP]);

      render(montar([APP]));

      await vi.waitFor(() => expect(obtenerMisRecursos).toHaveBeenCalledTimes(1));

      await vi.advanceTimersByTimeAsync(60_000);

      await vi.waitFor(() => expect(obtenerMisRecursos).toHaveBeenCalledTimes(2));
    });
  });
});
