// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { AgrupacionRechazada, TransicionRechazada } from "./errors";
import type { GruposClient, SugerenciasAdminClient, SugerenciasClient } from "./repository";
import {
  cambiarEstadoSugerencia,
  crearGrupoSugerencias,
  crearSugerencia,
  leerAreaDelAutor,
  listarSugerencias,
  listarSugerenciasDeAutor,
  quitarSugerenciaDeGrupo,
} from "./repository";
import { ESTADOS_SUGERENCIA } from "./schema";

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

/* ══════════════════════════════════════════════════════════════════════════
 *  ÍTEM #15 — LA GESTIÓN
 * ══════════════════════════════════════════════════════════════════════════ */

const REVISADA = new Date("2026-08-22T09:15:00.000Z");

/** La misma fila de arriba, con el autor que sólo el panel del admin lee. */
const FILA_ADMIN = {
  ...FILA,
  autor: { nombre: "Ana Quispe", area: "Operaciones" },
  grupo: null,
};

/**
 * El doble del cliente administrativo.
 *
 * `$transaction` ejecuta el callback en el acto y deja pasar lo que tire: eso es
 * exactamente lo que hace la transacción interactiva real, y es lo que permite
 * comprobar que un rechazo se propaga en vez de convertirse en una escritura a
 * medias.
 */
function adminDouble({
  estadoActual = "pendiente" as string | null,
  count = 1,
  fila = FILA_ADMIN as unknown,
}: {
  estadoActual?: string | null;
  count?: number;
  fila?: unknown;
} = {}) {
  const findMany = vi.fn(async (_args?: unknown) => [FILA_ADMIN]);

  /* Primera llamada: el estado actual. Segunda: la fila completa de vuelta. */
  const findUnique = vi
    .fn()
    .mockImplementationOnce(async (_args: unknown) =>
      estadoActual === null ? null : { estado: estadoActual },
    )
    .mockImplementation(async (_args: unknown) => fila);

  const updateMany = vi.fn(async (_args: unknown) => ({ count }));
  const crearAsiento = vi.fn(async (_args: unknown) => ({ id: 91 }));
  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      sugerencia: { findUnique, updateMany, findMany },
      historialSugerencia: { create: crearAsiento },
    }),
  );

  const client = {
    sugerencia: { findMany, findUnique, updateMany },
    historialSugerencia: { create: crearAsiento },
    $transaction: transaction,
  } as unknown as SugerenciasAdminClient;

  return { client, findMany, findUnique, updateMany, crearAsiento, transaction };
}

describe("listarSugerencias", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  LA LECTURA SEPARADA QUE PIDIÓ EL ÍTEM #13
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `listarSugerenciasDeAutor` dejó escrito que el ítem #15 tenía que agregar
   * una lectura PROPIA y con guard de admin, en vez de volver condicional su
   * filtro. Esta prueba fija esa forma: no hay `where`, y no hay parámetro por
   * el que colarle un autor.
   */
  it("no lleva `where`: la autorización está en el guard de la ruta, no acá", async () => {
    const { client, findMany } = adminDouble();

    await listarSugerencias(client);

    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty("where");
  });

  it("devuelve las más nuevas primero, con el id como desempate estable", async () => {
    const { client, findMany } = adminDouble();

    await listarSugerencias(client);

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ fechaCreacion: "desc" }, { id: "desc" }],
    });
  });

  /** El área del autor es por lo que tría el Área de Innovación. */
  it("trae el nombre y el área del autor", async () => {
    const { client } = adminDouble();

    const [sugerencia] = await listarSugerencias(client);

    expect(sugerencia.autor).toEqual({ nombre: "Ana Quispe", area: "Operaciones" });
  });

  /**
   * El correo corporativo no se selecciona: el aviso del ítem #14 ya se lo lleva
   * al Área de Innovación, y una pantalla de gestión que liste la dirección de
   * cada colaborador es una copia del directorio que nadie acá necesita.
   */
  it("no selecciona el correo del autor", async () => {
    const { client, findMany } = adminDouble();

    await listarSugerencias(client);

    const select = (findMany.mock.calls[0]?.[0] as { select: Record<string, unknown> }).select;
    const autor = select.autor as { select: Record<string, unknown> };

    expect(autor.select).toEqual({ nombre: true, area: true });
    expect(select).not.toHaveProperty("autorId");
    expect(select).not.toHaveProperty("grupoId");
  });

  /** Lo mismo que promete `SugerenciaDTO`: ningún `Date` cruza hacia el navegador. */
  it("no deja escapar ningún Date", async () => {
    const { client } = adminDouble();

    const [sugerencia] = await listarSugerencias(client);

    expect(typeof sugerencia.fechaCreacion).toBe("string");
    expect(sugerencia.fechaCreacion).toBe(CREADA.toISOString());
    expect(typeof sugerencia.historial[0]?.fechaCambio).toBe("string");
  });

  it("trae el historial completo, del más viejo al más nuevo", async () => {
    const { client, findMany } = adminDouble();

    await listarSugerencias(client);

    const select = (findMany.mock.calls[0]?.[0] as { select: { historial: unknown } }).select;

    expect(select.historial).toMatchObject({ orderBy: { id: "asc" } });
  });
});

describe("cambiarEstadoSugerencia", () => {
  it("escribe la fila y el asiento dentro de una sola transacción", async () => {
    const { client, transaction, updateMany, crearAsiento } = adminDouble();

    await cambiarEstadoSugerencia(client, 31, "en_revision", 3);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(crearAsiento).toHaveBeenCalledTimes(1);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  EL UPDATE VA CONDICIONADO AL ESTADO QUE SE LEYÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Eso es lo que hace que `estado_anterior` sea VERDADERO y no apenas
   * verosímil. Sin la condición, dos administradores que leen `pendiente` a la
   * vez escriben los dos su asiento diciendo que la fila estaba en `pendiente`
   * cuando la cambiaron.
   */
  it("condiciona el update al estado leído, no sólo al id", async () => {
    const { client, updateMany } = adminDouble({ estadoActual: "pendiente" });

    await cambiarEstadoSugerencia(client, 31, "aprobada", 3);

    expect(updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: 31, estado: "pendiente" },
      data: { estado: "aprobada" },
    });
  });

  it("firma el asiento con los dos extremos de la transición y con quien la hizo", async () => {
    const { client, crearAsiento } = adminDouble({ estadoActual: "en_revision" });

    await cambiarEstadoSugerencia(client, 31, "implementada", 3);

    expect(crearAsiento.mock.calls[0]?.[0]).toEqual({
      data: {
        sugerenciaId: 31,
        estadoAnterior: "en_revision",
        estadoNuevo: "implementada",
        cambiadoPor: 3,
      },
    });
  });

  /** La fecha del asiento la elige la base (`@default(now())`), nunca TypeScript. */
  it("no inventa una fecha de cambio", async () => {
    const { client, crearAsiento } = adminDouble();

    await cambiarEstadoSugerencia(client, 31, "aprobada", 3);

    expect(crearAsiento.mock.calls[0]?.[0]).not.toMatchObject({
      data: { fechaCambio: expect.anything() },
    });
  });

  it("responde la fila releída con su historial y su autor", async () => {
    const { client } = adminDouble({
      fila: {
        ...FILA_ADMIN,
        estado: "aprobada",
        historial: [
          ...FILA_ADMIN.historial,
          {
            id: 91,
            estadoAnterior: "pendiente",
            estadoNuevo: "aprobada",
            fechaCambio: REVISADA,
            autor: { nombre: "Rosa Díaz" },
          },
        ],
      },
    });

    const sugerencia = await cambiarEstadoSugerencia(client, 31, "aprobada", 3);

    expect(sugerencia.estado).toBe("aprobada");
    expect(sugerencia.autor).toEqual({ nombre: "Ana Quispe", area: "Operaciones" });
    expect(sugerencia.historial).toHaveLength(2);
    expect(sugerencia.historial[1]).toEqual({
      id: 91,
      estadoAnterior: "pendiente",
      estadoNuevo: "aprobada",
      fechaCambio: REVISADA.toISOString(),
      autor: "Rosa Díaz",
    });
  });

  it("relee la fila DENTRO de la transacción, después de escribir el asiento", async () => {
    const { client, findUnique, crearAsiento } = adminDouble();

    await cambiarEstadoSugerencia(client, 31, "aprobada", 3);

    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(crearAsiento.mock.invocationCallOrder[0]).toBeLessThan(
      findUnique.mock.invocationCallOrder[1],
    );
  });

  /* ── Los tres rechazos ─────────────────────────────────────────────────── */

  it("rechaza con «no_encontrada» si la fila ya no está, sin escribir nada", async () => {
    const { client, updateMany, crearAsiento } = adminDouble({ estadoActual: null });

    await expect(cambiarEstadoSugerencia(client, 31, "aprobada", 3)).rejects.toMatchObject({
      motivo: "no_encontrada",
    });

    expect(updateMany).not.toHaveBeenCalled();
    expect(crearAsiento).not.toHaveBeenCalled();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  UNA TRANSICIÓN AL MISMO ESTADO NO ES UNA TRANSICIÓN
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Es un doble clic, o dos administradores de acuerdo. Escribirla metería
   * no-eventos en un libro cuyo valor entero es que cada fila sea un cambio que
   * alguien hizo — y la traza que lee el autor en su pantalla se llenaría de
   * líneas que dicen que no pasó nada, dos veces.
   */
  it("rechaza con «sin_cambio» el doble clic, y no toca la fila", async () => {
    const { client, updateMany, crearAsiento } = adminDouble({ estadoActual: "aprobada" });

    await expect(cambiarEstadoSugerencia(client, 31, "aprobada", 3)).rejects.toMatchObject({
      motivo: "sin_cambio",
    });

    expect(updateMany).not.toHaveBeenCalled();
    expect(crearAsiento).not.toHaveBeenCalled();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  LA CARRERA ENTRE DOS REVISORES
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `count: 0` es lo que devuelve el `updateMany` condicionado cuando alguien
   * movió la fila entre la lectura y la escritura. Tirar es lo que revierte: si
   * en vez de eso siguiera adelante, quedaría un asiento describiendo una
   * transición que nunca ocurrió.
   */
  it("rechaza con «conflicto» si otro revisor movió la fila primero, y no escribe el asiento", async () => {
    const { client, crearAsiento } = adminDouble({ count: 0 });

    await expect(cambiarEstadoSugerencia(client, 31, "rechazada", 3)).rejects.toMatchObject({
      motivo: "conflicto",
    });

    expect(crearAsiento).not.toHaveBeenCalled();
  });

  it("es un TransicionRechazada, que es lo que hace revertir a `$transaction`", async () => {
    const { client } = adminDouble({ count: 0 });

    await expect(cambiarEstadoSugerencia(client, 31, "rechazada", 3)).rejects.toBeInstanceOf(
      TransicionRechazada,
    );
  });

  /* ── El embudo ────────────────────────────────────────────────────────── */

  /**
   * EL ORDEN DEL EMBUDO NO SE POLICÍA, Y ES DELIBERADO.
   *
   * TECH-DESIGN.md describe el camino normal; ningún documento pide que los
   * demás movimientos sean imposibles. Prohibirlos dejaría a quien se equivocó
   * de botón sin corrección dentro del portal — es decir, fuera del libro y
   * fuera de la rendición de cuentas que pide el PRD. Lo que sí se garantiza es
   * que nada se pierde: cada movimiento queda asentado con su autor y su fecha.
   */
  it("deja volver atrás desde «implementada», y lo asienta", async () => {
    const { client, crearAsiento } = adminDouble({ estadoActual: "implementada" });

    await cambiarEstadoSugerencia(client, 31, "en_revision", 3);

    expect(crearAsiento.mock.calls[0]?.[0]).toMatchObject({
      data: { estadoAnterior: "implementada", estadoNuevo: "en_revision" },
    });
  });

  it("deja saltarse «en_revision», que es el camino normal apurado", async () => {
    const { client, updateMany } = adminDouble({ estadoActual: "pendiente" });

    await cambiarEstadoSugerencia(client, 31, "implementada", 3);

    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  /** El vocabulario sí es cerrado, y lo cierran el schema y el CHECK de la base. */
  it("nunca escribe un estado que no venga del vocabulario", async () => {
    const { client, updateMany } = adminDouble();

    await cambiarEstadoSugerencia(client, 31, "rechazada", 3);

    const { data } = updateMany.mock.calls[0]?.[0] as { data: { estado: string } };

    expect(ESTADOS_SUGERENCIA).toContain(data.estado);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 *  ÍTEM #16 — LA AGRUPACIÓN
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * El doble del cliente de agrupación.
 *
 * `miembrosPorGrupo` is what makes the dissolution testable without a database:
 * it is what `count` answers per group AFTER the write, which is the only moment
 * `disolverGruposSinMinimo` asks.
 */
function gruposDouble({
  seleccionadas = [{ id: 7, grupoId: null }, { id: 12, grupoId: null }] as {
    id: number;
    grupoId: number | null;
  }[],
  miembrosPorGrupo = {} as Record<number, number>,
  actual = { grupoId: 5 } as { grupoId: number | null } | null,
} = {}) {
  const findMany = vi.fn(async (args?: { where?: unknown }) =>
    /* The `where` tells the two reads apart: the selection has one, the final
       list read does not. */
    args?.where === undefined ? [FILA_ADMIN] : seleccionadas,
  );
  const findUnique = vi.fn(async (_args: unknown) => actual);
  const count = vi.fn(async (args: { where: { grupoId: number } }) =>
    miembrosPorGrupo[args.where.grupoId] ?? 0,
  );
  const updateMany = vi.fn(async (_args: unknown) => ({ count: seleccionadas.length }));
  const update = vi.fn(async (_args: unknown) => ({ id: 7 }));

  const crearGrupo = vi.fn(async (_args: unknown) => ({ id: 42 }));
  const borrarGrupo = vi.fn(async (_args: unknown) => ({ id: 0 }));

  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      sugerencia: { findMany, findUnique, count, updateMany, update },
      grupoSugerencia: { create: crearGrupo, delete: borrarGrupo },
    }),
  );

  const client = {
    sugerencia: { findMany, findUnique, count, updateMany, update },
    grupoSugerencia: { create: crearGrupo, delete: borrarGrupo },
    $transaction: transaction,
  } as unknown as GruposClient;

  return { client, findMany, findUnique, count, updateMany, update, crearGrupo, borrarGrupo, transaction };
}

/** Los ids de grupo que se pidió borrar. */
function gruposBorrados(borrarGrupo: ReturnType<typeof vi.fn>): number[] {
  return borrarGrupo.mock.calls.map((call) => (call[0] as { where: { id: number } }).where.id);
}

describe("crearGrupoSugerencias", () => {
  it("crea el grupo con el título y con quien lo creó", async () => {
    const { client, crearGrupo } = gruposDouble();

    await crearGrupoSugerencias(client, "Tableros de peajes", [7, 12], 3);

    expect(crearGrupo.mock.calls[0]?.[0]).toEqual({
      data: { titulo: "Tableros de peajes", creadoPor: 3 },
    });
  });

  it("mueve todas las elegidas al grupo nuevo, en una sola escritura", async () => {
    const { client, updateMany } = gruposDouble();

    await crearGrupoSugerencias(client, "Peajes", [7, 12], 3);

    expect(updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: { in: [7, 12] } },
      data: { grupoId: 42 },
    });
  });

  it("hace todo dentro de una sola transacción", async () => {
    const { client, transaction } = gruposDouble();

    await crearGrupoSugerencias(client, "Peajes", [7, 12], 3);

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  AGRUPAR NO TOCA EL ESTADO NI ESCRIBE UN ASIENTO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * TECH-DESIGN.md pide que las agrupadas "conserven su estado y autor
   * individuales", y el ADR 0002 define el libro como un asiento por cada
   * TRANSICIÓN de estado. Archivar una idea en un balde no es una, y el autor
   * leyendo su propia traza vería una línea sobre un evento que nunca le pasó a
   * su idea.
   *
   * La forma en que esto se hace cumplir es el TIPO: `GruposClient` no tiene
   * `historialSugerencia`, así que este módulo no puede escribir un asiento
   * aunque quisiera.
   */
  it("no escribe ningún estado", async () => {
    const { client, updateMany, update } = gruposDouble();

    await crearGrupoSugerencias(client, "Peajes", [7, 12], 3);

    for (const llamada of [...updateMany.mock.calls, ...update.mock.calls]) {
      expect((llamada[0] as { data: object }).data).not.toHaveProperty("estado");
    }
  });

  it("no recibe siquiera el delegate del historial", () => {
    const { client } = gruposDouble();

    expect(client).not.toHaveProperty("historialSugerencia");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  EL CHEQUEO DE CANTIDAD ES EL QUE IMPORTA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `findMany` con `id: { in: ids }` devuelve menos filas en silencio cuando uno
   * de los ids ya no está: es un filtro, no una búsqueda. Sin comparar las
   * cantidades, una selección de dos donde una acababa de borrarse crearía un
   * grupo de un solo miembro — justo el estado que la disolución existe para
   * evitar, alcanzado por la puerta de adelante.
   */
  it("rechaza si alguna de las elegidas ya no existe, sin crear el grupo", async () => {
    const { client, crearGrupo, updateMany } = gruposDouble({
      seleccionadas: [{ id: 7, grupoId: null }],
    });

    await expect(crearGrupoSugerencias(client, "Peajes", [7, 12], 3)).rejects.toMatchObject({
      motivo: "sugerencias_no_encontradas",
    });

    expect(crearGrupo).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("es un AgrupacionRechazada, que es lo que revierte la transacción", async () => {
    const { client } = gruposDouble({ seleccionadas: [] });

    await expect(crearGrupoSugerencias(client, "Peajes", [7, 12], 3)).rejects.toBeInstanceOf(
      AgrupacionRechazada,
    );
  });

  /* ── La disolución ────────────────────────────────────────────────────── */

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  UN GRUPO QUE BAJA DEL MÍNIMO SE DISUELVE EN LA MISMA TRANSACCIÓN
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El schema mantiene la invariante al CREAR. Acá es donde sobrevive después:
   * sacar una sugerencia de un par deja al sobreviviente solo en un balde con
   * título, que es una sugerencia con etiqueta dibujada como un grupo.
   *
   * Borrar la FILA es lo que libera al sobreviviente: `sugerencia_grupo_id_fkey`
   * es `ON DELETE SET NULL`, así que no hay un segundo UPDATE ni una ventana en
   * la que una sugerencia apunte a un grupo que ya no está.
   */
  it("disuelve el grupo anterior que quedó con un solo miembro", async () => {
    const { client, borrarGrupo } = gruposDouble({
      seleccionadas: [{ id: 7, grupoId: 5 }, { id: 12, grupoId: null }],
      miembrosPorGrupo: { 5: 1 },
    });

    await crearGrupoSugerencias(client, "Peajes", [7, 12], 3);

    expect(gruposBorrados(borrarGrupo)).toEqual([5]);
  });

  /** Cero es la otra forma: los dos miembros de un par se van juntos al grupo nuevo. */
  it("disuelve también el grupo que quedó sin ningún miembro", async () => {
    const { client, borrarGrupo } = gruposDouble({
      seleccionadas: [{ id: 7, grupoId: 5 }, { id: 12, grupoId: 5 }],
      miembrosPorGrupo: { 5: 0 },
    });

    await crearGrupoSugerencias(client, "Peajes", [7, 12], 3);

    expect(gruposBorrados(borrarGrupo)).toEqual([5]);
  });

  it("no toca el grupo anterior que conservó el mínimo", async () => {
    const { client, borrarGrupo } = gruposDouble({
      seleccionadas: [{ id: 7, grupoId: 5 }, { id: 12, grupoId: null }],
      miembrosPorGrupo: { 5: 2 },
    });

    await crearGrupoSugerencias(client, "Peajes", [7, 12], 3);

    expect(borrarGrupo).not.toHaveBeenCalled();
  });

  it("revisa cada grupo anterior una sola vez, aunque vinieran varias del mismo", async () => {
    const { client, count } = gruposDouble({
      seleccionadas: [
        { id: 7, grupoId: 5 },
        { id: 12, grupoId: 5 },
        { id: 20, grupoId: 9 },
      ],
      miembrosPorGrupo: { 5: 3, 9: 3 },
    });

    await crearGrupoSugerencias(client, "Peajes", [7, 12, 20], 3);

    expect(count).toHaveBeenCalledTimes(2);
  });

  it("no revisa nada cuando ninguna venía de un grupo", async () => {
    const { client, count, borrarGrupo } = gruposDouble();

    await crearGrupoSugerencias(client, "Peajes", [7, 12], 3);

    expect(count).not.toHaveBeenCalled();
    expect(borrarGrupo).not.toHaveBeenCalled();
  });

  /* ── La respuesta ─────────────────────────────────────────────────────── */

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  CONTESTA CON LA LISTA ENTERA, Y NO ES PEREZA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `cambiarEstadoSugerencia` contesta con la fila que cambió, porque un cambio
   * de estado afecta exactamente la fila que nombró quien llamó. Una escritura de
   * agrupación no: mover una sugerencia fuera de su grupo puede dejar ese grupo
   * bajo el mínimo, lo que lo borra, lo que anula el `grupo_id` de una sugerencia
   * QUE NADIE NOMBRÓ — una fila que quien llamó no tiene forma de saber que tiene
   * que preguntar.
   */
  it("devuelve la lista completa releída al final de la transacción", async () => {
    const { client, findMany } = gruposDouble();

    const lista = await crearGrupoSugerencias(client, "Peajes", [7, 12], 3);

    expect(lista).toHaveLength(1);
    expect(lista[0]?.id).toBe(31);
    /* Dos lecturas: la selección (con `where`) y la lista final (sin él). */
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[1]?.[0]).not.toHaveProperty("where");
  });

  it("trae el grupo de cada sugerencia en el DTO", async () => {
    const { client, findMany } = gruposDouble();

    await crearGrupoSugerencias(client, "Peajes", [7, 12], 3);

    const select = (findMany.mock.calls[1]?.[0] as { select: Record<string, unknown> }).select;

    expect(select.grupo).toEqual({ select: { id: true, titulo: true } });
  });
});

describe("quitarSugerenciaDeGrupo", () => {
  it("deja la sugerencia sin grupo", async () => {
    const { client, update } = gruposDouble({ miembrosPorGrupo: { 5: 2 } });

    await quitarSugerenciaDeGrupo(client, 7);

    expect(update.mock.calls[0]?.[0]).toEqual({ where: { id: 7 }, data: { grupoId: null } });
  });

  /** La sugerencia sobrevive entera: sus palabras, su autor, su estado y su traza. */
  it("no toca nada más que la pertenencia", async () => {
    const { client, update } = gruposDouble({ miembrosPorGrupo: { 5: 2 } });

    await quitarSugerenciaDeGrupo(client, 7);

    expect((update.mock.calls[0]?.[0] as { data: object }).data).toEqual({ grupoId: null });
  });

  it("disuelve el grupo si quedó bajo el mínimo", async () => {
    const { client, borrarGrupo } = gruposDouble({ miembrosPorGrupo: { 5: 1 } });

    await quitarSugerenciaDeGrupo(client, 7);

    expect(gruposBorrados(borrarGrupo)).toEqual([5]);
  });

  it("deja el grupo en pie si todavía tiene el mínimo", async () => {
    const { client, borrarGrupo } = gruposDouble({ miembrosPorGrupo: { 5: 2 } });

    await quitarSugerenciaDeGrupo(client, 7);

    expect(borrarGrupo).not.toHaveBeenCalled();
  });

  it("rechaza con «sugerencia_no_encontrada» si la fila ya no está", async () => {
    const { client, update } = gruposDouble({ actual: null });

    await expect(quitarSugerenciaDeGrupo(client, 7)).rejects.toMatchObject({
      motivo: "sugerencia_no_encontrada",
    });

    expect(update).not.toHaveBeenCalled();
  });

  /**
   * Ya estaba suelta. Un 409 y no un éxito silencioso, por la misma razón que se
   * rechaza la transición al mismo estado: quien llama está actuando sobre una
   * pantalla que discrepa con la base, y contestar "listo" confirmaría una
   * suposición en vez de corregirla.
   */
  it("rechaza con «sin_grupo» si la sugerencia ya estaba suelta", async () => {
    const { client, update, borrarGrupo } = gruposDouble({ actual: { grupoId: null } });

    await expect(quitarSugerenciaDeGrupo(client, 7)).rejects.toMatchObject({ motivo: "sin_grupo" });

    expect(update).not.toHaveBeenCalled();
    expect(borrarGrupo).not.toHaveBeenCalled();
  });

  it("devuelve la lista completa, porque disolver libera una fila que nadie nombró", async () => {
    const { client, findMany } = gruposDouble({ miembrosPorGrupo: { 5: 1 } });

    const lista = await quitarSugerenciaDeGrupo(client, 7);

    expect(lista[0]?.id).toBe(31);
    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty("where");
  });

  it("hace todo dentro de una sola transacción", async () => {
    const { client, transaction } = gruposDouble({ miembrosPorGrupo: { 5: 2 } });

    await quitarSugerenciaDeGrupo(client, 7);

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
