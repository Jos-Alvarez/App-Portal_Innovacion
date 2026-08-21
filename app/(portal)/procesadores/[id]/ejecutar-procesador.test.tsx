import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcesadorDTO } from "@/lib/procesadores/repository";

const { ejecutarProcesador, descargar } = vi.hoisted(() => ({
  ejecutarProcesador: vi.fn(),
  descargar: vi.fn(),
}));

vi.mock("./ejecutar-client", async (original) => ({
  ...(await original<typeof import("./ejecutar-client")>()),
  ejecutarProcesador,
  descargar,
}));

import { EjecutarProcesador } from "./ejecutar-procesador";

/**
 * The upload screen.
 *
 * The RULES are not re-tested here — `ejecutar-client.test.ts` owns the local
 * check and the wire handling, and this component calls those very functions.
 * What is tested instead is what the screen makes possible: that every
 * affordance is built from the row rather than from a constant, and that the
 * three things a reader can be shown — a wait, a refusal, a confirmation — are
 * shown at the right moment and told apart.
 */

const MIB = 1024 * 1024;

const BASE: ProcesadorDTO = {
  id: 7,
  nombre: "Maestro de Excel",
  descripcion: "Consolida varias hojas en una",
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx,csv",
  tamanoMax: 25 * MIB,
  entradasMin: 1,
  entradasMax: 3,
  tamanoMaxTotal: 40 * MIB,
  salidaEsperada: "archivo",
  activo: true,
};

function archivo(nombre = "ventas.xlsx", bytes = 1024): File {
  const file = new File(["x"], nombre);
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

function montar(cambios: Partial<ProcesadorDTO> = {}) {
  return <EjecutarProcesador procesador={{ ...BASE, ...cambios }} />;
}

function campo() {
  return screen.getByLabelText(/archivos?/i);
}

function boton(nombre: RegExp) {
  return screen.getByRole("button", { name: nombre });
}

/**
 * A reader who chose "all files" in the picker.
 *
 * `accept` is a HINT: every browser lets the person switch the filter off, and
 * `userEvent` models that faithfully by dropping non-matching files unless told
 * otherwise. So a test that wants to exercise the local format check has to
 * turn the filter off — which is not a workaround, it is the only way the case
 * arises in real life, and the reason the check exists at all.
 */
const saltandoElFiltro = userEvent.setup({ applyAccept: false });

beforeEach(() => {
  vi.clearAllMocks();
  ejecutarProcesador.mockResolvedValue({ ok: true, archivo: new Blob(["x"]), nombre: "salida.xlsx" });
});

describe("every affordance is read off the row", () => {
  it("allows several files when the row admits several", () => {
    render(montar());

    expect(campo()).toHaveAttribute("multiple");
  });

  /* ADR 0002: "un procesador de un solo archivo es min = max = 1". Offering a
     multiple picker there would let the reader pick five and be refused. */
  it("allows only one when the row admits exactly one", () => {
    render(montar({ entradasMin: 1, entradasMax: 1 }));

    expect(campo()).not.toHaveAttribute("multiple");
  });

  it("filters the picker by the formats the row declares", () => {
    render(montar());

    expect(campo()).toHaveAttribute("accept", ".xlsx,.csv");
  });

  it("states the limits in megabytes, not in bytes", () => {
    render(montar());

    expect(screen.getByText(/hasta 25 MB/)).toBeInTheDocument();
    expect(screen.getByText(/no pueden pasar de 40 MB/)).toBeInTheDocument();
  });

  it("says nothing about a combined cap when the row declares none", () => {
    render(montar({ tamanoMaxTotal: null }));

    expect(screen.queryByText(/Entre todos/)).not.toBeInTheDocument();
  });

  it("describes an uncapped count without inventing a maximum", () => {
    render(montar({ entradasMin: 1, entradasMax: null }));

    expect(screen.getByText(/uno o más archivos/)).toBeInTheDocument();
  });

  /**
   * ADR 0002 says `salida_esperada` "es declarativo para la UI" and the service
   * packages according to what the module actually returned. The copy announces
   * what to expect; it must not promise what will arrive.
   */
  it("announces the expected output without promising it", () => {
    render(montar({ salidaEsperada: "zip" }));

    expect(screen.getByText(/Normalmente recibirás un ZIP/)).toBeInTheDocument();
  });
});

describe("nothing is sent until there is something to send", () => {
  it("keeps the action visible but disabled with no selection", () => {
    render(montar());

    /* DESIGN.md: "Deshabilitado: opacity .5 + cursor not-allowed (nunca
       ocultarlo)". */
    expect(boton(/Procesar/)).toBeDisabled();
  });

  it("enables it once files are chosen", async () => {
    render(montar());

    await userEvent.upload(campo(), archivo());

    expect(boton(/Procesar/)).toBeEnabled();
  });

  /**
   * The local check saves a doomed upload; it grants nothing. A selection it
   * refuses never reaches the network.
   */
  it("does not spend an upload on a selection the row already rules out", async () => {
    render(montar());

    await saltandoElFiltro.upload(campo(), archivo("ventas.pdf"));
    await saltandoElFiltro.click(boton(/Procesar/));

    expect(ejecutarProcesador).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("«ventas.pdf»");
  });
});

describe("the wait", () => {
  it("names the two minutes rather than leaving the reader guessing", async () => {
    let terminar: (valor: unknown) => void = () => {};
    ejecutarProcesador.mockReturnValue(new Promise((resolve) => (terminar = resolve)));

    render(montar());
    await userEvent.upload(campo(), archivo());
    await userEvent.click(boton(/Procesar/));

    expect(screen.getByRole("status")).toHaveTextContent(/hasta dos minutos/);
    expect(boton(/Procesando/)).toBeDisabled();

    terminar({ ok: true, archivo: new Blob(["x"]), nombre: "salida.xlsx" });
  });
});

describe("the refusal", () => {
  it("shows the message the portal sent, in a banner that interrupts", async () => {
    ejecutarProcesador.mockResolvedValue({
      ok: false,
      mensaje: "Al archivo «ventas.xlsx» le falta la columna «Fecha».",
    });

    render(montar());
    await userEvent.upload(campo(), archivo());
    await userEvent.click(boton(/Procesar/));

    const banner = await screen.findByRole("alert");

    expect(banner).toHaveTextContent("No pudimos procesar tus archivos");
    expect(banner).toHaveTextContent("«Fecha»");
  });

  /**
   * A failure that came back from the server might go differently on a second
   * try: the service was busy, the network dropped, the execution ran long.
   */
  it("offers Reintentar for a failure that could go differently", async () => {
    ejecutarProcesador.mockResolvedValue({ ok: false, mensaje: "El servicio está ocupado." });

    render(montar());
    await userEvent.upload(campo(), archivo());
    await userEvent.click(boton(/Procesar/));
    await userEvent.click(await screen.findByRole("button", { name: /Reintentar/ }));

    expect(ejecutarProcesador).toHaveBeenCalledTimes(2);
  });

  /**
   * A local refusal cannot go differently — the files are the problem. A button
   * that re-runs a check whose answer cannot have changed produces the same
   * banner and teaches the reader it does nothing.
   */
  it("withholds Reintentar when only a different selection could help", async () => {
    render(montar());

    await saltandoElFiltro.upload(campo(), archivo("ventas.pdf"));
    await saltandoElFiltro.click(boton(/Procesar/));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reintentar/ })).not.toBeInTheDocument();
  });

  it("clears the banner as soon as the selection changes", async () => {
    render(montar());

    await saltandoElFiltro.upload(campo(), archivo("ventas.pdf"));
    await saltandoElFiltro.click(boton(/Procesar/));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await saltandoElFiltro.upload(campo(), archivo("ventas.xlsx"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the result", () => {
  it("hands the file to the browser under the name the service chose", async () => {
    render(montar());

    await userEvent.upload(campo(), archivo());
    await userEvent.click(boton(/Procesar/));

    expect(descargar).toHaveBeenCalledWith(expect.any(Blob), "salida.xlsx");
  });

  /* DESIGN.md: "Toast: confirma toda acción sin navegación". */
  it("confirms with a toast", async () => {
    render(montar());

    await userEvent.upload(campo(), archivo());
    await userEvent.click(boton(/Procesar/));

    expect(await screen.findByText(/se descargó/)).toBeInTheDocument();
  });

  it("does not confirm anything that failed", async () => {
    ejecutarProcesador.mockResolvedValue({ ok: false, mensaje: "No se pudo." });

    render(montar());
    await userEvent.upload(campo(), archivo());
    await userEvent.click(boton(/Procesar/));

    expect(descargar).not.toHaveBeenCalled();
    expect(screen.queryByText(/se descargó/)).not.toBeInTheDocument();
  });

  /** The screen stays usable: the same files can be sent again. */
  it("lets the reader run it a second time", async () => {
    render(montar());

    await userEvent.upload(campo(), archivo());
    await userEvent.click(boton(/Procesar/));
    await userEvent.click(boton(/Procesar/));

    expect(ejecutarProcesador).toHaveBeenCalledTimes(2);
    expect(descargar).toHaveBeenCalledTimes(2);
  });
});
