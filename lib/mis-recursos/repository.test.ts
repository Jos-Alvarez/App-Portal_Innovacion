// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { MisRecursosClient } from "@/lib/mis-recursos/repository";
import { leerUrlDeEnlace, listarRecursosAsignados } from "@/lib/mis-recursos/repository";

/**
 * The collaborator's own view of the catalogue: what they were assigned, read
 * from the two grant tables ADR 0002 keeps apart, merged into one list.
 *
 * The Prisma client is an argument, so the suite passes a double and never
 * opens a connection against the shared corporate SQL Server instance.
 *
 * Two properties matter more than the rest here, and both are security
 * properties rather than formatting ones: the read is scoped to the session
 * user, and it never selects `enlace.url`.
 */

const FILA_ENLACE = {
  enlace: { id: 7, nombre: "Portal de facturación", descripcion: "Facturación.", tipo: "app" },
};

const FILA_PROCESADOR = {
  procesador: { id: 3, nombre: "Consolidador de reportes", descripcion: null },
};

function clientDouble(
  enlaces: unknown[] = [FILA_ENLACE],
  procesadores: unknown[] = [FILA_PROCESADOR],
  url: unknown = { url: "https://facturacion.ejemplo.com" },
) {
  const enlacesFindMany = vi.fn(async (_args?: unknown) => enlaces);
  const procesadoresFindMany = vi.fn(async (_args?: unknown) => procesadores);
  const findUnique = vi.fn(async (_args?: unknown) => url);

  const client = {
    asignacionEnlace: { findMany: enlacesFindMany },
    asignacionProcesador: { findMany: procesadoresFindMany },
    enlace: { findUnique },
  } as unknown as MisRecursosClient;

  return { client, enlacesFindMany, procesadoresFindMany, findUnique };
}

describe("listarRecursosAsignados", () => {
  /**
   * The whole authorization model of ADR 0007 for this screen. Both reads are
   * filtered by the session user's id at the query level, so there is no moment
   * where another collaborator's rows exist in memory and a later filter is the
   * only thing keeping them off the page.
   */
  it("scopes both reads to the user asking, at the query", async () => {
    const { client, enlacesFindMany, procesadoresFindMany } = clientDouble();

    await listarRecursosAsignados(client, 4);

    expect(enlacesFindMany.mock.calls[0][0]).toMatchObject({ where: { usuarioId: 4 } });
    expect(procesadoresFindMany.mock.calls[0][0]).toMatchObject({ where: { usuarioId: 4 } });
  });

  /**
   * A resource given de baja is denied by the guard on any attempted use
   * (`authorizeGrant` answers `inactive-resource`), so listing it would put
   * something on the dashboard that cannot be opened — an invitation to a 403.
   * The admin catalogues deliberately do the opposite; this is the collaborator
   * view, and the two have different jobs.
   */
  it("leaves out resources that were given de baja", async () => {
    const { client, enlacesFindMany, procesadoresFindMany } = clientDouble();

    await listarRecursosAsignados(client, 4);

    expect(enlacesFindMany.mock.calls[0][0]).toMatchObject({
      where: { enlace: { activo: true } },
    });
    expect(procesadoresFindMany.mock.calls[0][0]).toMatchObject({
      where: { procesador: { activo: true } },
    });
  });

  /**
   * THE SECURITY ASSERTION OF THIS FILE. The dashboard links to the redirect
   * route, never to the destination, so the external URL has no reason to reach
   * the browser — and a column that is never selected cannot leak from a stale
   * page, a cached response or a screenshot.
   */
  it("never reads the external URL into the list", async () => {
    const { client, enlacesFindMany } = clientDouble();

    const recursos = await listarRecursosAsignados(client, 4);

    expect(JSON.stringify(enlacesFindMany.mock.calls[0][0])).not.toMatch(/url/i);
    for (const recurso of recursos) {
      expect(recurso).not.toHaveProperty("url");
    }
  });

  it("reads only the columns the dashboard renders", async () => {
    const { client, enlacesFindMany, procesadoresFindMany } = clientDouble();

    await listarRecursosAsignados(client, 4);

    expect(enlacesFindMany.mock.calls[0][0]).toMatchObject({
      select: { enlace: { select: { id: true, nombre: true, descripcion: true, tipo: true } } },
    });
    expect(procesadoresFindMany.mock.calls[0][0]).toMatchObject({
      select: { procesador: { select: { id: true, nombre: true, descripcion: true } } },
    });
  });

  /**
   * The unified shape. `tipo` carries one vocabulary of three — the enlace's own
   * `app`/`agente` plus `procesador` — because the dashboard renders one list
   * and one chip per row, so a screen that had to look in a different field
   * depending on the row would be branching on structure the reader never sees.
   */
  it("returns enlaces and procesadores in one list under one vocabulary", async () => {
    const { client } = clientDouble();

    expect(await listarRecursosAsignados(client, 4)).toEqual([
      { tipo: "procesador", id: 3, nombre: "Consolidador de reportes", descripcion: null },
      { tipo: "app", id: 7, nombre: "Portal de facturación", descripcion: "Facturación." },
    ]);
  });

  /**
   * `tipo` determines which table the id belongs to, so the pair is unique
   * across the merged list even when an enlace and a procesador share an id.
   * That is what makes it usable as the row's key and as the only thing the UI
   * needs to build the action for a row.
   */
  it("keeps an enlace and a procesador that share an id apart", async () => {
    const { client } = clientDouble(
      [{ enlace: { id: 3, nombre: "Agente", descripcion: null, tipo: "agente" } }],
      [{ procesador: { id: 3, nombre: "Agente", descripcion: null } }],
    );

    const recursos = await listarRecursosAsignados(client, 4);

    expect(recursos.map((recurso) => `${recurso.tipo}:${recurso.id}`)).toEqual([
      "agente:3",
      "procesador:3",
    ]);
  });

  /**
   * One alphabetical list and not two blocks: the collaborator is looking for a
   * resource by its name, and which of the two tables it happens to live in is
   * an implementation detail of ADR 0002 they have no reason to know.
   */
  it("orders the merged list by name, not by which table a row came from", async () => {
    const { client } = clientDouble(
      [{ enlace: { id: 1, nombre: "Zeta", descripcion: null, tipo: "app" } }],
      [{ procesador: { id: 2, nombre: "Alfa", descripcion: null } }],
    );

    expect((await listarRecursosAsignados(client, 4)).map((recurso) => recurso.nombre)).toEqual([
      "Alfa",
      "Zeta",
    ]);
  });

  it("sorts accented names the way Spanish reads them", async () => {
    const { client } = clientDouble(
      [
        { enlace: { id: 1, nombre: "Nómina", descripcion: null, tipo: "app" } },
        { enlace: { id: 2, nombre: "Nube", descripcion: null, tipo: "app" } },
      ],
      [],
    );

    expect((await listarRecursosAsignados(client, 4)).map((recurso) => recurso.nombre)).toEqual([
      "Nómina",
      "Nube",
    ]);
  });

  it("answers an empty list when nothing was assigned", async () => {
    const { client } = clientDouble([], []);

    expect(await listarRecursosAsignados(client, 4)).toEqual([]);
  });
});

describe("leerUrlDeEnlace", () => {
  /**
   * One column. The apertura route already knows who is asking and that they
   * hold a usable grant — the guard settled both before this runs — so the
   * destination is the only thing left to learn.
   */
  it("reads the destination and nothing else about the row", async () => {
    const { client, findUnique } = clientDouble();

    expect(await leerUrlDeEnlace(client, 7)).toBe("https://facturacion.ejemplo.com");
    expect(findUnique.mock.calls[0][0]).toEqual({ where: { id: 7 }, select: { url: true } });
  });

  /**
   * Not filtered by `activo`, on purpose. The guard denies a grant over an
   * inactive resource before this is reached, and repeating the rule here would
   * put a second, weaker copy of it in a place where a future edit could make
   * the two disagree.
   */
  it("does not re-check activo, which the guard already settled", async () => {
    const { client, findUnique } = clientDouble();

    await leerUrlDeEnlace(client, 7);

    expect(findUnique.mock.calls[0][0]).not.toHaveProperty("where.activo");
  });

  it("answers null when there is no such row", async () => {
    const { client } = clientDouble([FILA_ENLACE], [FILA_PROCESADOR], null);

    expect(await leerUrlDeEnlace(client, 7)).toBeNull();
  });
});
