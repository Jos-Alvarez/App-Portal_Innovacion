import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const crearEnlace = vi.fn();
const editarEnlace = vi.fn();
const darDeBajaEnlace = vi.fn();
const restaurarEnlace = vi.fn();

vi.mock("./enlaces-client", () => ({
  crearEnlace: (...args: unknown[]) => crearEnlace(...args),
  editarEnlace: (...args: unknown[]) => editarEnlace(...args),
  darDeBajaEnlace: (...args: unknown[]) => darDeBajaEnlace(...args),
  restaurarEnlace: (...args: unknown[]) => restaurarEnlace(...args),
}));

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

import { CatalogoAdmin } from "./catalogo-admin";

/**
 * The unified screen's own behaviour: what each action sends, where it sends
 * it, what the reader is told, and when the server lists are asked for again.
 *
 * WHAT THIS FILE HAS TO PROVE THAT THE TWO IT REPLACES DID NOT: that merging
 * the reading did NOT merge the writing. Every assertion below names the client
 * module the call had to travel through, because the one way this screen can go
 * wrong is by sending a procesador's edit to the enlaces endpoint.
 *
 * The transport is mocked on purpose. `enlaces-client.test.ts` and
 * `procesadores-client.test.ts` already pin the verbs and the paths, so
 * re-driving `fetch` from here would test those files twice and this one not at
 * all.
 */

const ENLACE = {
  id: 7,
  nombre: "Facturación electrónica",
  descripcion: "Emisión de comprobantes",
  url: "https://facturacion.limaexpresa.pe",
  tipo: "app",
  activo: true,
} as const;

const ENLACE_DE_BAJA = {
  id: 9,
  nombre: "Asistente de contratos",
  descripcion: null,
  url: "https://contratos.limaexpresa.pe",
  tipo: "agente",
  activo: false,
} as const;

const PROCESADOR = {
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

const PROCESADOR_DE_BAJA = {
  id: 11,
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

function renderAdmin(
  enlaces: readonly (typeof ENLACE | typeof ENLACE_DE_BAJA)[] = [ENLACE, ENLACE_DE_BAJA],
  procesadores: readonly (typeof PROCESADOR | typeof PROCESADOR_DE_BAJA)[] = [
    PROCESADOR,
    PROCESADOR_DE_BAJA,
  ],
) {
  render(<CatalogoAdmin enlaces={enlaces} procesadores={procesadores} />);
  return userEvent.setup();
}

async function llenarAltaDeEnlace(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /\+ nuevo enlace/i }));
  await user.type(screen.getByLabelText(/^nombre$/i), "Tablero de obras");
  await user.type(screen.getByLabelText(/dirección web/i), "https://obras.limaexpresa.pe");
  await user.click(screen.getByRole("button", { name: /agregar enlace/i }));
}

async function llenarAltaDeProcesador(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /\+ nuevo procesador/i }));
  await user.type(screen.getByLabelText(/^nombre$/i), "Maestro de Excel");
  await user.type(screen.getByLabelText(/clave del procesador/i), "maestro-excel");
  await user.type(screen.getByLabelText(/formatos aceptados/i), "xlsx, csv");
  await user.type(screen.getByLabelText(/tamaño máximo por archivo/i), "25");
  await user.click(screen.getByRole("button", { name: /agregar procesador/i }));
}

describe("<CatalogoAdmin />", () => {
  beforeEach(() => {
    refresh.mockReset();
    crearEnlace.mockReset().mockResolvedValue({ ok: true, enlace: ENLACE });
    editarEnlace.mockReset().mockResolvedValue({ ok: true, enlace: ENLACE });
    darDeBajaEnlace.mockReset().mockResolvedValue({ ok: true, enlace: { ...ENLACE, activo: false } });
    restaurarEnlace
      .mockReset()
      .mockResolvedValue({ ok: true, enlace: { ...ENLACE_DE_BAJA, activo: true } });

    crearProcesador.mockReset().mockResolvedValue({ ok: true, procesador: PROCESADOR });
    editarProcesador.mockReset().mockResolvedValue({ ok: true, procesador: PROCESADOR });
    darDeBajaProcesador
      .mockReset()
      .mockResolvedValue({ ok: true, procesador: { ...PROCESADOR, activo: false } });
    restaurarProcesador
      .mockReset()
      .mockResolvedValue({ ok: true, procesador: { ...PROCESADOR_DE_BAJA, activo: true } });
  });

  it("pone los dos recursos en una sola tabla, ordenados por nombre", () => {
    renderAdmin();

    const filas = within(screen.getByRole("table")).getAllByRole("row");

    /* Encabezado primero; después el catálogo entero, mezclado por nombre y no
       por tabla de origen. */
    expect(filas.slice(1).map((fila) => within(fila).getAllByRole("cell")[0]?.textContent)).toEqual([
      "Asistente de contratos",
      "Facturación electrónicaEmisión de comprobantes",
      "Limpieza de Word",
      "Maestro de ExcelConsolida los maestros mensuales",
    ]);
  });

  it("nombra los tres tipos de recurso con las palabras del portal", () => {
    renderAdmin();

    const catalogo = within(screen.getByRole("table"));

    expect(catalogo.getByText("Aplicación")).toBeInTheDocument();
    expect(catalogo.getByText("Agente de IA")).toBeInTheDocument();
    expect(catalogo.getAllByText("Procesador")).toHaveLength(2);
  });

  it("hace legible el contrato de ejecución de un procesador, topes incluidos", () => {
    renderAdmin();

    /* Acotado a la tabla: la lista de <option> del formulario nombra las salidas también. */
    const catalogo = within(screen.getByRole("table"));

    expect(catalogo.getByText("maestro-excel")).toBeInTheDocument();
    expect(catalogo.getByText("xlsx, csv")).toBeInTheDocument();
    expect(catalogo.getByText("Mínimo 1 · Máximo 5")).toBeInTheDocument();
    /* Bytes en la columna, megabytes en la pantalla. */
    expect(catalogo.getByText("25 MB por archivo · 80 MB en total")).toBeInTheDocument();
    /* Un tope ausente se escribe, nunca se deja como celda vacía. */
    expect(catalogo.getByText("Mínimo 1 · Sin tope")).toBeInTheDocument();
    expect(catalogo.getByText("10 MB por archivo · Sin tope en total")).toBeInTheDocument();
    expect(catalogo.getByText("Un ZIP con varios archivos")).toBeInTheDocument();
  });

  it("dice «No aplica» donde la columna es del otro recurso, en vez de callar", () => {
    renderAdmin([ENLACE], [PROCESADOR]);

    const catalogo = within(screen.getByRole("table"));

    /* Cuatro por el enlace (clave, formatos, contrato, salida) y una por el
       procesador (dirección): un <td> vacío se leería igual que un dato perdido. */
    expect(catalogo.getAllByText("No aplica")).toHaveLength(5);
    expect(catalogo.getByRole("link", { name: /facturacion\.limaexpresa\.pe/i })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("abre el alta de un enlace en un diálogo y la cierra sin guardar nada", async () => {
    const user = renderAdmin();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /\+ nuevo enlace/i }));

    expect(
      screen.getByRole("dialog", { name: "Nuevo enlace de app / agente" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(crearEnlace).not.toHaveBeenCalled();
  });

  it("abre el alta de un procesador en su propio diálogo", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /\+ nuevo procesador/i }));

    expect(screen.getByRole("dialog", { name: "Nuevo procesador" })).toBeInTheDocument();
    /* Los campos del contrato de ejecución, que el enlace no tiene. */
    expect(screen.getByLabelText(/clave del procesador/i)).toBeInTheDocument();
  });

  it("manda el alta de un enlace a la API de enlaces, y confirma", async () => {
    const user = renderAdmin();

    await llenarAltaDeEnlace(user);

    expect(crearEnlace).toHaveBeenCalledWith({
      nombre: "Tablero de obras",
      descripcion: null,
      url: "https://obras.limaexpresa.pe",
      tipo: "app",
    });
    expect(crearProcesador).not.toHaveBeenCalled();
    expect(await screen.findByText("Enlace agregado al catálogo.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("manda el alta de un procesador a la API de procesadores, y confirma", async () => {
    const user = renderAdmin();

    await llenarAltaDeProcesador(user);

    expect(crearProcesador).toHaveBeenCalledWith({
      nombre: "Maestro de Excel",
      descripcion: null,
      claveProcesador: "maestro-excel",
      formatosAceptados: "xlsx,csv",
      tamanoMax: 26_214_400,
      entradasMin: 1,
      /* Los dos topes ausentes, como el "sin tope" del ADR 0002. */
      entradasMax: null,
      tamanoMaxTotal: null,
      salidaEsperada: "archivo",
    });
    expect(crearEnlace).not.toHaveBeenCalled();
    expect(await screen.findByText("Procesador agregado al catálogo.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("muestra la negativa de la API tal como llegó, y deja la lista quieta", async () => {
    crearEnlace.mockResolvedValue({
      ok: false,
      mensaje: "Ya existe un enlace con ese nombre. Elige otro para que se distingan en el portal.",
    });
    const user = renderAdmin();

    await llenarAltaDeEnlace(user);

    expect(
      await screen.findByText(
        "Ya existe un enlace con ese nombre. Elige otro para que se distingan en el portal.",
      ),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("edita un enlace contra su propia API, con la fila ya cargada", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /editar facturación electrónica/i }));

    const dialogo = within(screen.getByRole("dialog", { name: "Editar enlace" }));
    const nombre = dialogo.getByLabelText(/^nombre$/i);
    expect(nombre).toHaveValue("Facturación electrónica");

    await user.clear(nombre);
    await user.type(nombre, "Facturación");
    await user.click(dialogo.getByRole("button", { name: /guardar cambios/i }));

    expect(editarEnlace).toHaveBeenCalledWith(7, {
      nombre: "Facturación",
      descripcion: "Emisión de comprobantes",
      url: "https://facturacion.limaexpresa.pe",
      tipo: "app",
    });
    expect(editarProcesador).not.toHaveBeenCalled();
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
  });

  it("edita un procesador contra la suya, cargando solo lo que se movió", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /editar maestro de excel/i }));

    const dialogo = within(screen.getByRole("dialog", { name: "Editar procesador" }));
    const tamano = dialogo.getByLabelText(/tamaño máximo por archivo/i);
    await user.clear(tamano);
    await user.type(tamano, "10");
    await user.click(dialogo.getByRole("button", { name: /guardar cambios/i }));

    expect(editarProcesador).toHaveBeenCalledWith(4, { tamanoMax: 10_485_760 });
    expect(editarEnlace).not.toHaveBeenCalled();
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
  });

  it("pregunta antes de dar de baja, y llama a la API del recurso que se está bajando", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /dar de baja maestro de excel/i }));

    expect(darDeBajaProcesador).not.toHaveBeenCalled();
    expect(screen.getByText(/¿dar de baja «maestro de excel»\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sí, dar de baja/i }));

    expect(darDeBajaProcesador).toHaveBeenCalledWith(4);
    expect(darDeBajaEnlace).not.toHaveBeenCalled();
    expect(await screen.findByText("Recurso dado de baja.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("da de baja un enlace por su propia API", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /dar de baja facturación electrónica/i }));
    await user.click(screen.getByRole("button", { name: /sí, dar de baja/i }));

    expect(darDeBajaEnlace).toHaveBeenCalledWith(7);
    expect(darDeBajaProcesador).not.toHaveBeenCalled();
  });

  it("restaura sin preguntar, porque restaurar no destruye nada", async () => {
    const user = renderAdmin();

    await user.click(screen.getByRole("button", { name: /restaurar asistente de contratos/i }));

    expect(restaurarEnlace).toHaveBeenCalledWith(9);
    expect(await screen.findByText("Recurso restaurado.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /restaurar limpieza de word/i }));

    expect(restaurarProcesador).toHaveBeenCalledWith(11);
  });

  it("explica un catálogo vacío en vez de dibujar una tabla vacía", () => {
    renderAdmin([], []);

    expect(screen.getByText(/todavía no hay recursos/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    /* Las dos altas siguen ahí: es desde donde se llena un catálogo vacío. */
    expect(screen.getByRole("button", { name: /\+ nuevo enlace/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ nuevo procesador/i })).toBeInTheDocument();
  });
});
