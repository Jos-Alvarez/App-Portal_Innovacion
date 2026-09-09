import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    <SWRConfig
      value={{
        provider: () => new Map(),
        /*
         * Sin estrangulador de foco. En producción SWR admite una revalidación
         * por foco cada 5 s contados desde el montaje, lo que en una prueba
         * significaría esperar 5 s reales para provocar la única revalidación
         * que estas pruebas necesitan — la que hasta el ítem #19 ocurría sola al
         * montar. El intervalo estrangulado no es lo que se está probando acá.
         */
        focusThrottleInterval: 0,
      }}
    >
      <MisRecursos recursosIniciales={recursosIniciales} />
    </SWRConfig>
  );
}

/**
 * La tarjeta de un recurso, buscada por su encabezado.
 *
 * Y no `getByRole("listitem", { name })`: un `listitem` no toma su nombre
 * accesible del contenido — solo un `aria-label` se lo daría, y ponerle uno
 * igual al `h2` que ya tiene adentro haría que se anuncie dos veces. El
 * encabezado sí lleva el nombre, así que se busca ese y se sube a su tarjeta.
 */
function tarjeta(nombre: string): HTMLElement {
  const titulo = screen.getByRole("heading", { name: new RegExp(nombre, "i") });
  const contenedor = titulo.closest("li");

  if (contenedor === null) {
    throw new Error(`La tarjeta de «${nombre}» no está dentro de la grilla`);
  }

  return contenedor;
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
    it("lista los tres tipos en una sola grilla", () => {
      render(montar([AGENTE, PROCESADOR, APP]));

      expect(screen.getByText("Portal de Compras")).toBeInTheDocument();
      expect(screen.getByText("Asistente de Contratos")).toBeInTheDocument();
      expect(screen.getByText("Maestro de Excel")).toBeInTheDocument();
    });

    it("pone en cada tarjeta el chip que nombra su tipo", () => {
      render(montar([APP, AGENTE, PROCESADOR]));

      expect(within(tarjeta("Portal de Compras")).getByText("Aplicación")).toBeInTheDocument();
      expect(within(tarjeta("Asistente de Contratos")).getByText("Agente de IA")).toBeInTheDocument();
      expect(within(tarjeta("Maestro de Excel")).getByText("Procesador")).toBeInTheDocument();
    });

    it("muestra la descripción cuando la hay y no inventa nada cuando no", () => {
      render(montar([APP, AGENTE]));

      expect(screen.getByText("Solicitudes y órdenes de compra")).toBeInTheDocument();
      /* The agente has none: its card carries its name and its chip, nothing else. */
      expect(within(tarjeta("Asistente de Contratos")).getByText("Agente de IA")).toBeInTheDocument();
    });

    it("distingue un enlace y un procesador que comparten el id", () => {
      /* ADR 0002 keeps them in different tables, so `id` alone is not a key. */
      render(montar([APP, PROCESADOR]));

      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  LOS FILTROS SALEN DE LA LISTA, NO DE LA LISTA DE TIPOS POSIBLES
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Un chip que no puede devolver nada es una promesa vacía. Y como cada chip
   * existe solo si hay al menos una tarjeta suya, ningún filtro puede dejar la
   * grilla vacía — por eso esta pantalla no tiene un estado de «sin
   * resultados» que probar.
   */
  describe("los filtros por tipo", () => {
    it("ofrece un chip por cada clase presente, y ninguno más", () => {
      render(montar([APP, PROCESADOR]));

      const filtros = within(screen.getByRole("group", { name: /filtrar por tipo/i }));

      expect(filtros.getByRole("button", { name: "Todos" })).toBeInTheDocument();
      expect(filtros.getByRole("button", { name: "Aplicaciones" })).toBeInTheDocument();
      expect(filtros.getByRole("button", { name: "Procesadores" })).toBeInTheDocument();
      /* No hay ningún agente asignado: ofrecer el chip sería ofrecer un vacío. */
      expect(filtros.queryByRole("button", { name: "Agentes de IA" })).not.toBeInTheDocument();
    });

    it("no dibuja filtros cuando hay una sola clase: no habría nada que separar", () => {
      render(montar([APP, { ...APP, id: 99, nombre: "Otra App" }]));

      expect(screen.queryByRole("group", { name: /filtrar por tipo/i })).not.toBeInTheDocument();
    });

    it("deja en la grilla solo la clase elegida", async () => {
      const user = userEvent.setup();
      render(montar([APP, AGENTE, PROCESADOR]));

      await user.click(screen.getByRole("button", { name: "Procesadores" }));

      expect(screen.getByRole("heading", { name: "Maestro de Excel" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Portal de Compras" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Asistente de Contratos" }),
      ).not.toBeInTheDocument();
    });

    it("dice cuál está puesto, que es lo que lee la tecnología asistiva", async () => {
      const user = userEvent.setup();
      render(montar([APP, PROCESADOR]));

      expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await user.click(screen.getByRole("button", { name: "Aplicaciones" }));

      expect(screen.getByRole("button", { name: "Aplicaciones" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("vuelve a «Todos» cuando una revalidación se lleva la clase filtrada", async () => {
      /*
       * Alguien revocó el último procesador del otro lado mientras el lector lo
       * tenía filtrado. Sin la vuelta a «Todos», el chip desaparecería y la
       * grilla quedaría vacía sin que nada explique por qué.
       */
      const user = userEvent.setup();
      obtenerMisRecursos.mockResolvedValue([APP]);
      render(montar([APP, PROCESADOR]));

      await user.click(screen.getByRole("button", { name: "Procesadores" }));
      expect(screen.queryByRole("heading", { name: "Portal de Compras" })).not.toBeInTheDocument();

      revalidarPorFoco();

      /* Se fue el procesador, se fueron los filtros, y la app vuelve a verse
         en vez de dejar una grilla vacía sin explicación. */
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: "Portal de Compras" })).toBeInTheDocument(),
      );
      expect(screen.queryByRole("group", { name: /filtrar por tipo/i })).not.toBeInTheDocument();
    });
  });

  describe("la tarjeta", () => {
    it("marca su clase también en el borde, no solo en el chip", () => {
      render(montar([APP, AGENTE, PROCESADOR]));

      /* El color sale del CSS; lo que el marcado tiene que garantizar es que la
         clase esté ahí para que una regla pueda leerla. */
      expect(tarjeta("Portal de Compras")).toHaveAttribute("data-tipo", "app");
      expect(tarjeta("Asistente de Contratos")).toHaveAttribute("data-tipo", "agente");
      expect(tarjeta("Maestro de Excel")).toHaveAttribute("data-tipo", "procesador");
    });

    it("dice a dónde lleva su acción antes de que la toquen", () => {
      render(montar([APP, PROCESADOR]));

      expect(
        within(tarjeta("Portal de Compras")).getByText("Se abre en una pestaña nueva"),
      ).toBeInTheDocument();
      expect(
        within(tarjeta("Maestro de Excel")).getByText("Se ejecuta aquí, en el portal"),
      ).toBeInTheDocument();
    });

    it("nombra cada recurso como encabezado, no como texto en negrita", () => {
      render(montar([APP, PROCESADOR]));

      expect(screen.getAllByRole("heading")).toHaveLength(2);
    });
  });

  describe("la acción de abrir un enlace", () => {
    it("apunta a la ruta del portal, nunca al destino externo", () => {
      render(montar([APP]));

      const abrir = within(tarjeta("Portal de Compras")).getByRole("link");

      expect(abrir).toHaveAttribute("href", "/api/enlaces/4/abrir");
    });

    it("abre en una pestaña nueva sin entregarle el control de esta", () => {
      render(montar([AGENTE]));

      const abrir = within(tarjeta("Asistente de Contratos")).getByRole("link");

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

  describe("la acción de ejecutar un procesador", () => {
    it("aparece en la lista: está asignado", () => {
      render(montar([PROCESADOR]));

      expect(screen.getByText("Maestro de Excel")).toBeInTheDocument();
    });

    /*
     * El ítem #10 reemplazó el rótulo «Disponible próximamente» por un enlace de
     * verdad. La pantalla existe, así que la fila ya no tiene por qué pedir
     * disculpas.
     */
    it("lleva a la pantalla de ejecución del portal", () => {
      render(montar([PROCESADOR]));

      const ejecutar = within(tarjeta("Maestro de Excel")).getByRole("link");

      expect(ejecutar).toHaveAttribute("href", "/procesadores/4");
    });

    /*
     * A diferencia del enlace externo, el procesador se queda en esta pestaña:
     * es una pantalla del portal donde la persona trabaja hasta dos minutos y
     * recibe una descarga, y ya trae su propia vuelta al panel.
     */
    it("se queda en la misma pestaña, al contrario que un enlace externo", () => {
      render(montar([PROCESADOR]));

      const ejecutar = within(tarjeta("Maestro de Excel")).getByRole("link");

      expect(ejecutar).not.toHaveAttribute("target");
    });

    it("nombra el recurso en la acción, porque todas las filas dicen «Ejecutar»", () => {
      render(montar([PROCESADOR]));

      expect(
        screen.getByRole("link", { name: /Ejecutar Maestro de Excel/i }),
      ).toBeInTheDocument();
    });

    it("ya no explica ninguna espera debajo de la grilla", () => {
      render(montar([PROCESADOR, APP]));

      expect(screen.queryByText(/el Área de Innovación te avisará/i)).not.toBeInTheDocument();
    });
  });

  describe("el estado vacío", () => {
    it("no dibuja una grilla sin tarjetas", () => {
      render(montar([]));

      expect(screen.queryByRole("list")).not.toBeInTheDocument();
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

  /**
   * Dispara la revalidación por foco.
   *
   * Hasta el ítem #19 estas pruebas no necesitaban disparar nada: SWR consultaba
   * sola al montar, incluso con `fallbackData`, y esa consulta redundante es el
   * defecto que `lib/swr-pre-lectura.ts` corrige. Ahora el foco es el disparador
   * más cercano a la realidad: es la mitad de la política del ADR 0007 que
   * atiende al lector que vuelve a la pestaña.
   *
   * SWR limita el foco a uno cada `focusThrottleInterval` (5 s), así que dos
   * revalidaciones seguidas necesitan avanzar el reloj entre medio.
   */
  function revalidarPorFoco() {
    window.dispatchEvent(new Event("focus"));
  }

  describe("la revalidación de SWR", () => {
    it("pinta la lista del servidor sin esperar a la primera petición", () => {
      /* The fetcher never resolves in this test: whatever is on screen came from
         `fallbackData`. No spinner, no empty flash between paint and hydration. */
      render(montar([APP]));

      expect(screen.getByText("Portal de Compras")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    /*
     * Lo contrario de lo que esta prueba afirmaba hasta el ítem #19, y el cambio
     * es deliberado: `app/(portal)/page.tsx` leyó estas filas en ESTE request y
     * se las pasó al componente. Volver a pedirlas al montar era un viaje de ida
     * y vuelta por página cargada para redibujar lo que ya estaba en el HTML.
     */
    it("no vuelve a preguntar al montar: el servidor ya leyó esta lista", async () => {
      render(montar([APP]));

      /* Después de vaciar las colas: la consulta del montaje cae en un microtask
         posterior, así que una aserción síncrona pasaría por casualidad. */
      await new Promise((listo) => setTimeout(listo, 0));

      expect(obtenerMisRecursos).not.toHaveBeenCalled();
      expect(screen.getByText("Portal de Compras")).toBeInTheDocument();
    });

    it("quita de la pantalla un recurso que el servidor ya no devuelve", async () => {
      obtenerMisRecursos.mockResolvedValue([APP]);

      render(montar([APP, AGENTE]));

      expect(screen.getByText("Asistente de Contratos")).toBeInTheDocument();

      revalidarPorFoco();

      await waitFor(() =>
        expect(screen.queryByText("Asistente de Contratos")).not.toBeInTheDocument(),
      );
      expect(screen.getByText("Portal de Compras")).toBeInTheDocument();
    });

    it("agrega un recurso nuevo sin recargar la página", async () => {
      obtenerMisRecursos.mockResolvedValue([APP, PROCESADOR]);

      render(montar([APP]));
      revalidarPorFoco();

      await waitFor(() => expect(screen.getByText("Maestro de Excel")).toBeInTheDocument());
    });

    it("cae al estado vacío cuando el servidor confirma que ya no queda nada", async () => {
      obtenerMisRecursos.mockResolvedValue([]);

      render(montar([APP]));
      revalidarPorFoco();

      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: "Todavía no tienes recursos asignados" }),
        ).toBeInTheDocument(),
      );
    });

    it("NO vacía un dashboard que funciona cuando la actualización falla", async () => {
      obtenerMisRecursos.mockRejectedValue(new Error("500"));

      render(montar([APP, PROCESADOR]));
      revalidarPorFoco();

      await waitFor(() => expect(screen.getByText(AVISO_SIN_ACTUALIZAR)).toBeInTheDocument());

      /* Lo que importa: las filas siguen ahí y siguen siendo usables. */
      expect(screen.getByText("Portal de Compras")).toBeInTheDocument();
      expect(screen.getByText("Maestro de Excel")).toBeInTheDocument();
      expect(within(tarjeta("Portal de Compras")).getByRole("link")).toHaveAttribute(
        "href",
        "/api/enlaces/4/abrir",
      );
    });

    it("no muestra el aviso de desactualización mientras todo va bien", async () => {
      obtenerMisRecursos.mockResolvedValue([APP]);

      render(montar([APP]));
      revalidarPorFoco();

      await waitFor(() => expect(obtenerMisRecursos).toHaveBeenCalled());
      expect(screen.queryByText(AVISO_SIN_ACTUALIZAR)).not.toBeInTheDocument();
    });

    it("avisa sin interrumpir: el aviso es «status», no «alert»", async () => {
      obtenerMisRecursos.mockRejectedValue(new Error("500"));

      render(montar([APP]));
      revalidarPorFoco();

      await waitFor(() => expect(screen.getByText(AVISO_SIN_ACTUALIZAR)).toBeInTheDocument());
      expect(screen.getByRole("status")).toHaveTextContent(AVISO_SIN_ACTUALIZAR);
    });

    it("retira el aviso en cuanto una revalidación posterior sí llega", async () => {
      obtenerMisRecursos.mockRejectedValueOnce(new Error("500")).mockResolvedValue([APP, AGENTE]);

      render(montar([APP]));
      revalidarPorFoco();

      /* Con temporizadores reales, para que el primer fallo sea lo único que
         ocurra: el reintento con backoff de SWR queda a segundos de aquí. */
      await waitFor(() => expect(screen.getByText(AVISO_SIN_ACTUALIZAR)).toBeInTheDocument());

      vi.useFakeTimers();
      await vi.advanceTimersByTimeAsync(5_001);
      revalidarPorFoco();

      await vi.waitFor(() => expect(screen.getByText("Asistente de Contratos")).toBeInTheDocument());
      expect(screen.queryByText(AVISO_SIN_ACTUALIZAR)).not.toBeInTheDocument();
    });

    it("se pone al día al volver a la pestaña", async () => {
      /* El caso que ADR 0007 realmente cubre: el colaborador dejó la pestaña
         abierta, se fue a una reunión y volvió. `revalidateOnFocus` es la mitad
         de la política que atiende ese momento. */
      obtenerMisRecursos.mockResolvedValue([APP, AGENTE]);

      render(montar([APP]));

      /* Ya no hay consulta de montaje: la del foco es la primera de todas, que
         es exactamente el momento que el ADR 0007 describe. Con temporizadores
         reales, porque el intervalo de 60 s no participa de este caso. */
      expect(obtenerMisRecursos).not.toHaveBeenCalled();

      revalidarPorFoco();

      await waitFor(() => expect(screen.getByText("Asistente de Contratos")).toBeInTheDocument());
      expect(obtenerMisRecursos).toHaveBeenCalledTimes(1);
    });

    it("vuelve a preguntar sola al cabo de un minuto, sin que nadie toque nada", async () => {
      vi.useFakeTimers();
      obtenerMisRecursos.mockResolvedValue([APP]);

      render(montar([APP]));

      /* Cero al montar: el intervalo es ahora el primero que pregunta algo. */
      expect(obtenerMisRecursos).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60_000);

      await vi.waitFor(() => expect(obtenerMisRecursos).toHaveBeenCalledTimes(1));
    });
  });
});
