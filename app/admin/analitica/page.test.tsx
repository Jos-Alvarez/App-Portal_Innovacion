import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hoyEnLima } from "./etiquetas";

const guardPageAdmin = vi.fn();
const calcularAnalitica = vi.fn();
const dependenciasDe = vi.fn();

vi.mock("@/lib/authz", () => ({ guardPageAdmin: () => guardPageAdmin() }));
vi.mock("@/lib/prisma", () => ({ prisma: { marca: "prisma" } }));
vi.mock("@/lib/analitica/dependencias", () => ({
  dependenciasDe: (client: unknown) => dependenciasDe(client),
}));
vi.mock("@/lib/analitica/servicio", () => ({
  calcularAnalitica: (...args: unknown[]) => calcularAnalitica(...args),
}));

import AnaliticaPage, { dynamic } from "./page";

/**
 * The server half of the analytics screen: it guards itself, it reads only for a
 * reader it accepted, and it hands the client half the one period it already
 * knows plus the day the portal is living in.
 *
 * The authorization rules are not re-tested — `lib/authz` owns those — and
 * neither is the engine. What is asserted is the wiring only this page can get
 * wrong.
 */

const ADMINISTRADORA = {
  id: 3,
  correo: "rosa@corp.com",
  nombre: "Rosa Díaz",
  esAdmin: true,
};

const REPORTE = {
  periodo: { desde: "2026-08-21", hasta: "2026-08-21", dias: 1 },
  metricas: {
    recursos: [],
    usuarios: [],
    areas: [],
    adopcion: { conAcceso: 0, activos: 0 },
    errores: [],
    sugerencias: {
      total: 0,
      porEstado: { pendiente: 0, en_revision: 0, aprobada: 0, rechazada: 0, implementada: 0 },
      porArea: [],
    },
  },
  comparacion: null,
};

describe("/admin/analitica", () => {
  beforeEach(() => {
    guardPageAdmin.mockReset().mockResolvedValue({ allowed: true, usuario: ADMINISTRADORA });
    calcularAnalitica.mockReset().mockResolvedValue(REPORTE);
    dependenciasDe.mockReset().mockReturnValue({ marca: "dependencias" });
  });

  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("se protege a sí misma y no calcula nada cuando rechaza al lector", async () => {
    guardPageAdmin.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await AnaliticaPage());

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    expect(calcularAnalitica).not.toHaveBeenCalled();
  });

  /*
   * El endpoint existe porque el periodo es una pregunta que el lector cambia
   * varias veces por minuto, no porque la primera pintura lo necesite: acá ya hay
   * conexión a la base y la identidad del request.
   */
  it("lee el primer periodo con las mismas dependencias que usa el endpoint", async () => {
    render(await AnaliticaPage());

    expect(dependenciasDe).toHaveBeenCalledWith({ marca: "prisma" });
    expect(calcularAnalitica).toHaveBeenCalledTimes(1);
    expect(calcularAnalitica.mock.calls[0]?.[2]).toEqual({ marca: "dependencias" });
  });

  /* El preset no lleva fechas: el schema rechaza el que llegue con ellas. */
  it("abre en «hoy», sin comparación y sin fechas", async () => {
    render(await AnaliticaPage());

    expect(calcularAnalitica.mock.calls[0]?.[0]).toEqual({
      rango: "hoy",
      desde: null,
      hasta: null,
      comparar: false,
    });
  });

  /*
   * Un solo instante para las dos respuestas. Con dos `new Date()` distintos, un
   * request que cruce la medianoche podría resolver «hoy» en un día y poner el
   * techo de los campos de fecha en el otro.
   */
  it("resuelve el periodo y el techo de las fechas contra el mismo instante", async () => {
    render(await AnaliticaPage());

    const ahora = calcularAnalitica.mock.calls[0]?.[1] as Date;
    expect(ahora).toBeInstanceOf(Date);

    await userEvent.click(screen.getByRole("button", { name: "Personalizado" }));

    expect(screen.getByLabelText("Hasta")).toHaveAttribute("max", hoyEnLima(ahora));
  });

  it("pone la topbar compartida y el encabezado de la pantalla", async () => {
    render(await AnaliticaPage());

    expect(screen.getByRole("heading", { level: 1, name: "Analítica" })).toBeInTheDocument();
    expect(screen.getByText("Rosa Díaz")).toBeInTheDocument();
  });

  it("entrega el reporte del servidor a la mitad cliente", async () => {
    render(await AnaliticaPage());

    /* 21/08/2026 sale del periodo que devolvió el motor, no de un fetch. */
    expect(screen.getByText("21/08/2026")).toBeInTheDocument();
  });
});
