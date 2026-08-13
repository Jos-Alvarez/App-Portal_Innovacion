// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { EnlacesClient } from "@/lib/enlaces/repository";
import {
  actualizarEnlace,
  crearEnlace,
  darDeBajaEnlace,
  listarEnlaces,
} from "@/lib/enlaces/repository";

/**
 * The four writes and reads the catalogue performs.
 *
 * The Prisma client is an argument, exactly as in `lib/authz/repository.ts`, so
 * the suite passes a double and never opens a connection against the shared
 * corporate SQL Server instance (README.md's operational rules).
 *
 * What these tests protect is the SHAPE of what reaches Prisma: the columns
 * selected, the absence of an `activo` filter on the admin list, and — the one
 * that matters most — that the baja updates a flag and never deletes a row.
 */

const FILA = {
  id: 7,
  nombre: "Portal de facturación",
  descripcion: "Facturación electrónica.",
  url: "https://facturacion.ejemplo.com",
  tipo: "app",
  activo: true,
};

function clientDouble(result: unknown = FILA) {
  const findMany = vi.fn(async (_args?: unknown) => [result]);
  const create = vi.fn(async (_args: unknown) => result);
  const update = vi.fn(async (_args: unknown) => result);
  const deleteRow = vi.fn(async (_args: unknown) => result);

  const client = {
    enlace: { findMany, create, update, delete: deleteRow },
  } as unknown as EnlacesClient;

  return { client, findMany, create, update, deleteRow };
}

/** Every column the API hands to the browser, and nothing else. */
const SELECT_DTO = {
  id: true,
  nombre: true,
  descripcion: true,
  url: true,
  tipo: true,
  activo: true,
};

describe("listarEnlaces", () => {
  it("reads exactly the columns the API sends back", async () => {
    const { client, findMany } = clientDouble();

    await listarEnlaces(client);

    expect(findMany.mock.calls[0][0]).toMatchObject({ select: SELECT_DTO });
  });

  /**
   * The administration catalogue is the one screen that must see a baja. The
   * guard already hides an inactive resource from the collaborator who was
   * assigned it (`authorizeGrant` denies `inactive-resource`), so the filtering
   * happens there and must NOT be repeated here — otherwise the administrator
   * loses sight of the rows they just deactivated and cannot restore one.
   */
  it("lists rows that were given de baja, not only the active ones", async () => {
    const { client, findMany } = clientDouble();

    await listarEnlaces(client);

    expect(findMany.mock.calls[0][0]).not.toHaveProperty("where");
  });

  it("orders by name, which is how the catalogue is read", async () => {
    const { client, findMany } = clientDouble();

    await listarEnlaces(client);

    expect(findMany.mock.calls[0][0]).toMatchObject({ orderBy: { nombre: "asc" } });
  });

  it("returns the rows as they came", async () => {
    const { client } = clientDouble();

    expect(await listarEnlaces(client)).toEqual([FILA]);
  });
});

describe("crearEnlace", () => {
  it("writes the four columns a creation owns", async () => {
    const { client, create } = clientDouble();

    await crearEnlace(client, {
      nombre: "Agente de compras",
      descripcion: "Responde dudas de compras.",
      url: "https://agente.ejemplo.com",
      tipo: "agente",
    });

    expect(create.mock.calls[0][0]).toEqual({
      data: {
        nombre: "Agente de compras",
        descripcion: "Responde dudas de compras.",
        url: "https://agente.ejemplo.com",
        tipo: "agente",
      },
      select: SELECT_DTO,
    });
  });

  /**
   * `activo` is absent on purpose: the column defaults to `true` in the
   * schema, so a new enlace is usable without the API asserting it, and there
   * is exactly one place — the baja — that ever moves the flag.
   */
  it("never sets activo on creation, leaving the column default to do it", async () => {
    const { client, create } = clientDouble();

    await crearEnlace(client, {
      nombre: "Nuevo",
      descripcion: null,
      url: "https://ejemplo.com",
      tipo: "app",
    });

    expect(create.mock.calls[0][0]).not.toHaveProperty("data.activo");
  });

  it("stores a missing description as null rather than as undefined", async () => {
    const { client, create } = clientDouble();

    await crearEnlace(client, {
      nombre: "Nuevo",
      descripcion: undefined,
      url: "https://ejemplo.com",
      tipo: "app",
    });

    expect((create.mock.calls[0][0] as { data: { descripcion: unknown } }).data.descripcion).toBeNull();
  });
});

describe("actualizarEnlace", () => {
  it("keys the write on the id and returns the updated row", async () => {
    const { client, update } = clientDouble();

    const row = await actualizarEnlace(client, 7, { nombre: "Otro nombre" });

    expect(update.mock.calls[0][0]).toEqual({
      where: { id: 7 },
      data: { nombre: "Otro nombre" },
      select: SELECT_DTO,
    });
    expect(row).toEqual(FILA);
  });

  /**
   * A PATCH sends only what changed, so a field the administrator did not
   * touch must not appear in the write at all — passing it as `undefined`
   * would be read by Prisma as "leave it", but passing it as `null` would blank
   * a description nobody asked to blank.
   */
  it("writes only the fields the request actually carried", async () => {
    const { client, update } = clientDouble();

    await actualizarEnlace(client, 7, { activo: false });

    expect((update.mock.calls[0][0] as { data: Record<string, unknown> }).data).toEqual({
      activo: false,
    });
  });

  it("can blank a description when that is the explicit change", async () => {
    const { client, update } = clientDouble();

    await actualizarEnlace(client, 7, { descripcion: null });

    expect((update.mock.calls[0][0] as { data: Record<string, unknown> }).data).toEqual({
      descripcion: null,
    });
  });
});

describe("darDeBajaEnlace", () => {
  /**
   * The rule the whole feature depends on. `asignacion_enlace` rows point at
   * this id, the analytics events of ADR 0010 reference it by id with no
   * foreign key to protect them, and the authorization guard already treats
   * `activo = false` as "no access". Removing the row would break all three
   * silently; flipping the flag is what the guard is already written to expect.
   */
  it("flips the flag instead of removing the row", async () => {
    const { client, update, deleteRow } = clientDouble({ ...FILA, activo: false });

    const row = await darDeBajaEnlace(client, 7);

    expect(deleteRow).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0]).toEqual({
      where: { id: 7 },
      data: { activo: false },
      select: SELECT_DTO,
    });
    expect(row.activo).toBe(false);
  });

  it("changes nothing else about the row", async () => {
    const { client, update } = clientDouble({ ...FILA, activo: false });

    await darDeBajaEnlace(client, 7);

    expect(Object.keys((update.mock.calls[0][0] as { data: object }).data)).toEqual(["activo"]);
  });
});
