import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPageAdmin = vi.fn();
const listarSugerencias = vi.fn();
const listarSugerenciasDeAutor = vi.fn();

vi.mock("@/lib/authz", () => ({ guardPageAdmin: () => guardPageAdmin() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/sugerencias/repository", () => ({
  listarSugerencias: () => listarSugerencias(),
  listarSugerenciasDeAutor: (...args: unknown[]) => listarSugerenciasDeAutor(...args),
}));

import type { SugerenciaAdminDTO } from "@/lib/sugerencias/repository";

import SugerenciasAdminPage, { dynamic } from "./page";

/**
 * `/admin/sugerencias` — the page's own obligations.
 *
 * `lib/authz` is explicit that a layout may decide what to SHOW but never what is
 * REACHABLE, so the check has to be here — and a denial has to stop before the
 * list is read, not merely hide it afterwards. The authorization RULES themselves
 * are not re-tested: `lib/authz` already owns those.
 */

const CREADA = "2026-08-21T14:30:00.000Z";

/*
 * Typed, and not a bare object literal. It was untyped once and a missing
 * `grupo` key reached the render as `undefined` — a value the DTO forbids — where
 * the compiler should have caught it. A fixture that does not have to satisfy the
 * contract is a fixture that can drift away from it.
 */
const SUGERENCIA: SugerenciaAdminDTO = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
  estado: "pendiente",
  fechaCreacion: CREADA,
  autor: { nombre: "Ana Quispe", area: "Peajes" },
  grupo: null,
  historial: [
    {
      id: 90,
      estadoAnterior: null,
      estadoNuevo: "pendiente",
      fechaCambio: CREADA,
      autor: "Ana Quispe",
    },
  ],
};

const ADMINISTRADORA = {
  allowed: true as const,
  usuario: { id: 3, correo: "rosa@limaexpresa.pe", nombre: "Rosa Díaz", esAdmin: true },
};

beforeEach(() => {
  guardPageAdmin.mockReset().mockResolvedValue(ADMINISTRADORA);
  listarSugerencias.mockReset().mockResolvedValue([SUGERENCIA]);
  listarSugerenciasDeAutor.mockReset().mockResolvedValue([]);
});

describe("/admin/sugerencias", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("se guarda a sí misma, y no lee nada si rechaza al lector", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await SugerenciasAdminPage());

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    /* Las ideas de todo el equipo no salen de la base para alguien que no puede verlas. */
    expect(listarSugerencias).not.toHaveBeenCalled();
  });

  it("le muestra el listado completo a una administradora", async () => {
    render(await SugerenciasAdminPage());

    expect(screen.getByRole("heading", { name: "Gestión de sugerencias" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tablero de peajes" })).toBeInTheDocument();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  LA LECTURA ES LA ENSANCHADA, NO LA DEL COLABORADOR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El ítem #13 dejó escrito que la forma de romperlo desde afuera es hacer que
   * su lectura por autor se vuelva condicional. Esta prueba fija que esta
   * pantalla ni siquiera la toca.
   */
  it("no usa la lectura por autor del buzón", async () => {
    await SugerenciasAdminPage();

    expect(listarSugerencias).toHaveBeenCalledTimes(1);
    expect(listarSugerenciasDeAutor).not.toHaveBeenCalled();
  });

  it("no le pasa el id de la administradora a la lectura", async () => {
    await SugerenciasAdminPage();

    expect(listarSugerencias).toHaveBeenCalledWith();
  });

  it("pinta el estado vacío cuando todavía no llegó ninguna idea", async () => {
    listarSugerencias.mockResolvedValue([]);

    render(await SugerenciasAdminPage());

    expect(screen.getByText("Todavía no hay sugerencias")).toBeInTheDocument();
  });

  /** El encabezado tiene que decir que el cambio queda firmado y que el autor lo ve. */
  it("avisa que el cambio queda registrado y es visible para el autor", async () => {
    render(await SugerenciasAdminPage());

    const intro = screen.getByRole("heading", { name: "Gestión de sugerencias" })
      .parentElement?.textContent;

    expect(intro).toMatch(/registrado/i);
    expect(intro).toMatch(/autor/i);
  });
});
