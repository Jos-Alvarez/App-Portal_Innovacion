// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { EventosClient } from "@/lib/eventos/repository";
import { registrarEvento } from "@/lib/eventos/repository";

/**
 * The first writer `evento_uso` has ever had.
 *
 * The Prisma client is an argument, exactly as in `lib/enlaces/repository.ts`,
 * so the suite passes a double and never opens a connection against the shared
 * corporate SQL Server instance (README.md's operational rules).
 *
 * What these tests protect is the SHAPE of the row that reaches the table.
 * `evento_uso` has no foreign key to `enlace` or `procesador` — ADR 0002 made
 * the reference polymorphic on purpose and put its integrity in the application
 * layer — so the database will accept a row that names the wrong table and say
 * nothing. The analytics of items #18 and #19 read exactly these four columns,
 * and there is nothing downstream that could notice they were written wrong.
 */

function clientDouble() {
  const create = vi.fn(async (_args: unknown) => ({ id: 1 }));

  const client = { eventoUso: { create } } as unknown as EventosClient;

  return { client, create };
}

describe("registrarEvento", () => {
  it("writes the four columns that identify what happened", async () => {
    const { client, create } = clientDouble();

    await registrarEvento(client, {
      usuarioId: 4,
      tipoRecurso: "enlace",
      idRecurso: 7,
      tipoEvento: "apertura",
    });

    expect(create.mock.calls[0][0]).toEqual({
      data: { usuarioId: 4, tipoRecurso: "enlace", idRecurso: 7, tipoEvento: "apertura" },
    });
  });

  /**
   * The polymorphic reference of ADR 0002: the type and the id travel together
   * and neither is inferred. A row saying `procesador` must be able to carry a
   * procesador id even though this item only ever writes `enlace` rows — item
   * #10 writes the other half through this same function.
   */
  it("takes the resource type and the id as the caller gives them", async () => {
    const { client, create } = clientDouble();

    await registrarEvento(client, {
      usuarioId: 4,
      tipoRecurso: "procesador",
      idRecurso: 12,
      tipoEvento: "ejecucion",
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      data: { tipoRecurso: "procesador", idRecurso: 12 },
    });
  });

  /**
   * `fecha` has a `now()` default in the schema, so not writing it leaves the
   * timestamp to the database's clock. Sending one from the application would
   * put a second clock on the same column: SQL Server and the Node process are
   * different machines in this deployment, and ADR 0010's every query is bounded
   * by a date range, so two clocks disagreeing puts events in the wrong period.
   */
  it("never writes fecha, leaving the column default to timestamp the row", async () => {
    const { client, create } = clientDouble();

    await registrarEvento(client, {
      usuarioId: 4,
      tipoRecurso: "enlace",
      idRecurso: 7,
      tipoEvento: "apertura",
    });

    expect(create.mock.calls[0][0]).not.toHaveProperty("data.fecha");
  });

  it("selects nothing back: the caller has no use for the row it just wrote", async () => {
    const { client, create } = clientDouble();

    await registrarEvento(client, {
      usuarioId: 4,
      tipoRecurso: "enlace",
      idRecurso: 7,
      tipoEvento: "apertura",
    });

    expect(create.mock.calls[0][0]).not.toHaveProperty("select");
  });

  /**
   * The failure is NOT swallowed here. Whether a missing event is tolerable is
   * the caller's decision and it differs per caller — the apertura route treats
   * it as fatal because the record is the reason that route exists at all — so
   * this function reports and never decides.
   */
  it("lets a failed write reach the caller instead of hiding it", async () => {
    const { client, create } = clientDouble();
    create.mockRejectedValue(new Error("Timeout expired"));

    await expect(
      registrarEvento(client, {
        usuarioId: 4,
        tipoRecurso: "enlace",
        idRecurso: 7,
        tipoEvento: "apertura",
      }),
    ).rejects.toThrow("Timeout expired");
  });
});
