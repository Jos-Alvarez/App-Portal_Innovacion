import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SugerenciaAdminDTO } from "@/lib/sugerencias/repository";

const obtenerTodas = vi.fn();
const cambiarEstado = vi.fn();
const agruparSugerencias = vi.fn();
const quitarDeGrupo = vi.fn();

vi.mock("./sugerencias-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sugerencias-client")>()),
  obtenerTodas: (ruta: string) => obtenerTodas(ruta),
  cambiarEstado: (id: number, estado: string) => cambiarEstado(id, estado),
  agruparSugerencias: (titulo: string, ids: readonly number[]) => agruparSugerencias(titulo, ids),
  quitarDeGrupo: (id: number) => quitarDeGrupo(id),
}));

import { SugerenciasAdmin } from "./sugerencias-admin";
import {
  AVISO_SIN_ACTUALIZAR,
  CONFIRMACION_QUITAR,
  confirmacionDeGrupo,
} from "./sugerencias-client";

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
  grupo: null,
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
  grupo: null,
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

/* ── Ítem #16: el grupo ───────────────────────────────────────────────────── */

const GRUPO = { id: 5, titulo: "Ideas de peaje" };

/**
 * Dos miembros del mismo grupo EN ESTADOS DISTINTOS, y es a propósito: el ítem
 * #16 promete que agrupar "conserva el estado individual de cada una", así que
 * un par homogéneo no probaría nada sobre el filtro.
 */
const AGRUPADA_UNO: SugerenciaAdminDTO = {
  id: 41,
  titulo: "Peaje en vivo",
  descripcion: "Ver el flujo de cada caseta al minuto.",
  areaDestino: "Operaciones",
  estado: "pendiente",
  fechaCreacion: "2026-08-20T11:00:00.000Z",
  autor: { nombre: "Ana Quispe", area: "Peajes" },
  grupo: GRUPO,
  historial: [
    {
      id: 70,
      estadoAnterior: null,
      estadoNuevo: "pendiente",
      fechaCambio: "2026-08-20T11:00:00.000Z",
      autor: "Ana Quispe",
    },
  ],
};

const AGRUPADA_DOS: SugerenciaAdminDTO = {
  id: 42,
  titulo: "Peaje por caseta",
  descripcion: "Comparar casetas entre sí.",
  areaDestino: "Operaciones",
  estado: "aprobada",
  fechaCreacion: "2026-08-19T09:00:00.000Z",
  autor: { nombre: "Luis Rojas", area: "Peajes" },
  grupo: GRUPO,
  historial: [
    {
      id: 71,
      estadoAnterior: null,
      estadoNuevo: "pendiente",
      fechaCambio: "2026-08-19T09:00:00.000Z",
      autor: "Luis Rojas",
    },
  ],
};

/** Lo que devuelve el servidor cuando la #41 sale del grupo. */
const SUELTA_DE_NUEVO: SugerenciaAdminDTO = { ...AGRUPADA_UNO, grupo: null };

/**
 * A fresh SWR cache per test. Without it the module-level cache would carry one
 * test's suggestions into the next, and the second render would paint cards the
 * test never gave it.
 */
function montar(sugerenciasIniciales: readonly SugerenciaAdminDTO[] = []): ReactNode {
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

/** El nombre accesible de la barra de agrupación, que es su `aria-label`. */
const BARRA = "Agrupar las sugerencias seleccionadas";

/**
 * El bloque de un grupo.
 *
 * Se busca por `role="region"`, que es lo que un <section> CON NOMBRE ACCESIBLE
 * expone — y ese nombre es justamente lo que el ítem #16 pide que se vea. Si
 * alguien cambiara la <section> por un <div> con un borde, este helper dejaría de
 * encontrarla, que es exactamente el aviso que queremos.
 */
function grupo(titulo: string): HTMLElement {
  return screen.getByRole("region", { name: titulo });
}

/** El checkbox de una tarjeta, por el nombre que sólo lee la tecnología asistiva. */
function seleccionar(titulo: string): HTMLElement {
  return screen.getByRole("checkbox", { name: `Seleccionar «${titulo}»` });
}

/** El botón que saca a una sugerencia de su grupo. */
function salida(titulo: string): HTMLElement {
  return screen.getByRole("button", { name: `Quitar «${titulo}» del grupo` });
}

beforeEach(() => {
  /* Never resolving by default: a test that cares about revalidation says so. */
  obtenerTodas.mockReset().mockReturnValue(new Promise(() => {}));
  cambiarEstado.mockReset().mockResolvedValue({
    ok: true,
    sugerencia: { ...PENDIENTE, estado: "en_revision" },
  });
  agruparSugerencias.mockReset().mockResolvedValue({
    ok: true,
    sugerencias: [AGRUPADA_UNO, AGRUPADA_DOS],
  });
  quitarDeGrupo.mockReset().mockResolvedValue({
    ok: true,
    sugerencias: [SUELTA_DE_NUEVO, { ...AGRUPADA_DOS, grupo: null }],
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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  UNA ESCRITURA EN VUELO APAGA TODA LA LISTA, NO SÓLO SU TARJETA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El ítem #16 cambió esto a propósito. `revisar` y `aplicarGrupo` arrancan las
   * dos con un `if (ocupado !== null) return`, así que un clic en otra tarjeta ya
   * no hacía nada — y un botón habilitado que no hace nada miente. Con la
   * agrupación en la mezcla el argumento se endurece: mientras una escritura de
   * grupo está en vuelo la lista entera está por ser reemplazada, y ofrecer una
   * acción contra las filas que están a punto de cambiar es ofrecer una carrera.
   */
  it("apaga toda la lista mientras hay una escritura en vuelo", async () => {
    const usuario = userEvent.setup();
    cambiarEstado.mockReturnValue(new Promise(() => {}));
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(boton("Tablero de peajes", "Aprobada"));

    expect(boton("Tablero de peajes", "Aprobada")).toBeDisabled();
    expect(boton("Firma digital de actas", "Rechazada")).toBeDisabled();
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

/**
 * Dispara la revalidación por foco.
 *
 * Hasta el ítem #19 estas pruebas no necesitaban disparar nada: SWR consultaba
 * sola al montar, incluso con `fallbackData`, y esa consulta redundante es el
 * defecto que `lib/swr-pre-lectura.ts` corrige. El foco es el disparador más
 * cercano a la realidad: es la mitad de la política del ADR 0007 que atiende al
 * lector que vuelve a la pestaña.
 */
function revalidarPorFoco() {
  window.dispatchEvent(new Event("focus"));
}

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
  /*
   * `app/admin/sugerencias/page.tsx` leyó esta bandeja en ESTE request. Pedirla
   * otra vez al montar era un viaje redundante por página cargada.
   */
  it("no pide la bandeja al montar: el servidor ya la leyó", async () => {
    render(montar([PENDIENTE]));

    /* Después de vaciar las colas: la consulta del montaje cae en un microtask
       posterior, así que una aserción síncrona pasaría por casualidad. */
    await new Promise((listo) => setTimeout(listo, 0));

    expect(obtenerTodas).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Tablero de peajes" })).toBeInTheDocument();
  });

  it("avisa en ámbar cuando la revalidación falla, sin vaciar la lista", async () => {
    obtenerTodas.mockRejectedValue(new Error("500"));
    render(montar([PENDIENTE]));
    revalidarPorFoco();

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

/* ══════════════════════════════════════════════════════════════════════════
 *  ÍTEM #16 — LA AGRUPACIÓN, DEL LADO DE LA PANTALLA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * QUÉ NO SE REPRUEBA ACÁ. `agrupacion.test.ts` es dueño de CÓMO una lista plana
 * se vuelve bloques — el orden, el conteo, la honestidad del filtro — y lo hace
 * sin montar nada. `sugerencias-client.test.ts` es dueño del POST, del DELETE y
 * de sus fallas. Las rutas son dueñas del guard y de los códigos. Lo que queda,
 * y es lo único que se prueba en este archivo, es lo que la PANTALLA hace: qué
 * dibuja, qué ofrece, qué manda y qué hace con la respuesta.
 */

describe("el bloque de un grupo", () => {
  it("dibuja el grupo como una región con el nombre que le pusieron", () => {
    render(montar([AGRUPADA_UNO, AGRUPADA_DOS]));

    expect(grupo("Ideas de peaje")).toBeInTheDocument();
  });

  it("muestra juntos a los miembros, dentro del bloque", () => {
    render(montar([PENDIENTE, AGRUPADA_UNO, AGRUPADA_DOS]));

    const bloque = grupo("Ideas de peaje");

    expect(within(bloque).getByRole("heading", { name: "Peaje en vivo" })).toBeInTheDocument();
    expect(within(bloque).getByRole("heading", { name: "Peaje por caseta" })).toBeInTheDocument();
    /* La suelta queda afuera del bloque, no adentro. */
    expect(within(bloque).queryByRole("heading", { name: "Tablero de peajes" })).toBeNull();
  });

  it("dice cuántas sugerencias tiene el grupo", () => {
    render(montar([AGRUPADA_UNO, AGRUPADA_DOS]));

    expect(within(grupo("Ideas de peaje")).getByText("2 sugerencias")).toBeInTheDocument();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  AGRUPAR NO UNIFICA ESTADOS
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El ítem #16 dice que cada sugerencia conserva su estado y su autor. Dos
   * miembros del mismo grupo con dos chips distintos es la prueba de que el
   * bloque es una forma de MOSTRARLAS, no de fusionarlas.
   */
  it("conserva el estado y el autor individuales de cada miembro", () => {
    render(montar([AGRUPADA_UNO, AGRUPADA_DOS]));

    expect(chip("Peaje en vivo")).toHaveTextContent("Pendiente");
    expect(chip("Peaje por caseta")).toHaveTextContent("Aprobada");
    expect(tarjeta("Peaje en vivo")).toHaveTextContent("Ana Quispe");
    expect(tarjeta("Peaje por caseta")).toHaveTextContent("Luis Rojas");
  });

  /**
   * "5 de 5" hace buscar la que falta; "1 de 2" es la única frase honesta cuando
   * el filtro escondió a un miembro. Mostrar el grupo ENTERO porque uno matchea
   * pondría una tarjeta pendiente bajo el filtro "Aprobada" — el filtro estaría
   * mintiendo.
   */
  it("con un filtro puesto, dice cuántas está viendo y cuántas hay", async () => {
    const usuario = userEvent.setup();
    render(montar([AGRUPADA_UNO, AGRUPADA_DOS]));

    await usuario.click(screen.getByRole("button", { name: "Aprobada (1)" }));

    const bloque = grupo("Ideas de peaje");

    expect(within(bloque).getByText("1 de 2 sugerencias")).toBeInTheDocument();
    expect(within(bloque).queryByRole("heading", { name: "Peaje en vivo" })).toBeNull();
  });
});

describe("armar un grupo", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  UNA SOLA NO ES UN GRUPO, Y LA BARRA ES QUIEN LO DICE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `crearGrupoSchema` rechaza menos de dos y el endpoint contestaría 400.
   * Ofrecer un botón habilitado que el servidor va a rechazar seguro es una
   * promesa que la pantalla no puede cumplir.
   */
  it("no ofrece la barra hasta que hay dos marcadas", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    expect(screen.queryByRole("form", { name: BARRA })).toBeNull();

    await usuario.click(seleccionar("Tablero de peajes"));
    expect(screen.queryByRole("form", { name: BARRA })).toBeNull();

    await usuario.click(seleccionar("Firma digital de actas"));
    expect(screen.getByRole("form", { name: BARRA })).toBeInTheDocument();
  });

  it("no deja agrupar sin ponerle nombre al grupo", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(seleccionar("Tablero de peajes"));
    await usuario.click(seleccionar("Firma digital de actas"));

    const barra = screen.getByRole("form", { name: BARRA });

    expect(within(barra).getByRole("button", { name: "Agrupar" })).toBeDisabled();
  });

  it("manda el nombre y los ids marcados", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(seleccionar("Tablero de peajes"));
    await usuario.click(seleccionar("Firma digital de actas"));
    await usuario.type(screen.getByLabelText("Nombre del grupo"), "Ideas de peaje");
    await usuario.click(
      within(screen.getByRole("form", { name: BARRA })).getByRole("button", { name: "Agrupar" }),
    );

    await waitFor(() => expect(agruparSugerencias).toHaveBeenCalledWith("Ideas de peaje", [31, 12]));
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  LA RESPUESTA REEMPLAZA LA LISTA ENTERA, NO PARCHEA UNA FILA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Agrupar puede dejar al grupo ANTERIOR de una sugerencia bajo el mínimo, y eso
   * lo disuelve y libera a una fila que nadie nombró. Parchear la entrada que el
   * cliente pidió dejaría en pantalla un grupo que ya no existe.
   */
  it("redibuja la lista con lo que devolvió el servidor", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(seleccionar("Tablero de peajes"));
    await usuario.click(seleccionar("Firma digital de actas"));
    await usuario.type(screen.getByLabelText("Nombre del grupo"), "Ideas de peaje");
    await usuario.click(
      within(screen.getByRole("form", { name: BARRA })).getByRole("button", { name: "Agrupar" }),
    );

    expect(await screen.findByRole("region", { name: "Ideas de peaje" })).toBeInTheDocument();
  });

  it("confirma con un toast cuántas agrupó", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(seleccionar("Tablero de peajes"));
    await usuario.click(seleccionar("Firma digital de actas"));
    await usuario.type(screen.getByLabelText("Nombre del grupo"), "Ideas de peaje");
    await usuario.click(
      within(screen.getByRole("form", { name: BARRA })).getByRole("button", { name: "Agrupar" }),
    );

    expect(await screen.findByText(confirmacionDeGrupo(2))).toBeInTheDocument();
  });

  /* Los tildes describían filas cuya agrupación ya cambió; dejarlos invita a una
     segunda acción contra una lista que se movió. */
  it("suelta la selección después de agrupar", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(seleccionar("Tablero de peajes"));
    await usuario.click(seleccionar("Firma digital de actas"));
    await usuario.type(screen.getByLabelText("Nombre del grupo"), "Ideas de peaje");
    await usuario.click(
      within(screen.getByRole("form", { name: BARRA })).getByRole("button", { name: "Agrupar" }),
    );

    await screen.findByRole("region", { name: "Ideas de peaje" });
    expect(screen.queryByRole("form", { name: BARRA })).toBeNull();
  });

  it("cancelar suelta la selección sin escribir nada", async () => {
    const usuario = userEvent.setup();
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(seleccionar("Tablero de peajes"));
    await usuario.click(seleccionar("Firma digital de actas"));
    await usuario.click(
      within(screen.getByRole("form", { name: BARRA })).getByRole("button", { name: "Cancelar" }),
    );

    expect(screen.queryByRole("form", { name: BARRA })).toBeNull();
    expect(agruparSugerencias).not.toHaveBeenCalled();
  });

  it("muestra la frase del servidor cuando la agrupación no se aplicó", async () => {
    const usuario = userEvent.setup();
    agruparSugerencias.mockResolvedValue({
      ok: false,
      mensaje: "Una de las sugerencias ya no existe.",
    });
    render(montar([PENDIENTE, APROBADA]));

    await usuario.click(seleccionar("Tablero de peajes"));
    await usuario.click(seleccionar("Firma digital de actas"));
    await usuario.type(screen.getByLabelText("Nombre del grupo"), "Ideas de peaje");
    await usuario.click(
      within(screen.getByRole("form", { name: BARRA })).getByRole("button", { name: "Agrupar" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/ya no existe/i);
    expect(screen.queryByText(confirmacionDeGrupo(2))).toBeNull();
  });
});

describe("salir de un grupo", () => {
  /**
   * El camino de corrección del ítem #16. Sin él, archivar una idea en el balde
   * equivocado sólo se arregla contra la base de datos, y lo que el PRD describe
   * como una comodidad se vuelve una decisión que nadie puede deshacer.
   */
  it("ofrece la salida sólo en las tarjetas que están en un grupo", () => {
    render(montar([PENDIENTE, AGRUPADA_UNO, AGRUPADA_DOS]));

    expect(salida("Peaje en vivo")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Quitar «Tablero de peajes» del grupo" }),
    ).toBeNull();
  });

  it("manda el id de la sugerencia que sale", async () => {
    const usuario = userEvent.setup();
    render(montar([AGRUPADA_UNO, AGRUPADA_DOS]));

    await usuario.click(salida("Peaje en vivo"));

    await waitFor(() => expect(quitarDeGrupo).toHaveBeenCalledWith(41));
  });

  /**
   * Sacar al anteúltimo miembro deja al grupo bajo el mínimo, así que se disuelve
   * y el SOBREVIVIENTE también queda suelto — una fila que nadie nombró. Por eso
   * la respuesta es la lista entera y acá desaparece el bloque completo.
   */
  it("redibuja la lista entera con lo que devolvió el servidor", async () => {
    const usuario = userEvent.setup();
    render(montar([AGRUPADA_UNO, AGRUPADA_DOS]));

    await usuario.click(salida("Peaje en vivo"));

    await waitFor(() => expect(screen.queryByRole("region", { name: "Ideas de peaje" })).toBeNull());
    /* Las dos sugerencias siguen ahí: salieron del grupo, no del portal. */
    expect(screen.getByRole("heading", { name: "Peaje en vivo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Peaje por caseta" })).toBeInTheDocument();
  });

  it("confirma la salida con un toast", async () => {
    const usuario = userEvent.setup();
    render(montar([AGRUPADA_UNO, AGRUPADA_DOS]));

    await usuario.click(salida("Peaje en vivo"));

    expect(await screen.findByText(CONFIRMACION_QUITAR)).toBeInTheDocument();
  });

  it("muestra la frase del servidor cuando la salida no se aplicó", async () => {
    const usuario = userEvent.setup();
    quitarDeGrupo.mockResolvedValue({ ok: false, mensaje: "Esa sugerencia no está en un grupo." });
    render(montar([AGRUPADA_UNO, AGRUPADA_DOS]));

    await usuario.click(salida("Peaje en vivo"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no está en un grupo/i);
    expect(screen.queryByText(CONFIRMACION_QUITAR)).toBeNull();
  });
});
