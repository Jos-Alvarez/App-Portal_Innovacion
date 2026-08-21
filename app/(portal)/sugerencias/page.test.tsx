import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPage = vi.fn();
const listarSugerenciasDeAutor = vi.fn();
const leerAreaDelAutor = vi.fn();

vi.mock("@/lib/authz", () => ({ guardPage: () => guardPage() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/sugerencias/repository", () => ({
  listarSugerenciasDeAutor: (...args: unknown[]) => listarSugerenciasDeAutor(...args),
  leerAreaDelAutor: (...args: unknown[]) => leerAreaDelAutor(...args),
}));

/* The client half asks SWR for a revalidation on mount; the network is not part
   of what this file is about. */
vi.mock("./sugerencias-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sugerencias-client")>()),
  obtenerSugerencias: () => new Promise(() => {}),
}));

import SugerenciasPage from "./page";

/**
 * El buzón, del lado del servidor: se protege a sí mismo, lee solo para un
 * lector que aceptó, y lee para ESE lector.
 *
 * Las reglas de autorización no se vuelven a probar — `lib/authz` es su dueño —
 * ni el contenido del listado, que es del componente. Lo que se afirma aquí es
 * el cableado que solo esta página puede equivocar.
 */

const USUARIO = { id: 12, correo: "ana@limaexpresa.pe", nombre: "Ana Quispe", esAdmin: false };

describe("/sugerencias (buzón del colaborador)", () => {
  beforeEach(() => {
    guardPage.mockReset();
    listarSugerenciasDeAutor.mockReset().mockResolvedValue([]);
    leerAreaDelAutor.mockReset().mockResolvedValue("Operaciones");
  });

  it("se protege a sí misma y no lee nada cuando rechaza al lector", async () => {
    guardPage.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await SugerenciasPage());

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    expect(listarSugerenciasDeAutor).not.toHaveBeenCalled();
    expect(leerAreaDelAutor).not.toHaveBeenCalled();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  ACCESO GENERAL: NO REQUIERE ASIGNACIÓN
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El backlog cierra el ítem #13 con esa frase y el PRD la sostiene. Es el
   * guard de sesión, no el de recurso ni el de administrador: guardar esta
   * pantalla con cualquiera de los otros dos dejaría fuera justo al público para
   * el que existe.
   */
  it("basta con ser colaborador activo: ni asignación ni rol de administrador", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await SugerenciasPage());

    expect(screen.getByRole("heading", { name: "Buzón de sugerencias", level: 1 })).toBeInTheDocument();
  });

  it("lee las sugerencias del usuario que el guard identificó, no de uno que venga en la URL", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await SugerenciasPage());

    expect(listarSugerenciasDeAutor).toHaveBeenCalledWith(expect.anything(), 12);
    expect(leerAreaDelAutor).toHaveBeenCalledWith(expect.anything(), 12);
  });

  it("pinta en el servidor lo que ya leyó, sin esperar a la red", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });
    listarSugerenciasDeAutor.mockResolvedValue([
      {
        id: 31,
        titulo: "Tablero de peajes",
        descripcion: "Ver el flujo por caseta.",
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
      },
    ]);

    render(await SugerenciasPage());

    expect(screen.getByRole("heading", { name: "Tablero de peajes" })).toBeInTheDocument();
  });

  it("prellena el formulario con el área propia que leyó", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });
    leerAreaDelAutor.mockResolvedValue("Legal");

    render(await SugerenciasPage());

    expect(screen.getByLabelText("Área a la que va dirigida")).toHaveValue("Legal");
  });

  it("muestra el estado vacío cuando todavía no enviaste nada", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await SugerenciasPage());

    expect(
      screen.getByRole("heading", { name: "Todavía no enviaste ninguna sugerencia" }),
    ).toBeInTheDocument();
  });

  it("deja una salida de vuelta al portal", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await SugerenciasPage());

    expect(screen.getByRole("link", { name: /volver al portal/i })).toHaveAttribute("href", "/");
  });

  it("saluda al colaborador con el nombre que el guard leyó de la base", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await SugerenciasPage());

    expect(screen.getByText("Ana Quispe")).toBeInTheDocument();
  });
});
