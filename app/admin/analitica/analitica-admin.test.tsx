import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Metricas } from "@/lib/analitica/metricas";
import type { RespuestaAnalitica } from "@/lib/analitica/servicio";

const obtenerAnalitica = vi.fn();

vi.mock("./analitica-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./analitica-client")>()),
  obtenerAnalitica: (ruta: string) => obtenerAnalitica(ruta),
}));

import { AnaliticaAdmin } from "./analitica-admin";
import { AVISO_SIN_ACTUALIZAR, MENSAJE_RANGO_INVERTIDO } from "./analitica-client";

/**
 * La pantalla de analítica del ítem #19.
 *
 * WHAT IS NOT RE-TESTED HERE. `app/api/analitica/route.test.ts` owns the
 * endpoint, `lib/analitica/*` owns the arithmetic and the day boundary, and
 * `analitica-client.test.ts` owns the query string and the fetcher. None of that
 * is reachable through a rendered screen, and asserting it here would only
 * assert the mock. What is left is this screen's own behaviour: which question
 * it asks, what it does while an answer is missing, and what it refuses to
 * invent.
 */

const HOY = "2026-08-21";

function metricas(parcial: Partial<Metricas> = {}): Metricas {
  return {
    recursos: [],
    usuarios: [],
    areas: [],
    adopcion: { conAcceso: 0, activos: 0 },
    errores: [],
    sugerencias: {
      total: 0,
      porEstado: { pendiente: 0, en_revision: 0, aprobada: 0, rechazada: 0, implementada: 0 },
      porArea: [],
    },
    ...parcial,
  };
}

const CON_DATOS = metricas({
  recursos: [
    {
      tipo: "enlace",
      id: 1,
      nombre: "Tablero de peajes",
      activo: true,
      aperturas: 9,
      ejecuciones: 0,
      errores: 0,
      usos: 9,
    },
    {
      tipo: "procesador",
      id: 1,
      nombre: "Conciliador",
      activo: false,
      aperturas: 0,
      ejecuciones: 4,
      errores: 6,
      usos: 4,
    },
    /* Un evento que sobrevivió a la fila del catálogo: ADR 0002 no le pone FK. */
    {
      tipo: "enlace",
      id: 41,
      nombre: null,
      activo: false,
      aperturas: 2,
      ejecuciones: 0,
      errores: 0,
      usos: 2,
    },
  ],
  usuarios: [
    { id: 7, nombre: "Ana Quispe", area: "Peajes", activo: true, aperturas: 9, ejecuciones: 0, usos: 9 },
    { id: 8, nombre: "Luis Roca", area: "", activo: true, aperturas: 2, ejecuciones: 4, usos: 6 },
  ],
  areas: [
    { area: "Peajes", personas: 1, usos: 9 },
    { area: "", personas: 1, usos: 6 },
  ],
  adopcion: { conAcceso: 14, activos: 2 },
  errores: [
    {
      id: 1,
      nombre: "Conciliador",
      activo: false,
      porTipo: {
        error_formato: 4,
        error_tamano: 2,
        error_contenido: 0,
        error_cantidad: 0,
        error_clave_inexistente: 0,
      },
      total: 6,
    },
  ],
  sugerencias: {
    total: 3,
    porEstado: { pendiente: 2, en_revision: 1, aprobada: 0, rechazada: 0, implementada: 0 },
    porArea: [{ area: "Peajes", total: 3 }],
  },
});

const REPORTE: RespuestaAnalitica = {
  periodo: { desde: HOY, hasta: HOY, dias: 1 },
  metricas: CON_DATOS,
  comparacion: null,
};

/** Una isla de cache por prueba: si no, un periodo cacheado se filtra a la siguiente. */
function Envoltorio({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  );
}

function montar(reporte: RespuestaAnalitica = REPORTE) {
  return render(
    <Envoltorio>
      <AnaliticaAdmin reporteInicial={reporte} hoy={HOY} />
    </Envoltorio>,
  );
}

/** La tabla de un panel, buscada por su `caption` accesible. */
function tabla(nombre: string) {
  return screen.getByRole("table", { name: nombre });
}

beforeEach(() => {
  obtenerAnalitica.mockReset().mockResolvedValue(REPORTE);
});

describe("la primera pintura", () => {
  /*
   * El servidor ya leyó «hoy» en el Server Component. Pedirlo otra vez al montar
   * gastaría tres agregaciones sobre `evento_uso` para redibujar lo que ya está
   * en el HTML.
   */
  it("usa lo que el servidor ya leyó y no pide nada", async () => {
    montar();

    expect(screen.getByText("21/08/2026")).toBeInTheDocument();

    /* Después de que se vacíen las colas: SWR revalida al montar por defecto,
       incluso con `fallbackData`, y esa consulta cuesta tres agregaciones. */
    await new Promise((listo) => setTimeout(listo, 0));

    expect(obtenerAnalitica).not.toHaveBeenCalled();
  });

  it("dibuja los seis cortes que pide el PRD", () => {
    montar();

    expect(tabla("Ranking de recursos por uso")).toBeInTheDocument();
    expect(tabla("Uso por persona")).toBeInTheDocument();
    expect(tabla("Uso por área")).toBeInTheDocument();
    expect(tabla("Sugerencias por área de origen")).toBeInTheDocument();
    expect(tabla("Errores de procesamiento por procesador y tipo")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resumen del periodo" })).toBeInTheDocument();
  });

  it("muestra la adopción como activos sobre asignados", () => {
    montar();

    expect(screen.getByText("14 %")).toBeInTheDocument();
    expect(screen.getByText("de 14 con acceso asignado")).toBeInTheDocument();
  });

  /* Los cinco estados con sus ceros: una distribución sin «Rechazada» se lee
     como que nunca se rechazó nada. */
  it("escribe los cinco estados de sugerencia aunque estén en cero", () => {
    montar();

    for (const etiqueta of ["Pendiente", "En revisión", "Aprobada", "Rechazada", "Implementada"]) {
      expect(screen.getByText(etiqueta)).toBeInTheDocument();
    }
  });

  it("nombra el área vacía en vez de dejar la celda en blanco", () => {
    montar();

    expect(within(tabla("Uso por área")).getByText("Sin área")).toBeInTheDocument();
  });

  /* El uso ocurrió de verdad: borrar la fila del ranking sería borrar historia. */
  it("conserva el recurso cuya fila del catálogo ya no existe", () => {
    montar();

    expect(screen.getByText("Recurso eliminado (#41)")).toBeInTheDocument();
  });

  it("sigue mostrando un recurso dado de baja, marcado como tal", () => {
    montar();

    const ranking = within(tabla("Ranking de recursos por uso"));

    expect(ranking.getByText("Conciliador")).toBeInTheDocument();
    expect(ranking.getAllByText("Dado de baja").length).toBeGreaterThan(0);
  });
});

describe("el periodo", () => {
  it("pide al servidor el preset elegido", async () => {
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Últimos 7 días" }));

    await waitFor(() => expect(obtenerAnalitica).toHaveBeenCalledWith("/api/analitica?rango=7d"));
  });

  it("marca el chip activo para quien no ve el relleno", async () => {
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Últimos 30 días" }));

    expect(screen.getByRole("button", { name: "Últimos 30 días" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Hoy" })).toHaveAttribute("aria-pressed", "false");
  });

  it("ofrece los dos campos de fecha solo en el rango personalizado", async () => {
    montar();

    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Personalizado" }));

    expect(screen.getByLabelText("Desde")).toBeInTheDocument();
    expect(screen.getByLabelText("Hasta")).toBeInTheDocument();
  });

  /*
   * El motor resuelve los periodos en la zona del portal, así que ofrecer un
   * «mañana» sería ofrecer un periodo que el servidor contesta vacío.
   */
  it("no deja pedir un día posterior a hoy", async () => {
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Personalizado" }));

    expect(screen.getByLabelText("Hasta")).toHaveAttribute("max", HOY);
  });

  it("no pregunta nada mientras el rango personalizado está a medio escribir", async () => {
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    await userEvent.type(screen.getByLabelText("Desde"), "2026-07-01");

    expect(obtenerAnalitica).not.toHaveBeenCalled();
  });

  it("nombra el rango invertido en vez de mandarlo al servidor", async () => {
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    await userEvent.type(screen.getByLabelText("Desde"), "2026-07-31");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-07-01");

    expect(screen.getByText(MENSAJE_RANGO_INVERTIDO)).toBeInTheDocument();
    expect(obtenerAnalitica).not.toHaveBeenCalled();
  });

  it("pide el rango cuando queda completo y en orden", async () => {
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    await userEvent.type(screen.getByLabelText("Desde"), "2026-07-01");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-07-31");

    await waitFor(() =>
      expect(obtenerAnalitica).toHaveBeenCalledWith(
        "/api/analitica?rango=personalizado&desde=2026-07-01&hasta=2026-07-31",
      ),
    );
  });
});

describe("la comparación", () => {
  const CON_COMPARACION: RespuestaAnalitica = {
    ...REPORTE,
    comparacion: {
      periodo: { desde: "2026-08-20", hasta: "2026-08-20", dias: 1 },
      metricas: metricas({
        recursos: [
          {
            tipo: "enlace",
            id: 1,
            nombre: "Tablero de peajes",
            activo: true,
            aperturas: 6,
            ejecuciones: 0,
            errores: 0,
            usos: 6,
          },
        ],
        adopcion: { conAcceso: 14, activos: 1 },
      }),
    },
  };

  it("la pide al servidor cuando se enciende", async () => {
    montar();

    await userEvent.click(screen.getByRole("switch", { name: "Comparar con el periodo anterior" }));

    await waitFor(() =>
      expect(obtenerAnalitica).toHaveBeenCalledWith("/api/analitica?rango=hoy&comparar=true"),
    );
  });

  it("nombra el periodo contra el que compara", async () => {
    obtenerAnalitica.mockResolvedValue(CON_COMPARACION);
    montar();

    await userEvent.click(screen.getByRole("switch", { name: "Comparar con el periodo anterior" }));

    await waitFor(() => expect(screen.getByText(/frente a 20\/08\/2026/)).toBeInTheDocument());
  });

  it("agrega la columna del periodo anterior a cada tabla", async () => {
    obtenerAnalitica.mockResolvedValue(CON_COMPARACION);
    montar();

    expect(
      within(tabla("Ranking de recursos por uso")).queryByText("Usos antes"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Comparar con el periodo anterior" }));

    await waitFor(() =>
      expect(within(tabla("Ranking de recursos por uso")).getByText("Usos antes")).toBeInTheDocument(),
    );
  });

  /*
   * `comparacion.ts` lo argumenta entero: en el periodo anterior, la ausencia de
   * una fila significa cero usos. Un recurso estrenado hoy sube desde cero.
   */
  it("trata como cero la fila que no existía en el periodo anterior", async () => {
    obtenerAnalitica.mockResolvedValue(CON_COMPARACION);
    montar();

    await userEvent.click(screen.getByRole("switch", { name: "Comparar con el periodo anterior" }));

    const ranking = await waitFor(() => tabla("Ranking de recursos por uso"));

    /* El enlace 1 pasó de 6 a 9; el procesador 1 no estaba antes y hoy tiene 4. */
    expect(within(ranking).getByText("+3")).toBeInTheDocument();
    expect(within(ranking).getByText("+4")).toBeInTheDocument();
  });

  it("no agrega filas: solo compara las del periodo actual", async () => {
    obtenerAnalitica.mockResolvedValue({
      ...REPORTE,
      metricas: metricas(),
      comparacion: {
        periodo: { desde: "2026-08-20", hasta: "2026-08-20", dias: 1 },
        metricas: CON_DATOS,
      },
    });
    montar();

    await userEvent.click(screen.getByRole("switch", { name: "Comparar con el periodo anterior" }));

    await waitFor(() =>
      expect(screen.getByText("Nadie abrió ni ejecutó nada en este periodo.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Tablero de peajes")).not.toBeInTheDocument();
  });
});

describe("los periodos vacíos", () => {
  it("explica cada panel por separado, no la pantalla entera", async () => {
    obtenerAnalitica.mockResolvedValue({ ...REPORTE, metricas: metricas() });
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Últimos 7 días" }));

    await waitFor(() =>
      expect(screen.getByText("Nadie abrió ni ejecutó nada en este periodo.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Ninguna persona registró actividad en este periodo.")).toBeInTheDocument();
    expect(screen.getByText("No llegaron sugerencias en este periodo.")).toBeInTheDocument();
    expect(screen.getByText("Ningún procesador rechazó archivos en este periodo.")).toBeInTheDocument();
  });

  /* Sin nadie con acceso no hay 0 % de adopción: no hay nada que adoptar. */
  it("no reporta 0 % de adopción cuando nadie tiene acceso asignado", async () => {
    obtenerAnalitica.mockResolvedValue({ ...REPORTE, metricas: metricas() });
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Últimos 7 días" }));

    await waitFor(() => expect(screen.getByText("—")).toBeInTheDocument());
    expect(screen.queryByText("0 %")).not.toBeInTheDocument();
  });
});

describe("cuando la lectura falla", () => {
  /*
   * Un tablero completo en pantalla no se reemplaza por un error: nada de lo que
   * hay se volvió falso, solo puede tener un minuto. Quitarlo le sacaría al
   * lector el informe que está leyendo.
   */
  it("conserva los números en pantalla y avisa que pueden estar viejos", async () => {
    obtenerAnalitica.mockRejectedValue(new Error("500"));
    montar();

    await userEvent.click(screen.getByRole("switch", { name: "Comparar con el periodo anterior" }));

    await waitFor(() => expect(screen.getByText(AVISO_SIN_ACTUALIZAR)).toBeInTheDocument());
    expect(screen.getByText("Tablero de peajes")).toBeInTheDocument();
  });

  /*
   * La razón de que esta pantalla tenga un solo mensaje de fallo: nunca se queda
   * sin nada que mostrar. El servidor ya mandó el primer periodo completo y
   * `keepPreviousData` conserva el último bueno, así que un periodo nuevo que
   * falla deja en pantalla el anterior, rotulado con SU propio periodo.
   */
  it("nunca se queda vacía: el periodo que falla deja en pie al último bueno", async () => {
    obtenerAnalitica.mockRejectedValue(new Error("500"));
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    await userEvent.type(screen.getByLabelText("Desde"), "2026-07-01");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-07-31");

    await waitFor(() => expect(screen.getByText(AVISO_SIN_ACTUALIZAR)).toBeInTheDocument());

    expect(screen.getByText("Tablero de peajes")).toBeInTheDocument();
    expect(screen.getByText("21/08/2026")).toBeInTheDocument();
  });
});
