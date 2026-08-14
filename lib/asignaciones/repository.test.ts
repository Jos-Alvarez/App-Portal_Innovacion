// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { AsignacionesClient } from "@/lib/asignaciones/repository";
import {
  asignarRecurso,
  leerRecursoAsignable,
  leerUsuarioAsignable,
  revocarRecurso,
} from "@/lib/asignaciones/repository";

/**
 * The reads and writes an assignment performs.
 *
 * The Prisma client is an argument, so the suite passes a double and never
 * opens a connection against the shared corporate SQL Server instance.
 *
 * TWO PROPERTIES ARE THE WHOLE POINT OF THIS FILE.
 *
 * First, WHICH TABLE. There is no shared parent for the two grants (ADR 0002
 * splits them deliberately), so every function branches once on the type — and
 * these tests assert that `"enlace"` reaches `asignacion_enlace` and only that,
 * and `"procesador"` reaches `asignacion_procesador` and only that. A crossed
 * wire here would hand someone access to the wrong catalogue entirely.
 *
 * Second, IDEMPOTENCY. Granting what is already granted succeeds; revoking what
 * is already revoked succeeds. That is not politeness, it is the contract PUT
 * and DELETE promise, and it is what stops a double-clicked switch from
 * reporting a failure that did not happen.
 */

/** A double whose two assignment tables are told apart by name, not by shape. */
function clientDouble() {
  const usuarioFindUnique = vi.fn(async (_args: unknown) => ({ activo: true }));
  const enlaceFindUnique = vi.fn(async (_args: unknown) => ({ activo: true }));
  const procesadorFindUnique = vi.fn(async (_args: unknown) => ({ activo: true }));

  const enlaceCreate = vi.fn(async (_args: unknown) => ({}));
  const enlaceDelete = vi.fn(async (_args: unknown) => ({}));
  const procesadorCreate = vi.fn(async (_args: unknown) => ({}));
  const procesadorDelete = vi.fn(async (_args: unknown) => ({}));

  const client = {
    usuario: { findUnique: usuarioFindUnique },
    enlace: { findUnique: enlaceFindUnique },
    procesador: { findUnique: procesadorFindUnique },
    asignacionEnlace: { create: enlaceCreate, delete: enlaceDelete },
    asignacionProcesador: { create: procesadorCreate, delete: procesadorDelete },
  } as unknown as AsignacionesClient;

  return {
    client,
    usuarioFindUnique,
    enlaceFindUnique,
    procesadorFindUnique,
    enlaceCreate,
    enlaceDelete,
    procesadorCreate,
    procesadorDelete,
  };
}

/** Prisma's duplicate-key failure, as the client throws it. */
const YA_EXISTE = { code: "P2002" };
/** Prisma's "matched nothing" failure, raised by `delete`. */
const NO_EXISTE = { code: "P2025" };

describe("leerUsuarioAsignable", () => {
  it("reads only the flag the decision needs", async () => {
    const { client, usuarioFindUnique } = clientDouble();

    expect(await leerUsuarioAsignable(client, 4)).toEqual({ activo: true });
    expect(usuarioFindUnique.mock.calls[0][0]).toEqual({
      where: { id: 4 },
      select: { activo: true },
    });
  });

  it("answers null when there is no such account", async () => {
    const { client, usuarioFindUnique } = clientDouble();
    usuarioFindUnique.mockResolvedValue(null as never);

    expect(await leerUsuarioAsignable(client, 999)).toBeNull();
  });
});

describe("leerRecursoAsignable", () => {
  it("reads the enlace table for an enlace, and leaves procesador alone", async () => {
    const { client, enlaceFindUnique, procesadorFindUnique } = clientDouble();

    expect(await leerRecursoAsignable(client, "enlace", 7)).toEqual({ activo: true });
    expect(enlaceFindUnique.mock.calls[0][0]).toEqual({
      where: { id: 7 },
      select: { activo: true },
    });
    expect(procesadorFindUnique).not.toHaveBeenCalled();
  });

  it("reads the procesador table for a procesador, and leaves enlace alone", async () => {
    const { client, enlaceFindUnique, procesadorFindUnique } = clientDouble();

    expect(await leerRecursoAsignable(client, "procesador", 7)).toEqual({ activo: true });
    expect(procesadorFindUnique.mock.calls[0][0]).toEqual({
      where: { id: 7 },
      select: { activo: true },
    });
    expect(enlaceFindUnique).not.toHaveBeenCalled();
  });

  it("reports a baja rather than hiding it, so the caller decides what it means", async () => {
    const { client, enlaceFindUnique } = clientDouble();
    enlaceFindUnique.mockResolvedValue({ activo: false } as never);

    expect(await leerRecursoAsignable(client, "enlace", 7)).toEqual({ activo: false });
  });

  it("answers null when there is no such row", async () => {
    const { client, procesadorFindUnique } = clientDouble();
    procesadorFindUnique.mockResolvedValue(null as never);

    expect(await leerRecursoAsignable(client, "procesador", 999)).toBeNull();
  });
});

describe("asignarRecurso", () => {
  it("writes the composite key of asignacion_enlace", async () => {
    const { client, enlaceCreate, procesadorCreate } = clientDouble();

    await asignarRecurso(client, "enlace", 4, 7);

    expect(enlaceCreate.mock.calls[0][0]).toEqual({ data: { usuarioId: 4, enlaceId: 7 } });
    expect(procesadorCreate).not.toHaveBeenCalled();
  });

  it("writes the composite key of asignacion_procesador", async () => {
    const { client, enlaceCreate, procesadorCreate } = clientDouble();

    await asignarRecurso(client, "procesador", 4, 7);

    expect(procesadorCreate.mock.calls[0][0]).toEqual({ data: { usuarioId: 4, procesadorId: 7 } });
    expect(enlaceCreate).not.toHaveBeenCalled();
  });

  /**
   * The double-clicked switch, and the two administrators editing the same rota
   * at the same moment. The grant is in place either way, which is what was
   * asked for.
   */
  it.each(["enlace", "procesador"] as const)(
    "treats an already existing %s grant as done, not as a conflict",
    async (tipo) => {
      const { client, enlaceCreate, procesadorCreate } = clientDouble();
      enlaceCreate.mockRejectedValue(YA_EXISTE as never);
      procesadorCreate.mockRejectedValue(YA_EXISTE as never);

      await expect(asignarRecurso(client, tipo, 4, 7)).resolves.toBeUndefined();
    },
  );

  it.each(["enlace", "procesador"] as const)(
    "still reports a real %s failure instead of swallowing everything",
    async (tipo) => {
      const { client, enlaceCreate, procesadorCreate } = clientDouble();
      enlaceCreate.mockRejectedValue({ code: "P2003" } as never);
      procesadorCreate.mockRejectedValue({ code: "P2003" } as never);

      await expect(asignarRecurso(client, tipo, 4, 7)).rejects.toEqual({ code: "P2003" });
    },
  );

  /**
   * The inverted mapping, from the other side. P2025 has no meaning on a
   * `create`, so if one ever arrives it must NOT be quietly read as success —
   * that would be the revoke path's rule applied to the grant path.
   */
  it("does not swallow the code that belongs to the revoke path", async () => {
    const { client, enlaceCreate } = clientDouble();
    enlaceCreate.mockRejectedValue(NO_EXISTE as never);

    await expect(asignarRecurso(client, "enlace", 4, 7)).rejects.toEqual(NO_EXISTE);
  });
});

describe("revocarRecurso", () => {
  it("deletes by the composite key of asignacion_enlace", async () => {
    const { client, enlaceDelete, procesadorDelete } = clientDouble();

    await revocarRecurso(client, "enlace", 4, 7);

    expect(enlaceDelete.mock.calls[0][0]).toEqual({
      where: { usuarioId_enlaceId: { usuarioId: 4, enlaceId: 7 } },
    });
    expect(procesadorDelete).not.toHaveBeenCalled();
  });

  it("deletes by the composite key of asignacion_procesador", async () => {
    const { client, enlaceDelete, procesadorDelete } = clientDouble();

    await revocarRecurso(client, "procesador", 4, 7);

    expect(procesadorDelete.mock.calls[0][0]).toEqual({
      where: { usuarioId_procesadorId: { usuarioId: 4, procesadorId: 7 } },
    });
    expect(enlaceDelete).not.toHaveBeenCalled();
  });

  it.each(["enlace", "procesador"] as const)(
    "treats an already revoked %s grant as done, not as a 404",
    async (tipo) => {
      const { client, enlaceDelete, procesadorDelete } = clientDouble();
      enlaceDelete.mockRejectedValue(NO_EXISTE as never);
      procesadorDelete.mockRejectedValue(NO_EXISTE as never);

      await expect(revocarRecurso(client, tipo, 4, 7)).resolves.toBeUndefined();
    },
  );

  it.each(["enlace", "procesador"] as const)(
    "still reports a real %s failure instead of swallowing everything",
    async (tipo) => {
      const { client, enlaceDelete, procesadorDelete } = clientDouble();
      enlaceDelete.mockRejectedValue({ code: "P1001" } as never);
      procesadorDelete.mockRejectedValue({ code: "P1001" } as never);

      await expect(revocarRecurso(client, tipo, 4, 7)).rejects.toEqual({ code: "P1001" });
    },
  );

  /** The mirror of the grant path's guard: P2002 has no meaning on a delete. */
  it("does not swallow the code that belongs to the grant path", async () => {
    const { client, enlaceDelete } = clientDouble();
    enlaceDelete.mockRejectedValue(YA_EXISTE as never);

    await expect(revocarRecurso(client, "enlace", 4, 7)).rejects.toEqual(YA_EXISTE);
  });

  /**
   * The hard delete is deliberate and is safe: these tables have no `activo` to
   * flip, nothing references an assignment row, and ADR 0010 formally accepts
   * that no assignment history is kept — the adoption metric reads the current
   * snapshot on purpose.
   */
  it("removes the row instead of flipping a flag it does not have", async () => {
    const { client, enlaceDelete } = clientDouble();

    await revocarRecurso(client, "enlace", 4, 7);

    expect(enlaceDelete).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(enlaceDelete.mock.calls[0][0])).not.toContain("activo");
  });
});
