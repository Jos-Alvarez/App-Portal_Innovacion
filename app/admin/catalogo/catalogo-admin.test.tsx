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

const asignarRecurso = vi.fn();
const revocarRecurso = vi.fn();

vi.mock("../asignaciones/asignaciones-client", () => ({
  asignarRecurso: (...args: unknown[]) => asignarRecurso(...args),
  revocarRecurso: (...args: unknown[]) => revocarRecurso(...args),
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

/** El padrón entero del portal — la búsqueda del diálogo «Asignar» lo filtra. */
const USUARIOS = [
  {
    id: 1,
    nombre: "Ana Ríos",
    correo: "ana.rios@limaexpresa.pe",
    area: "Innovación",
    esAdmin: false,
    activo: true,
    enlacesAsignados: 1,
    procesadoresAsignados: 0,
  },
  {
    id: 2,
    nombre: "Beto Sosa",
    correo: "beto.sosa@limaexpresa.pe",
    area: "Peajes",
    esAdmin: false,
    activo: true,
    enlacesAsignados: 0,
    procesadoresAsignados: 0,
  },
] as const;

function renderAdmin(
  enlaces: readonly (typeof ENLACE | typeof ENLACE_DE_BAJA)[] = [ENLACE, ENLACE_DE_BAJA],
  procesadores: readonly (typeof PROCESADOR | typeof PROCESADOR_DE_BAJA)[] = [
    PROCESADOR,
    PROCESADOR_DE_BAJA,
  ],
  asignadosPorRecurso: Readonly<Record<string, readonly number[]>> = {},
  usuarios: readonly (typeof USUARIOS)[number][] = USUARIOS,
) {
  render(
    <CatalogoAdmin
      enlaces={enlaces}
      procesadores={procesadores}
      usuarios={usuarios}
      asignadosPorRecurso={asignadosPorRecurso}
    />,
  );
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
    asignarRecurso.mockReset().mockResolvedValue({ ok: true, asignado: true });
    revocarRecurso.mockReset().mockResolvedValue({ ok: true, asignado: false });
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
      "Asistente de contratoshttps://contratos.limaexpresa.pe",
      "Facturación electrónicahttps://facturacion.limaexpresa.pe",
      "Limpieza de WordProcesador interno · docx · 10 MB",
      "Maestro de ExcelProcesador interno · xlsx, csv · 25 MB",
    ]);
  });

  it("nombra los tres tipos de recurso con las palabras del portal", () => {
    renderAdmin();

    const catalogo = within(screen.getByRole("table"));

    expect(catalogo.getByText("Aplicación")).toBeInTheDocument();
    expect(catalogo.getByText("Agente de IA")).toBeInTheDocument();
    expect(catalogo.getAllByText("Procesador")).toHaveLength(2);
  });

  it("resume cada recurso en una línea bajo el nombre: dirección o ficha del procesador", () => {
    renderAdmin([ENLACE], [PROCESADOR]);

    const catalogo = within(screen.getByRole("table"));

    /* El enlace lleva su dirección, y abrir en pestaña nueva no puede dejar un
       handle a esta — de ahí el `rel`. */
    expect(catalogo.getByRole("link", { name: /facturacion\.limaexpresa\.pe/i })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    /* El procesador no tiene dirección: en su lugar, qué es, qué acepta y qué
       tamaño admite — lo que antes ocupaba cinco columnas. */
    expect(catalogo.getByText("Procesador interno · xlsx, csv · 25 MB")).toBeInTheDocument();
  });

  it("cuenta cuántas personas tienen cada recurso, y escribe el cero como frase", () => {
    renderAdmin([ENLACE], [PROCESADOR], { "enlace:7": [4, 5, 6], "procesador:4": [7] });

    const catalogo = within(screen.getByRole("table"));

    expect(catalogo.getByText("3 usuarios")).toBeInTheDocument();
    expect(catalogo.getByText("1 usuario")).toBeInTheDocument();
  });

  it("sin conteo, un recurso que nadie tiene dice «0 usuarios», no una celda vacía", () => {
    renderAdmin([ENLACE], []);

    expect(within(screen.getByRole("table")).getByText("0 usuarios")).toBeInTheDocument();
  });

  it("abre el diálogo «Asignar» sobre el recurso, con quien ya lo tiene", async () => {
    const user = renderAdmin([ENLACE], [], { "enlace:7": [1] });

    await user.click(
      within(screen.getByRole("table")).getByRole("button", {
        name: /asignar facturación electrónica/i,
      }),
    );

    const dialogo = within(screen.getByRole("dialog", { name: /accesos a facturación electrónica/i }));
    expect(dialogo.getByText("Ana Ríos")).toBeInTheDocument();
    expect(
      dialogo.getByRole("button", { name: /quitar el acceso de ana ríos/i }),
    ).toBeInTheDocument();
  });

  it("quita un acceso llamando al endpoint del usuario y el recurso", async () => {
    revocarRecurso.mockResolvedValue({ ok: true, asignado: false });
    const user = renderAdmin([ENLACE], [], { "enlace:7": [1] });

    await user.click(
      screen.getByRole("button", { name: /asignar facturación electrónica/i }),
    );
    await user.click(screen.getByRole("button", { name: /quitar el acceso de ana ríos/i }));

    expect(revocarRecurso).toHaveBeenCalledWith(1, "enlace", 7);
  });

  it("desde el selector de colaboradores concede el acceso sobre ese recurso", async () => {
    asignarRecurso.mockResolvedValue({ ok: true, asignado: true });
    const user = renderAdmin([ENLACE], [], { "enlace:7": [1] });

    await user.click(
      screen.getByRole("button", { name: /asignar facturación electrónica/i }),
    );
    await user.click(screen.getByRole("button", { name: /^agregar$/i }));
    await user.click(screen.getByRole("button", { name: /dar acceso a beto sosa/i }));

    expect(asignarRecurso).toHaveBeenCalledWith(2, "enlace", 7);
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
