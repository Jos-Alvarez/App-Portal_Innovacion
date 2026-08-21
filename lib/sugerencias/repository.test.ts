// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { SugerenciasClient } from "./repository";
import { crearSugerencia, leerAreaDelAutor, listarSugerenciasDeAutor } from "./repository";

/**
 * The reads and the write the suggestions box performs.
 *
 * The Prisma client is an argument, so the suite passes a double and never opens
 * a connection against the shared corporate SQL Server instance (README.md's
 * operational rules).
 *
 * What these tests protect is the SHAPE of what reaches Prisma: that the ledger
 * is opened in the same write as the row, that the state of both comes from one
 * constant, that the list is scoped to its author with no way to widen it, and
 * that no `Date` object escapes towards a browser.
 */

const CREADA = new Date("2026-08-21T14:30:00.000Z");

const FILA = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
  estado: "pendiente",
  fechaCreacion: CREADA,
  historial: [
    {
      id: 90,
      estadoAnterior: null,
      estadoNuevo: "pendiente",
      fechaCambio: CREADA,
      autor: { nombre: "Ana Quispe" },
    },
  ],
};

function clientDouble(fila: unknown = FILA, area: string | null = "Operaciones") {
  const create = vi.fn(async (_args: unknown) => fila);
  const findMany = vi.fn(async (_args?: unknown) => [fila]);
  const findUnique = vi.fn(async (_args: unknown) => (area === null ? null : { area }));

  const client = {
    sugerencia: { create, findMany },
    usuario: { findUnique },
  } as unknown as SugerenciasClient;

  return { client, create, findMany, findUnique };
}

const DATOS = {
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
};

describe("crearSugerencia", () => {
  it("nace en «pendiente», como pide el ítem #13", async () => {
    const { client, create } = clientDouble();

    await crearSugerencia(client, 12, DATOS);

    expect(create.mock.calls[0]?.[0]).toMatchObject({ data: { estado: "pendiente" } });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  LA FILA Y SU PRIMER ASIENTO SE ESCRIBEN JUNTOS
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `prisma/schema.prisma` dice para qué es el `estado_anterior` nulo: "NULL for
   * the entry row of a suggestion that has no previous state". Ese asiento solo
   * puede escribirse al crear. Sin él, la traza de una sugerencia recién enviada
   * está VACÍA — y el ítem #13 pide "listado propio con trazabilidad visible".
   *
   * Va anidado y no en dos llamadas dentro de `$transaction`: Prisma corre el
   * create anidado en una transacción implícita, así que la fila y su asiento
   * existen los dos o ninguno, sin costarle a este módulo un `$transaction` que
   * cada doble de prueba tendría que implementar.
   */
  it("abre el historial en la misma escritura, con estado anterior nulo", async () => {
    const { client, create } = clientDouble();

    await crearSugerencia(client, 12, DATOS);

    const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;

    expect(data.historial).toEqual({ create: { estadoNuevo: "pendiente", cambiadoPor: 12 } });
  });

  /**
   * El `estado` de la fila y el `estadoNuevo` de su primer asiento tienen que
   * decir lo mismo. Si uno saliera del default de la columna y el otro de una
   * constante de TypeScript, habría dos fuentes para un solo hecho — y el día
   * que discrepen, la traza contradice al chip que está encima.
   */
  it("escribe el mismo estado en la fila y en el asiento, desde una sola constante", async () => {
    const { client, create } = clientDouble();

    await crearSugerencia(client, 12, DATOS);

    const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    const asiento = (data.historial as { create: { estadoNuevo: string } }).create;

    expect(asiento.estadoNuevo).toBe(data.estado);
  });

  it("firma el asiento con el propio autor: nadie más movió nada todavía", async () => {
    const { client, create } = clientDouble();

    await crearSugerencia(client, 12, DATOS);

    const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;

    expect(data.autorId).toBe(12);
    expect((data.historial as { create: { cambiadoPor: number } }).create.cambiadoPor).toBe(12);
  });

  /** El autor sale del parámetro, jamás del cuerpo que se está guardando. */
  it("ignora un autorId que venga entre los datos", async () => {
    const { client, create } = clientDouble();

    await crearSugerencia(client, 12, { ...DATOS, autorId: 999 } as never);

    const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;

    expect(data.autorId).toBe(12);
  });

  it("no escribe grupoId: agrupar es del ítem #16 y lo hace el administrador", async () => {
    const { client, create } = clientDouble();

    await crearSugerencia(client, 12, DATOS);

    const data = (create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;

    expect(data).not.toHaveProperty("grupoId");
  });
});

describe("listarSugerenciasDeAutor", () => {
  it("filtra siempre por el autor que se le pasa", async () => {
    const { client, findMany } = clientDouble();

    await listarSugerenciasDeAutor(client, 12);

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ where: { autorId: 12 } });
  });

  /**
   * El `where` ES la autorización. No hay modo "todas" ni valor por defecto, así
   * que no existe forma de llamar a esta función y leer sin querer las
   * sugerencias de otro. El ítem #15 necesita la lista completa: tiene que
   * agregar una lectura SEPARADA y protegida por el guard de administrador, no
   * volver condicional este filtro.
   */
  it("no ofrece ninguna forma de pedir «todas»", async () => {
    const { client, findMany } = clientDouble();

    await listarSugerenciasDeAutor(client, 12);

    const where = (findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;

    expect(Object.keys(where)).toEqual(["autorId"]);
    expect(listarSugerenciasDeAutor.length).toBe(2);
  });

  it("devuelve lo más reciente primero, con desempate estable", async () => {
    const { client, findMany } = clientDouble();

    await listarSugerenciasDeAutor(client, 12);

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ fechaCreacion: "desc" }, { id: "desc" }],
    });
  });

  /** La traza se lee como un relato: el envío arriba, el estado actual abajo. */
  it("pide el historial del más viejo al más nuevo, ordenado por id", async () => {
    const { client, findMany } = clientDouble();

    await listarSugerenciasDeAutor(client, 12);

    const select = (findMany.mock.calls[0]?.[0] as { select: Record<string, unknown> }).select;

    expect(select.historial).toMatchObject({ orderBy: { id: "asc" } });
  });

  /**
   * Estrecho a propósito, como toda lectura del portal: una columna nueva en
   * `sugerencia` no empieza sola a viajar a cada navegador. Nótese lo que NO
   * está: `autorId` y `grupoId`.
   */
  it("selecciona solo las columnas del DTO", async () => {
    const { client, findMany } = clientDouble();

    await listarSugerenciasDeAutor(client, 12);

    const select = (findMany.mock.calls[0]?.[0] as { select: Record<string, unknown> }).select;

    expect(Object.keys(select).sort()).toEqual([
      "areaDestino",
      "descripcion",
      "estado",
      "fechaCreacion",
      "historial",
      "id",
      "titulo",
    ]);
  });

  it("expone el nombre de quien cambió el estado, no su id ni su correo", async () => {
    const { client, findMany } = clientDouble();

    const [sugerencia] = await listarSugerenciasDeAutor(client, 12);

    const select = (findMany.mock.calls[0]?.[0] as { select: { historial: { select: unknown } } })
      .select;

    expect(sugerencia.historial[0].autor).toBe("Ana Quispe");
    expect(select.historial.select).toMatchObject({ autor: { select: { nombre: true } } });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  NINGÚN `Date` CRUZA HACIA EL NAVEGADOR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Prisma devuelve objetos `Date`. Si el DTO los llevara, la misma lista sería
   * un `Date` al llegar por props del Server Component y un `string` al llegar
   * por SWR — el componente estaría bien en la primera pintura y roto en la
   * primera revalidación, un minuto después y jamás en un test que renderiza una
   * sola vez.
   */
  it("entrega las fechas como texto ISO, no como Date", async () => {
    const { client } = clientDouble();

    const [sugerencia] = await listarSugerenciasDeAutor(client, 12);

    expect(sugerencia.fechaCreacion).toBe("2026-08-21T14:30:00.000Z");
    expect(sugerencia.historial[0].fechaCambio).toBe("2026-08-21T14:30:00.000Z");
    expect(JSON.parse(JSON.stringify(sugerencia))).toEqual(sugerencia);
  });
});

describe("leerAreaDelAutor", () => {
  it("lee una sola columna del propio usuario", async () => {
    const { client, findUnique } = clientDouble();

    const area = await leerAreaDelAutor(client, 12);

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 12 }, select: { area: true } });
    expect(area).toBe("Operaciones");
  });

  /**
   * `usuario.area` vale `""` cuando Entra ID no reporta departamento, y
   * `prisma/schema.prisma` es explícito en que ese es el bucket "sin área" y no
   * un NULL. El formulario lo trata como "sin valor por defecto" y pregunta.
   */
  it("devuelve cadena vacía si Entra ID no reportó departamento", async () => {
    const { client } = clientDouble(FILA, "");

    expect(await leerAreaDelAutor(client, 12)).toBe("");
  });

  /** La cuenta desapareció entre el guard y esta lectura: el formulario abre vacío. */
  it("no revienta si la fila del usuario ya no está", async () => {
    const { client } = clientDouble(FILA, null);

    expect(await leerAreaDelAutor(client, 12)).toBe("");
  });
});
