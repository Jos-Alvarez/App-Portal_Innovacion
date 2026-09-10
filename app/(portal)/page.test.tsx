import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardPage = vi.fn();
const listarRecursosAsignados = vi.fn();

/* La barra del colaborador lee la ruta actual para marcar dónde está parado. */
/* `redirect` LANZA en Next, y el doble tiene que lanzar también: si volviera
   normalmente, la página seguiría leyendo la base y dibujándose, y el caso
   afirmaría lo contrario de lo que pasa en producción. */
const redirect = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  redirect: (destino: string) => redirect(destino),
}));

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
    redirect.mockClear();
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

    expect(screen.getByRole("heading", { name: "Hola, Ana" })).toBeInTheDocument();
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

    /* El saludo usa el primer nombre; la barra sigue mostrando el completo. */
    expect(screen.getByRole("heading", { name: "Hola, Ana" })).toBeInTheDocument();
    expect(screen.getByText("Ana Quispe")).toBeInTheDocument();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  LA PUERTA AL BUZÓN (ÍTEM #13), QUE AHORA DEPENDE DE QUIÉN MIRA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El buzón es de acceso general — el PRD lo deja fuera del sistema de
   * asignaciones — así que necesita una puerta que no dependa de que haya algo
   * asignado. Lo que cambió es DÓNDE está esa puerta: al colaborador se la
   * dibuja `PortalNav` en la barra, junto a «Mis recursos»; a quien administra
   * la barra le da las cuatro pantallas del panel, así que sin el enlace del
   * cuerpo el buzón no tendría entrada en ninguna parte de su portal.
   *
   * Lo que estos casos afirman es que SIEMPRE hay exactamente una puerta, y que
   * nunca hay dos compitiendo.
   */
  it("ofrece la entrada al buzón de sugerencias", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await PortalPage());

    expect(screen.getByRole("link", { name: /buzón de sugerencias/i })).toHaveAttribute(
      "href",
      "/sugerencias",
    );
  });

  it("al colaborador se la da la barra, no un botón repetido en el cuerpo", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await PortalPage());

    const barra = within(screen.getByRole("navigation", { name: "Portal" }));
    expect(barra.getByRole("link", { name: "Buzón de sugerencias" })).toBeInTheDocument();
    /* Una sola: la de la barra. Un segundo botón debajo diría lo mismo dos veces. */
    expect(screen.getAllByRole("link", { name: /buzón de sugerencias/i })).toHaveLength(1);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  ESTA PANTALLA NO ES DE QUIEN ADMINISTRA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Quien administra arma el catálogo y lo reparte; no usa lo que reparte. Y
   * como el proxy devuelve a todo el mundo a `/` después de iniciar sesión,
   * esta es la pantalla donde aterriza — así que el salto tiene que estar acá,
   * o su primera vista del portal sería una lista vacía que no es su trabajo.
   */
  it("manda a quien administra a su panel en vez de a una lista que no usa", async () => {
    guardPage.mockResolvedValue({
      allowed: true,
      usuario: { ...USUARIO, esAdmin: true },
    });

    await expect(PortalPage()).rejects.toThrow("REDIRECT:/admin/catalogo");
  });

  it("no consulta los recursos de quien va a ser redirigido", async () => {
    guardPage.mockResolvedValue({
      allowed: true,
      usuario: { ...USUARIO, esAdmin: true },
    });

    await expect(PortalPage()).rejects.toThrow();

    /* El salto va antes de leer, como el guard: quien nunca va a ver esta lista
       tampoco la consulta. */
    expect(listarRecursosAsignados).not.toHaveBeenCalled();
  });

  it("al colaborador no lo mueve de su pantalla", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await PortalPage());

    expect(redirect).not.toHaveBeenCalled();
  });

  it("mantiene el buzón a la vista aunque no haya nada asignado", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });
    listarRecursosAsignados.mockResolvedValue([]);

    render(await PortalPage());

    expect(screen.getByRole("link", { name: /buzón de sugerencias/i })).toBeInTheDocument();
  });

  it("le da al colaborador la vuelta a sus recursos desde la barra", async () => {
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await PortalPage());

    const barra = within(screen.getByRole("navigation", { name: "Portal" }));
    const misRecursos = barra.getByRole("link", { name: "Mis recursos" });

    expect(misRecursos).toHaveAttribute("href", "/");
    /* Está parado acá, y la barra lo dice. */
    expect(misRecursos).toHaveAttribute("aria-current", "page");
  });

  it("mantiene el cambio de tema al alcance del colaborador", async () => {
    /* El toggle vive detrás del menú de sesión de la topbar. Lo que esta pantalla
       garantiza es que ese menú esté montado: sin él, el colaborador se queda sin
       forma de cambiar de tema. `session-menu.test.tsx` cubre su interior. */
    guardPage.mockResolvedValue({ allowed: true, usuario: USUARIO });

    render(await PortalPage());

    expect(screen.getByRole("button", { name: "Ana Quispe Colaborador" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });
});
