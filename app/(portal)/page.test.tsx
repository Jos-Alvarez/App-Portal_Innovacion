import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPage = vi.fn();
const listarRecursosAsignados = vi.fn();

vi.mock("@/lib/authz", () => ({ guardPage: () => guardPage() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mis-recursos/repository", () => ({
  listarRecursosAsignados: (...args: unknown[]) => listarRecursosAsignados(...args),
}));

/* The client half asks SWR for a revalidation on mount; the network is not
   part of what this file is about. */
vi.mock("./mis-recursos-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mis-recursos-client")>()),
  obtenerMisRecursos: () => new Promise(() => {}),
}));

import PortalPage from "./page";

/**
 * The dashboard's server half: it guards itself, it reads only for a reader it
 * accepted, and it reads for THAT reader.
 *
 * The authorization rules are not re-tested — `lib/authz` owns those — and
 * neither is the repository's merged list, which is part 1's. What is asserted
 * here is the wiring only this page can get wrong.
 */

const USUARIO = { id: 12, correo: "ana@limaexpresa.pe", nombre: "Ana Quispe", esAdmin: false };

describe("/ (dashboard del colaborador)", () => {
  beforeEach(() => {
    guardPage.mockReset();
    listarRecursosAsignados.mockReset().mockResolvedValue([]);
  });

  it("se protege a sí misma y no lee nada cuando rechaza al lector", async () => {
    guardPage.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await PortalPage());

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    expect(listarRecursosAsignados).not.toHaveBeenCalled();
  });

  it("basta con ser colaborador activo: no exige ser administrador", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await PortalPage());

    expect(screen.getByRole("heading", { name: "Mis recursos" })).toBeInTheDocument();
  });

  it("lee los recursos del usuario que el guard identificó, no de uno que venga en la URL", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await PortalPage());

    expect(listarRecursosAsignados).toHaveBeenCalledWith({}, 12);
  });

  it("entrega la lista del servidor ya pintada, sin esqueleto ni pantalla en blanco", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });
    listarRecursosAsignados.mockResolvedValue([
      { tipo: "app", id: 4, nombre: "Portal de Compras", descripcion: null },
      { tipo: "procesador", id: 2, nombre: "Maestro de Excel", descripcion: null },
    ]);

    render(await PortalPage());

    expect(screen.getByText("Portal de Compras")).toBeInTheDocument();
    expect(screen.getByText("Maestro de Excel")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando el colaborador no tiene nada asignado", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await PortalPage());

    expect(
      screen.getByRole("heading", { name: "Todavía no tienes recursos asignados" }),
    ).toBeInTheDocument();
  });

  it("saluda al colaborador con el nombre que el guard leyó de la base", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await PortalPage());

    expect(screen.getByText("Ana Quispe")).toBeInTheDocument();
  });

  it("mantiene el cambio de tema al alcance del colaborador", async () => {
    /* Hasta que exista una topbar propia, esta pantalla es el único sitio del
       portal donde se monta el toggle: quitarlo dejaría al producto sin forma
       de cambiar de tema. */
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await PortalPage());

    expect(screen.getByRole("button", { name: /cambiar a modo/i })).toBeInTheDocument();
  });
});
