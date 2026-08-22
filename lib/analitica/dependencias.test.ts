// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dependenciasDe } from "./dependencias";
import type { AnaliticaClient } from "./repository";

/**
 * The binding both callers of `calcularAnalitica` share.
 *
 * What is asserted here is the only thing this module can get wrong, and it is
 * the reason it exists: WHICH reads happen and HOW MANY round trips they cost.
 * The queries themselves belong to `repository.test.ts`, which owns the `where`
 * clauses and the row mapping — repeating them here would assert the same code
 * twice and lock the shape of a query this module never looks at.
 */

const eventoUso = { groupBy: vi.fn() };
const sugerencia = { groupBy: vi.fn() };
const enlace = { findMany: vi.fn() };
const procesador = { findMany: vi.fn() };
const usuario = { findMany: vi.fn() };

const client = { eventoUso, sugerencia, enlace, procesador, usuario } as unknown as AnaliticaClient;

const PERIODO = {
  desde: new Date("2026-08-21T05:00:00.000Z"),
  hasta: new Date("2026-08-22T05:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  eventoUso.groupBy.mockResolvedValue([]);
  sugerencia.groupBy.mockResolvedValue([]);
  enlace.findMany.mockResolvedValue([]);
  procesador.findMany.mockResolvedValue([]);
  usuario.findMany.mockResolvedValue([]);
});

describe("dependenciasDe", () => {
  it("lee las dimensiones del catálogo y del padrón", async () => {
    await dependenciasDe(client).leerDimensiones();

    expect(enlace.findMany).toHaveBeenCalledTimes(1);
    expect(procesador.findMany).toHaveBeenCalledTimes(1);
    expect(usuario.findMany).toHaveBeenCalledTimes(1);
  });

  it("agrega un periodo con las tres consultas del motor y nada más", async () => {
    await dependenciasDe(client).agregar(PERIODO);

    /* Dos sobre evento_uso — por recurso y por usuario — y una sobre sugerencia. */
    expect(eventoUso.groupBy).toHaveBeenCalledTimes(2);
    expect(sugerencia.groupBy).toHaveBeenCalledTimes(1);
  });

  it("no toca las dimensiones al agregar: son la misma respuesta para los dos periodos", async () => {
    await dependenciasDe(client).agregar(PERIODO);

    expect(enlace.findMany).not.toHaveBeenCalled();
    expect(procesador.findMany).not.toHaveBeenCalled();
    expect(usuario.findMany).not.toHaveBeenCalled();
  });

  /*
   * The one behaviour worth pinning down. Three sequential awaits would answer
   * the same numbers and cost three round trips of latency per period — six with
   * a comparison — which is the whole reason this binding is written once.
   */
  it("lanza las tres agregaciones en paralelo, no en secuencia", async () => {
    const enVuelo = { valor: 0, maximo: 0 };

    function contando<T>(resultado: T) {
      return () =>
        new Promise<T>((resolve) => {
          enVuelo.valor += 1;
          enVuelo.maximo = Math.max(enVuelo.maximo, enVuelo.valor);

          setTimeout(() => {
            enVuelo.valor -= 1;
            resolve(resultado);
          }, 0);
        });
    }

    eventoUso.groupBy.mockImplementation(contando([]));
    sugerencia.groupBy.mockImplementation(contando([]));

    await dependenciasDe(client).agregar(PERIODO);

    expect(enVuelo.maximo).toBe(3);
  });

  it("devuelve los tres conteos bajo los nombres que el motor espera", async () => {
    eventoUso.groupBy
      .mockResolvedValueOnce([
        { tipoRecurso: "enlace", idRecurso: 4, tipoEvento: "apertura", _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([
        { usuarioId: 7, tipoEvento: "apertura", _count: { _all: 2 } },
      ]);
    sugerencia.groupBy.mockResolvedValue([{ autorId: 7, estado: "pendiente", _count: { _all: 1 } }]);

    const conteos = await dependenciasDe(client).agregar(PERIODO);

    expect(conteos.porRecurso).toHaveLength(1);
    expect(conteos.porUsuario).toHaveLength(1);
    expect(conteos.sugerencias).toHaveLength(1);
  });
});
