import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SugerenciaAdminDTO } from "@/lib/sugerencias/repository";

const obtenerTodas = vi.fn();
const cambiarEstado = vi.fn();

vi.mock("./sugerencias-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sugerencias-client")>()),
  obtenerTodas: (ruta: string) => obtenerTodas(ruta),
  cambiarEstado: (id: number, estado: string) => cambiarEstado(id, estado),
}));

import { SugerenciasAdmin } from "./sugerencias-admin";
import { AVISO_SIN_ACTUALIZAR } from "./sugerencias-client";

/**
 * La pantalla de gestión: el ítem #15 del lado del Área de Innovación.
 *
 * WHAT IS NOT RE-TESTED HERE. `app/api/sugerencias/[id]/estado/route.test.ts`
 * owns the endpoint — the guard, the conditional update, the asiento, the status
 * codes — and `sugerencias-client.test.ts` owns the fetcher and the PATCH. None
 * of that is reachable through a rendered screen, and asserting it here would
 * only assert the mock. What is left is this screen's own behaviour.
 */

const PENDIENTE: SugerenciaAdminDTO = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
  estado: "pendiente",
  fechaCreacion: "2026-08-21T14:30:00.000Z",
  autor: { nombre: "Ana Quispe", area: "Peajes" },
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

const APROBADA: SugerenciaAdminDTO = {
  id: 12,
  titulo: "Firma digital de actas",
  descripcion: "Evitar imprimir para firmar.",
  areaDestino: "Legal",
  estado: "aprobada",
  fechaCreacion: "2026-07-02T13:00:00.000Z",
  autor: { nombre: "Luis Rojas", area: "Legal" },
  historial: [
    {
      id: 20,
      estadoAnterior: null,
      estadoNuevo: "pendiente",
      fechaCambio: "2026-07-02T13:00:00.000Z",
      autor: "Luis Rojas",
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
function montar(sugerenciasIniciales: readonly SugerenciaAdminDTO[] = []): ReactNode {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <SugerenciasAdmin sugerenciasIniciales={sugerenciasIniciales} />
    </SWRConfig>
  );
}

/** The card whose accessible content mentions this title. */
function tarjeta(titulo: string): HTMLElement {
  return screen.getByRole("heading", { name: titulo }).closest("article") as HTMLElement;
}

/**
 * The review button of one card.
 *
 * Matched on the ACCESSIBLE NAME, which is the `aria-label` and not the visible
 * text — that is the point of the label: five cards on screen each have a button
 * reading "Aprobada", and only the label says which suggestion it belongs to.
 */
function boton(titulo: string, estado: string): HTMLElement {
  return within(tarjeta(titulo)).getByRole("button", {
    name: `Marcar «${titulo}» como ${estado}`,
  });
}

/**
 * The state chip of one card.
 *
 * Read through `data-tone`, which only `StatusChip` carries, because the chip and
 * the review button of the same state have IDENTICAL text — "Aprobada" appears
 * both as where the suggestion is and as somewhere it could go. A plain
 * `getByText` cannot tell those two apart, and the one these tests mean is always
 * the chip.
 */
function chip(titulo: string): HTMLElement {
  return tarjeta(titulo).querySelector("[data-tone]") as HTMLElement;
}

beforeEach(() => {
  /* Never resolving by default: a test that cares about revalidation says so. */
  obtenerTodas.mockReset().mockReturnValue(new Promise(() => {}));
  cambiarEstado.mockReset().mockResolvedValue({
    ok: true,
    sugerencia: { ...PENDIENTE, estado: "en_revision" },
  });
});

describe("el listado completo", () => {
  it("pinta lo que el servidor ya leyó, sin esperar a la red", () => {
    render(montar([PENDIENTE, APROBADA]));

    expect(screen.getByRole("heading", { name: "Tablero de peajes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Firma digital de actas" })).toBeInTheDocument();
  });

  /** El chip de estado con el color que DESIGN.md le asigna a cada uno. */
  it("muestra el chip de estado de cada sugerencia", () => {
    render(montar([PENDIENTE, APROBADA]));

    expect(chip("Tablero de peajes")).toHaveTextContent("Pendiente");
    expect(chip("Firma digital de actas")).toHaveTextContent("Aprobada");
  });

  /**
   * El área del autor y el área de destino son dos hechos distintos: el PRD deja
   * escribir una sugerencia para un área que no es la propia.
   */
  it("nombra al autor, su área y el área de destino", () => {
    render(montar([PENDIENTE]));

    const meta = tarjeta("Tablero de peajes").textContent ?? "";

    expect(meta).toContain("Ana Quispe");
    expect(meta).toContain("Peajes");
    expect(meta).toContain("Operaciones");
  });

  /** `usuario.area` es `""` para quien no tiene departamento en Entra ID. */
  it("no deja un separador colgando cuando el autor no tiene área", () => {
    render(montar([{ ...PENDIENTE, autor: { nombre: "Ana Quispe", area: "" } }]));

    expect(tarjeta("Tablero de peajes").textContent).not.toContain("Ana Quispe · ·");
  });

  /** El "recorrido completo … consultable" de TECH-DESIGN.md, del más viejo al más nuevo. */
  it("muestra la traza completa, incluido el asiento de entrada", () => {
    render(montar([APROBADA]));

    const asientos = within(tarjeta("Firma digital de actas")).getAllByRole("listitem");

    expect(asientos).toHaveLength(3);
    expect(asientos[0]).toHaveTextContent("Enviada · Pendiente");
    expect(asientos[1]).toHaveTextContent("Pendiente → En revisión");
    expect(asientos[2]).toHaveTextContent("En revisión → Aprobada");
  });

  it("muestra quién hizo cada cambio", () => {
    render(montar([APROBADA]));

    const asientos = within(tarjeta("Firma digital de actas")).getAllByRole("listitem");

    expect(asientos[0]).toHaveTextContent("Luis Rojas");
    expect(asientos[2]).toHaveTextContent("Rosa Díaz");
  });

  it("muestra el estado vacío cuando todavía no llegó ninguna idea", () => {
    render(montar([]));

    expect(screen.getByText("Todavía no hay sugerencias")).toBeInTheDocument();
  });
});

describe("los botones del embudo", () => {
  it("ofrece los cinco estados en cada tarjeta", () => {
    render(montar([PENDIENTE]));

    const acciones = within(tarjeta("Tablero de peajes")).getAllByRole("button");

    expect(acciones.map((b) => b.textContent)).toEqual([
      "Pendiente",
      "En revisión",
      "Aprobada",
      "Rechazada",
      "Implementada",
    ]);
  });

  /**
   * El estado actual no es a dónde puede ir: es dónde está. Deshabilitarlo es la
   * mitad cliente del rechazo `sin_cambio` del repositorio — el servidor es quien
   * lo hace cumplir, esto sólo evita preguntar.
   */
  it("deshabilita el estado en el que la sugerencia ya está", () => {
    render(montar([PENDIENTE]));

    expect(boton("Tablero de peajes", "Pendiente")).toBeDisabled();
    expect(boton("Tablero de peajes", "Aprobada")).toBeEnabled();
  });

  /** Cinco tarjetas tienen un botón que dice "Aprobada": el nombre accesible las distingue. */
  it("da a cada botón un nombre accesible que nombra la sugerencia", () => {
    render(montar([PENDIENTE, APROBADA]));

    expect(
      screen.getByRole("button", { name: "Marcar «Tablero de peajes» como Aprobada" }),
    ).toBeInTheDocument();
  });

  it("manda el PATCH con el id y el estado elegidos", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE]));

    await usuario.click(boton("Tablero de peajes", "En revisión"));

    expect(cambiarEstado).toHaveBeenCalledWith(31, "en_revision");
  });

  it("confirma con un toast que nombra el estado aplicado", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE]));

    await usuario.click(boton("Tablero de peajes", "En revisión"));

    expect(await screen.findByText("Sugerencia marcada como En revisión.")).toBeInTheDocument();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  EL CHIP NO SE MUEVE HASTA QUE LA BASE DIJO QUE SE MOVIÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * No es una actualización optimista: quien ve "Aprobada" tiene derecho a creer
   * que el autor la va a ver también.
   */
  it("actualiza la tarjeta con la fila que devolvió el servidor", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE]));

    await usuario.click(boton("Tablero de peajes", "En revisión"));

    await waitFor(() => expect(chip("Tablero de peajes")).toHaveTextContent("En revisión"));
  });

  /**
   * `fallbackData` NO está en la cache de SWR mientras ninguna revalidación
   * aterrizó, así que el updater recibe `undefined`. Caer a `[]` ahí vaciaría la
   * bandeja hasta la única fila revisada, y un minuto después volverían todas.
   * (El ítem #13 shipeó este bug una vez y su suite lo agarró.)
   */
  it("no pierde las demás sugerencias al revisar una", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(boton("Tablero de peajes", "En revisión"));

    await waitFor(() => expect(chip("Tablero de peajes")).toHaveTextContent("En revisión"));
    expect(screen.getByRole("heading", { name: "Firma digital de actas" })).toBeInTheDocument();
  });

  it("conserva el orden de la lista, porque revisar no cambia cuándo se envió", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(boton("Tablero de peajes", "En revisión"));

    await waitFor(() => expect(chip("Tablero de peajes")).toHaveTextContent("En revisión"));

    const titulos = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(titulos).toEqual(["Tablero de peajes", "Firma digital de actas"]);
  });

  it("apaga los botones de esa tarjeta mientras el cambio está en vuelo", async () => {
    const usuario = userEvent.setup();
    cambiarEstado.mockReturnValue(new Promise(() => {}));
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(boton("Tablero de peajes", "Aprobada"));

    expect(boton("Tablero de peajes", "Aprobada")).toBeDisabled();
    /* La otra tarjeta sigue viva: se apaga la acción, no la pantalla. */
    expect(boton("Firma digital de actas", "Rechazada")).toBeEnabled();
  });
});

describe("los filtros por estado", () => {
  it("ofrece «Todas» más los cinco estados, con su cuenta", () => {
    render(montar([PENDIENTE, APROBADA]));

    const filtros = screen.getByRole("group", { name: "Filtrar por estado" });

    expect(within(filtros).getByRole("button", { name: "Todas (2)" })).toBeInTheDocument();
    expect(within(filtros).getByRole("button", { name: "Pendiente (1)" })).toBeInTheDocument();
    expect(within(filtros).getByRole("button", { name: "Rechazada (0)" })).toBeInTheDocument();
  });

  it("arranca en «Todas», y lo dice con aria-pressed", () => {
    render(montar([PENDIENTE, APROBADA]));

    const filtros = screen.getByRole("group", { name: "Filtrar por estado" });

    expect(within(filtros).getByRole("button", { name: "Todas (2)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("deja ver sólo las de un estado", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(screen.getByRole("button", { name: "Aprobada (1)" }));

    expect(screen.getByRole("heading", { name: "Firma digital de actas" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tablero de peajes" })).not.toBeInTheDocument();
  });

  /**
   * "No hay sugerencias" bajo un filtro activo se leería como "nadie mandó nada"
   * cuando en realidad hay cuatro esperando a un chip de distancia.
   */
  it("distingue «no hay ninguna en este estado» de «no hay ninguna»", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(screen.getByRole("button", { name: "Rechazada (0)" }));

    expect(screen.getByText("Ninguna sugerencia en ese estado")).toBeInTheDocument();
    expect(screen.queryByText("Todavía no hay sugerencias")).not.toBeInTheDocument();
  });

  it("vuelve a mostrarlas todas", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(screen.getByRole("button", { name: "Aprobada (1)" }));
    await usuario.click(screen.getByRole("button", { name: "Todas (2)" }));

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });

  /** Las cuentas salen del mismo arreglo que la lista, así que no pueden discrepar con ella. */
  it("recalcula las cuentas después de un cambio de estado", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(boton("Tablero de peajes", "En revisión"));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pendiente (0)" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "En revisión (1)" })).toBeInTheDocument();
  });
});

describe("las dos fallas, tratadas distinto", () => {
  /**
   * Una acción que la persona pidió y no ocurrió: alerta roja con la frase del
   * servidor tal cual — incluida la del 409 que dice que otro revisor llegó
   * primero.
   */
  it("muestra la frase del servidor cuando el cambio no se aplicó", async () => {
    const usuario = userEvent.setup();
    cambiarEstado.mockResolvedValue({
      ok: false,
      mensaje: "Otra persona cambió el estado de esta sugerencia mientras la revisabas.",
    });
    render(montar([PENDIENTE]));

    await usuario.click(boton("Tablero de peajes", "Aprobada"));

    const alerta = await screen.findByRole("alert");

    expect(alerta).toHaveTextContent(/otra persona cambió el estado/i);
  });

  it("deja el chip donde estaba cuando el cambio falló", async () => {
    const usuario = userEvent.setup();
    cambiarEstado.mockResolvedValue({ ok: false, mensaje: "No se pudo." });
    render(montar([PENDIENTE]));

    await usuario.click(boton("Tablero de peajes", "Aprobada"));

    await screen.findByRole("alert");
    expect(chip("Tablero de peajes")).toHaveTextContent("Pendiente");
  });

  it("no confirma con un toast lo que no ocurrió", async () => {
    const usuario = userEvent.setup();
    cambiarEstado.mockResolvedValue({ ok: false, mensaje: "No se pudo." });
    render(montar([PENDIENTE]));

    await usuario.click(boton("Tablero de peajes", "Aprobada"));

    await screen.findByRole("alert");
    expect(screen.queryByText(/marcada como/i)).not.toBeInTheDocument();
  });

  /**
   * Un refresco de fondo que nadie pidió: aviso ámbar con `role="status"`, no
   * alerta roja. Todo lo que está en pantalla sigue siendo cierto.
   */
  it("avisa en ámbar cuando la revalidación falla, sin vaciar la lista", async () => {
    obtenerTodas.mockRejectedValue(new Error("500"));
    render(montar([PENDIENTE]));

    const aviso = await screen.findByRole("status");

    expect(aviso).toHaveTextContent(AVISO_SIN_ACTUALIZAR);
    expect(screen.getByRole("heading", { name: "Tablero de peajes" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("limpia la alerta anterior al intentar de nuevo", async () => {
    const usuario = userEvent.setup();
    cambiarEstado.mockResolvedValueOnce({ ok: false, mensaje: "No se pudo." });
    render(montar([PENDIENTE]));

    await usuario.click(boton("Tablero de peajes", "Aprobada"));
    await screen.findByRole("alert");

    await usuario.click(boton("Tablero de peajes", "En revisión"));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
