import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const crearProcesador = vi.fn();
const editarProcesador = vi.fn();
const darDeBajaProcesador = vi.fn();
const restaurarProcesador = vi.fn();

vi.mock("./procesadores-client", () => ({
  crearProcesador: (...args: unknown[]) => crearProcesador(...args),
  editarProcesador: (...args: unknown[]) => editarProcesador(...args),
  darDeBajaProcesador: (...args: unknown[]) => darDeBajaProcesador(...args),
  restaurarProcesador: (...args: unknown[]) => restaurarProcesador(...args),
}));

import { ProcesadoresAdmin } from "./procesadores-admin";

/**
 * The screen's own behaviour: what each action sends, what the reader is told,
 * and when the server list is asked for again.
 *
 * The transport is mocked on purpose. `procesadores-client.test.ts` already
 * pins the verbs and the paths, so re-driving `fetch` from here would test that
 * file twice and this one not at all.
 */

const ACTIVO = {
  id: 4,
  nombre: "Maestro de Excel",
  descripcion: "Consolida los maestros mensuales",
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx,csv",
  tamanoMax: 26_214_400,
  entradasMin: 1,
  entradasMax: 5,
  tamanoMaxTotal: 83_886_080,
  salidaEsperada: "zip",
  activo: true,
} as const;

const DE_BAJA = {
  id: 9,
  nombre: "Limpieza de Word",
  descripcion: null,
  claveProcesador: "limpieza-word",
  formatosAceptados: "docx",
  tamanoMax: 10_485_760,
  entradasMin: 1,
  entradasMax: null,
  tamanoMaxTotal: null,
  salidaEsperada: "archivo",
  activo: false,
} as const;

function renderAdmin(procesadores: readonly (typeof ACTIVO | typeof DE_BAJA)[] = [ACTIVO, DE_BAJA]) {
  render(<ProcesadoresAdmin procesadores={procesadores} />);
  return userEvent.setup();
}

async function llenarAlta(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^nombre$/i), "Maestro de Excel");
  await user.type(screen.getByLabelText(/clave del procesador/i), "maestro-excel");
  await user.type(screen.getByLabelText(/formatos aceptados/i), "xlsx, csv");
  await user.type(screen.getByLabelText(/tamaño máximo por archivo/i), "25");
  await user.click(screen.getByRole("button", { name: /agregar procesador/i }));
}

describe("<ProcesadoresAdmin />", () => {
  beforeEach(() => {
    refresh.mockReset();
    crearProcesador.mockReset().mockResolvedValue({ ok: true, procesador: ACTIVO });
    editarProcesador.mockReset().mockResolvedValue({ ok: true, procesador: ACTIVO });
    darDeBajaProcesador
      .mockReset()
      .mockResolvedValue({ ok: true, procesador: { ...ACTIVO, activo: false } });
    restaurarProcesador
      .mockReset()
      .mockResolvedValue({ ok: true, procesador: { ...DE_BAJA, activo: true } });
  });

  it("confirms an alta with a toast and asks the server for the updated list", async () => {
    const user = renderAdmin();

    await llenarAlta(user);

    expect(crearProcesador).toHaveBeenCalledWith({
      nombre: "Maestro de Excel",
      descripcion: null,
      claveProcesador: "maestro-excel",
      formatosAceptados: "xlsx,csv",
      tamanoMax: 26_214_400,
      entradasMin: 1,
      /* Both caps absent, as ADR 0002's "sin tope" — and said so on screen. */
      entradasMax: null,
      tamanoMaxTotal: null,
      salidaEsperada: "archivo",
    });
    expect(await screen.findByText("Procesador agregado al catálogo.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the API's refusal exactly as it arrived, and leaves the list alone", async () => {
    crearProcesador.mockResolvedValue({
      ok: false,
      mensaje:
        "Ya hay un procesador con esa clave. Cada clave apunta a un módulo distinto, así que elige otra.",
    });
    const user = renderAdmin();

    await llenarAlta(user);

    expect(
      await screen.findByText(
        "Ya hay un procesador con esa clave. Cada clave apunta a un módulo distinto, así que elige otra.",
      ),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("saves an edit against the row the reader picked, carrying only what moved", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /editar maestro de excel/i }));
    const tamano = screen.getByLabelText(/tamaño máximo por archivo/i);
    await user.clear(tamano);
    await user.type(tamano, "10");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(editarProcesador).toHaveBeenCalledWith(4, { tamanoMax: 10_485_760 });
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("asks before taking a procesador down", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /dar de baja maestro de excel/i }));

    expect(darDeBajaProcesador).not.toHaveBeenCalled();
    expect(screen.getByText(/¿dar de baja «maestro de excel»\?/i)).toBeInTheDocument();
  });

  it("takes it down once the question is answered, and confirms it", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /dar de baja maestro de excel/i }));
    await user.click(screen.getByRole("button", { name: /sí, dar de baja/i }));

    expect(darDeBajaProcesador).toHaveBeenCalledWith(4);
    expect(await screen.findByText("Procesador dado de baja.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("puts a deactivated procesador back, which destroys nothing and so asks nothing", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /restaurar limpieza de word/i }));

    expect(restaurarProcesador).toHaveBeenCalledWith(9);
    expect(await screen.findByText("Procesador restaurado.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("makes each row's execution contract legible, caps included", () => {
    renderAdmin();

    /* Scoped to the table: the form's own <option> list names the salidas too. */
    const catalogo = within(screen.getByRole("table"));

    expect(catalogo.getByText("maestro-excel")).toBeInTheDocument();
    expect(catalogo.getByText("xlsx, csv")).toBeInTheDocument();
    expect(catalogo.getByText("Mínimo 1 · Máximo 5")).toBeInTheDocument();
    /* Bytes in the column, megabytes on the screen. */
    expect(catalogo.getByText("25 MB por archivo · 80 MB en total")).toBeInTheDocument();
    /* An absent cap is written out, never left as an empty cell. */
    expect(catalogo.getByText("Mínimo 1 · Sin tope")).toBeInTheDocument();
    expect(catalogo.getByText("10 MB por archivo · Sin tope en total")).toBeInTheDocument();
    expect(catalogo.getByText("Un ZIP con varios archivos")).toBeInTheDocument();
    expect(catalogo.getByText("Activo")).toBeInTheDocument();
    expect(catalogo.getByText("Dado de baja")).toBeInTheDocument();
  });

  it("explains an empty catalogue instead of drawing an empty table", () => {
    renderAdmin([]);

    expect(screen.getByText(/todavía no hay procesadores/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
