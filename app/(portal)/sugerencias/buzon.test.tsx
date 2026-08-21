import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SugerenciaDTO } from "@/lib/sugerencias/repository";

const obtenerSugerencias = vi.fn();
const enviarSugerencia = vi.fn();

vi.mock("./sugerencias-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sugerencias-client")>()),
  obtenerSugerencias: (ruta: string) => obtenerSugerencias(ruta),
  enviarSugerencia: (datos: unknown) => enviarSugerencia(datos),
}));

import { Buzon } from "./buzon";
import { AVISO_SIN_ACTUALIZAR, CONFIRMACION_ENVIO } from "./sugerencias-client";

/**
 * El buzón: la pantalla completa del ítem #13 del lado del colaborador.
 *
 * WHAT IS NOT RE-TESTED HERE. `app/api/sugerencias/route.test.ts` owns the
 * endpoint — the guard, the scope, the ledger, the status codes — and
 * `sugerencias-client.test.ts` owns the fetcher and the send. None of that is
 * reachable through a rendered screen, and asserting it here would only assert
 * the mock. What is left is this screen's own behaviour.
 */

const PENDIENTE: SugerenciaDTO = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
  estado: "pendiente",
  fechaCreacion: "2026-08-21T14:30:00.000Z",
  historial: [
    {
      id: 90,
      estadoAnterior: null,
      estadoNuevo: "pendiente",
      fechaCambio: "2026-08-21T14:30:00.000Z",
      autor: "Ana Quispe",
    },
  ],
};

const APROBADA: SugerenciaDTO = {
  id: 12,
  titulo: "Firma digital de actas",
  descripcion: "Evitar imprimir para firmar.",
  areaDestino: "Legal",
  estado: "aprobada",
  fechaCreacion: "2026-07-02T13:00:00.000Z",
  historial: [
    {
      id: 20,
      estadoAnterior: null,
      estadoNuevo: "pendiente",
      fechaCambio: "2026-07-02T13:00:00.000Z",
      autor: "Ana Quispe",
    },
    {
      id: 21,
      estadoAnterior: "pendiente",
      estadoNuevo: "en_revision",
      fechaCambio: "2026-07-05T15:00:00.000Z",
      autor: "Rosa Díaz",
    },
    {
      id: 22,
      estadoAnterior: "en_revision",
      estadoNuevo: "aprobada",
      fechaCambio: "2026-07-09T16:20:00.000Z",
      autor: "Rosa Díaz",
    },
  ],
};

/**
 * A fresh SWR cache per test. Without it the module-level cache would carry one
 * test's suggestions into the next, and the second render would paint cards the
 * test never gave it.
 */
function montar(
  sugerenciasIniciales: readonly SugerenciaDTO[] = [],
  areaPropia = "Operaciones",
): ReactNode {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <Buzon sugerenciasIniciales={sugerenciasIniciales} areaPropia={areaPropia} />
    </SWRConfig>
  );
}

/** The card whose accessible content mentions this title. */
function tarjeta(titulo: string): HTMLElement {
  return screen.getByRole("heading", { name: titulo }).closest("article") as HTMLElement;
}

async function completarYEnviar(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText("Título"), "Tablero de peajes");
  await usuario.type(screen.getByLabelText("Tu idea"), "Ver el flujo por caseta.");
  await usuario.click(screen.getByRole("button", { name: /enviar sugerencia/i }));
}

beforeEach(() => {
  /* Never resolving by default: a test that cares about revalidation says so. */
  obtenerSugerencias.mockReset().mockReturnValue(new Promise(() => {}));
  enviarSugerencia.mockReset().mockResolvedValue({ ok: true, sugerencia: PENDIENTE });
});

describe("el listado propio", () => {
  it("pinta lo que el servidor ya leyó, sin esperar a la red", () => {
    render(montar([PENDIENTE, APROBADA]));

    expect(screen.getByRole("heading", { name: "Tablero de peajes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Firma digital de actas" })).toBeInTheDocument();
  });

  it("muestra el estado actual con el chip que DESIGN.md le asigna", () => {
    render(montar([PENDIENTE, APROBADA]));

    expect(within(tarjeta("Tablero de peajes")).getByText("Pendiente")).toBeInTheDocument();
    expect(within(tarjeta("Firma digital de actas")).getByText("Aprobada")).toBeInTheDocument();
  });

  it("dice a qué área va dirigida y cuándo se envió", () => {
    render(montar([PENDIENTE]));

    expect(tarjeta("Tablero de peajes")).toHaveTextContent("Para Operaciones");
    expect(tarjeta("Tablero de peajes")).toHaveTextContent("21/08/2026");
  });

  it("conserva la idea tal como se escribió", () => {
    render(montar([PENDIENTE]));

    expect(
      screen.getByText("Ver el flujo por caseta sin exportar a Excel."),
    ).toBeInTheDocument();
  });
});

describe("la trazabilidad visible", () => {
  /**
   * "Listado propio con trazabilidad visible" es literal en el backlog. Una traza
   * que solo empieza cuando un administrador toca la sugerencia no es
   * trazabilidad visible: es un hueco que se cierra más tarde. Por eso el asiento
   * de entrada se escribe al crear.
   */
  it("muestra el envío como primer asiento, incluso en una sugerencia recién enviada", () => {
    render(montar([PENDIENTE]));

    const asientos = within(tarjeta("Tablero de peajes")).getAllByRole("listitem");

    expect(asientos).toHaveLength(1);
    expect(asientos[0]).toHaveTextContent("Enviada · Pendiente");
  });

  it("muestra el recorrido completo, del envío al estado actual", () => {
    render(montar([APROBADA]));

    const asientos = within(tarjeta("Firma digital de actas")).getAllByRole("listitem");

    expect(asientos.map((asiento) => asiento.textContent)).toEqual([
      expect.stringContaining("Enviada · Pendiente"),
      expect.stringContaining("Pendiente → En revisión"),
      expect.stringContaining("En revisión → Aprobada"),
    ]);
  });

  /** ADR 0002 le pide al historial registrar "quién lo hizo y cuándo". */
  it("dice quién hizo cada cambio y cuándo", () => {
    render(montar([APROBADA]));

    const asientos = within(tarjeta("Firma digital de actas")).getAllByRole("listitem");

    expect(asientos[2]).toHaveTextContent("Rosa Díaz");
    expect(asientos[2]).toHaveTextContent("09/07/2026");
  });

  /**
   * Una lista ordenada, no una suelta: el orden ES la información, y un lector de
   * pantalla que anuncia "lista de 3 elementos" sin ella la pierde.
   */
  it("presenta el seguimiento como una secuencia, no como un montón", () => {
    render(montar([APROBADA]));

    expect(within(tarjeta("Firma digital de actas")).getByRole("list").tagName).toBe("OL");
  });

  /** Ningún token de almacenamiento llega a la pantalla. */
  it("no deja escapar «en_revision» tal cual", () => {
    render(montar([APROBADA]));

    expect(screen.queryByText(/en_revision/)).not.toBeInTheDocument();
  });
});

describe("el estado vacío", () => {
  /**
   * Es la única pantalla del portal donde el copy habitual de DESIGN.md
   * ("explicación de quién asigna") sería incorrecto: aquí no se asigna nada.
   * El propio documento lo anticipa: "El buzón es solo para ideas nuevas".
   */
  it("explica para qué sirve el buzón, no quién da acceso", () => {
    render(montar([]));

    expect(
      screen.getByRole("heading", { name: "Todavía no enviaste ninguna sugerencia" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/tus ideas de mejora/i)).toBeInTheDocument();
    expect(screen.queryByText(/asigna/i)).not.toBeInTheDocument();
  });

  it("deja el formulario a la vista: el buzón está abierto aunque no hayas enviado nada", () => {
    render(montar([]));

    expect(screen.getByRole("button", { name: /enviar sugerencia/i })).toBeInTheDocument();
  });
});

describe("el envío", () => {
  it("manda los datos parseados y confirma con un toast", async () => {
    const usuario = userEvent.setup();
    render(montar([]));

    await completarYEnviar(usuario);

    expect(enviarSugerencia).toHaveBeenCalledWith({
      titulo: "Tablero de peajes",
      descripcion: "Ver el flujo por caseta.",
      areaDestino: "Operaciones",
    });
    expect(await screen.findByText(CONFIRMACION_ENVIO)).toBeInTheDocument();
  });

  /**
   * El 201 trae la fila registrada — con su id, su estado y su historial ya
   * abierto —, así que no queda nada que una relectura pudiera descubrir. Se
   * antepone y no se agrega al final: el servidor ordena de más nueva a más
   * vieja, y agregarla abajo la teletransportaría al tope un minuto después.
   */
  it("agrega la sugerencia registrada al principio de la lista, sin volver a preguntar", async () => {
    const usuario = userEvent.setup();
    render(montar([APROBADA]));

    await completarYEnviar(usuario);

    /* El fetcher de este test no resuelve nunca, así que la sugerencia nueva no
       pudo llegar de la red: salió del 201, que es justamente el punto. */
    await waitFor(() => {
      const titulos = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
      expect(titulos).toEqual(["Tablero de peajes", "Firma digital de actas"]);
    });
  });

  /**
   * `fallbackData` NO se escribe en la cache de SWR: es lo que el hook devuelve
   * mientras la cache está vacía. Así que el argumento del updater es `undefined`
   * durante todo el primer minuto, y caer ahí en `[]` habría reemplazado la lista
   * entera por la sugerencia recién enviada — todo lo que alguien escribió
   * alguna vez desapareciendo por un minuto, justo después de apretar un botón.
   */
  it("no borra el resto de la lista al agregar la nueva antes de la primera revalidación", async () => {
    const usuario = userEvent.setup();
    render(montar([APROBADA]));

    await completarYEnviar(usuario);

    expect(await screen.findByRole("heading", { name: "Tablero de peajes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Firma digital de actas" })).toBeInTheDocument();
  });

  it("limpia el formulario después de un envío exitoso", async () => {
    const usuario = userEvent.setup();
    render(montar([]));

    await completarYEnviar(usuario);

    await waitFor(() => {
      expect(screen.getByLabelText("Título")).toHaveValue("");
    });
    expect(screen.getByLabelText("Tu idea")).toHaveValue("");
    /* El área vuelve al valor propio, no a vacío: sigue siendo el destino habitual. */
    expect(screen.getByLabelText("Área a la que va dirigida")).toHaveValue("Operaciones");
  });

  /**
   * NO es una actualización optimista. Nada aparece hasta que el servidor
   * contestó 201, porque lo único que esta pantalla no puede hacer nunca es
   * mostrarle a alguien su idea archivada cuando no se escribió.
   */
  it("no muestra la sugerencia si el servidor la rechazó", async () => {
    const usuario = userEvent.setup();
    enviarSugerencia.mockResolvedValue({ ok: false, mensaje: "No pudimos registrar tu sugerencia." });
    render(montar([]));

    await completarYEnviar(usuario);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos registrar tu sugerencia.",
    );
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  /** Todo lo que la persona escribió sigue donde estaba: no se le pide teclearlo otra vez. */
  it("conserva lo escrito cuando el envío falla", async () => {
    const usuario = userEvent.setup();
    enviarSugerencia.mockResolvedValue({ ok: false, mensaje: "No hay conexión." });
    render(montar([]));

    await completarYEnviar(usuario);

    await screen.findByRole("alert");
    expect(screen.getByLabelText("Título")).toHaveValue("Tablero de peajes");
    expect(screen.getByLabelText("Tu idea")).toHaveValue("Ver el flujo por caseta.");
  });

  it("no deja el botón desactivado después de un fallo", async () => {
    const usuario = userEvent.setup();
    enviarSugerencia.mockResolvedValue({ ok: false, mensaje: "No hay conexión." });
    render(montar([]));

    await completarYEnviar(usuario);

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /enviar sugerencia/i })).toBeEnabled();
  });

  it("borra la alerta anterior al volver a intentar", async () => {
    const usuario = userEvent.setup();
    enviarSugerencia.mockResolvedValueOnce({ ok: false, mensaje: "No hay conexión." });
    render(montar([]));

    await completarYEnviar(usuario);
    await screen.findByRole("alert");

    await usuario.click(screen.getByRole("button", { name: /enviar sugerencia/i }));

    await waitFor(() => {
      expect(screen.queryByText("No hay conexión.")).not.toBeInTheDocument();
    });
  });
});

describe("cuando la revalidación de fondo no llega", () => {
  /**
   * Tres fallos distintos, tres tratamientos distintos. Este es el que nadie
   * pidió: todo lo que está en pantalla sigue siendo cierto, solo puede estar un
   * minuto atrasado. Por eso es `status` y no `alert` — interrumpir a un lector
   * de pantalla a mitad de frase para contarle un no-evento —, y ámbar y no rojo:
   * DESIGN.md reserva el rojo para error y destrucción.
   */
  it("avisa sin alarmar y deja la lista en su lugar", async () => {
    obtenerSugerencias.mockRejectedValue(new Error("GET /api/sugerencias respondió 500"));
    render(montar([APROBADA]));

    expect(await screen.findByText(AVISO_SIN_ACTUALIZAR)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Firma digital de actas" })).toBeInTheDocument();
  });

  it("usa role=status, no role=alert", async () => {
    obtenerSugerencias.mockRejectedValue(new Error("falló"));
    render(montar([PENDIENTE]));

    const aviso = await screen.findByText(AVISO_SIN_ACTUALIZAR);

    expect(aviso).toHaveAttribute("role", "status");
  });

  it("no lo muestra mientras todo va bien", () => {
    render(montar([PENDIENTE]));

    expect(screen.queryByText(AVISO_SIN_ACTUALIZAR)).not.toBeInTheDocument();
  });
});
