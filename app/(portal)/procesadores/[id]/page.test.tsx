import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPageResource = vi.fn();
const leerProcesador = vi.fn();
const notFound = vi.fn(() => {
  /* Next's `notFound()` throws to unwind the render; the double must too, or
     the code after the call would keep running in these tests only. */
  throw new Error("NEXT_NOT_FOUND");
});

/* `usePathname` lo lee el menú de sesión de la topbar, que esta pantalla monta. */
vi.mock("next/navigation", () => ({ notFound: () => notFound(), usePathname: () => "/" }));
vi.mock("@/lib/authz", () => ({
  guardPageResource: (...args: unknown[]) => guardPageResource(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/procesadores/repository", () => ({
  leerProcesador: (...args: unknown[]) => leerProcesador(...args),
}));

import ProcesadorPage from "./page";

/**
 * `/procesadores/{id}` — the screen where a collaborator runs a procesador.
 *
 * What is tested here is the ORDER, because the order is the security property:
 * a page that read the row and then asked the guard would answer the same
 * markup on the happy path and disclose a resource on the unhappy one.
 */

const MIB = 1024 * 1024;

const PROCESADOR = {
  id: 7,
  nombre: "Maestro de Excel",
  descripcion: "Consolida varias hojas en una",
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx",
  tamanoMax: 25 * MIB,
  entradasMin: 1,
  entradasMax: 1,
  tamanoMaxTotal: null,
  salidaEsperada: "archivo",
  activo: true,
};

const USUARIA = { id: 4, correo: "ana@corp.com", nombre: "Ana Quispe", esAdmin: false };

function contexto(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  guardPageResource.mockResolvedValue({ allowed: true, usuario: USUARIA });
  leerProcesador.mockResolvedValue(PROCESADOR);
});

describe("the guard runs first, and the read only happens if it allowed", () => {
  /**
   * TECH-DESIGN's acceptance criterion, verified as such: "acceso por URL
   * directa a un procesador no asignado → pantalla 403 de DESIGN.md, verificado
   * en servidor, no solo ocultamiento".
   */
  it("renders Sin permiso for a procesador that is not assigned", async () => {
    guardPageResource.mockResolvedValue({ allowed: false, screen: <p>Sin permiso</p> });

    render(await ProcesadorPage(contexto("7")));

    expect(screen.getByText("Sin permiso")).toBeInTheDocument();
    expect(leerProcesador).not.toHaveBeenCalled();
  });

  it("asks about this exact row, as a procesador", async () => {
    render(await ProcesadorPage(contexto("7")));

    expect(guardPageResource).toHaveBeenCalledWith({ tipo: "procesador", id: 7 });
  });

  /**
   * A segment that is not a number names no row, so there is no question for
   * the guard to answer. `notFound()` and not Sin permiso: a malformed address
   * is malformed for everybody, and a 403 would suggest something is there.
   */
  it("answers not-found for a malformed id, without asking the guard", async () => {
    await expect(ProcesadorPage(contexto("siete"))).rejects.toThrow("NEXT_NOT_FOUND");

    expect(guardPageResource).not.toHaveBeenCalled();
  });

  /* The guard passed, so the row existed a moment ago: it went away in between. */
  it("answers not-found when the row disappeared after the guard allowed it", async () => {
    leerProcesador.mockResolvedValue(null);

    await expect(ProcesadorPage(contexto("7"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("what the screen shows", () => {
  it("names the procesador and describes it", async () => {
    render(await ProcesadorPage(contexto("7")));

    expect(screen.getByRole("heading", { name: "Maestro de Excel" })).toBeInTheDocument();
    expect(screen.getByText("Consolida varias hojas en una")).toBeInTheDocument();
  });

  /** The name the guard re-read from SQL Server, not one carried in a token. */
  it("shows the reader the identity the guard confirmed", async () => {
    render(await ProcesadorPage(contexto("7")));

    expect(screen.getByText("Ana Quispe")).toBeInTheDocument();
  });

  /** A reader who arrived by URL needs a way back that is not the browser's. */
  it("offers a way back to the portal", async () => {
    render(await ProcesadorPage(contexto("7")));

    expect(screen.getByRole("link", { name: /Volver al portal/ })).toHaveAttribute("href", "/");
  });

  it("hands the row to the form rather than any constant of its own", async () => {
    render(await ProcesadorPage(contexto("7")));

    /* Built from `tamano_max`, which only the row could have supplied. */
    expect(screen.getByText(/hasta 25 MB/)).toBeInTheDocument();
  });
});
