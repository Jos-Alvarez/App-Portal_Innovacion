// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  TIPOS_ERROR,
  armarAdopcion,
  armarAreas,
  armarErrores,
  armarMetricas,
  armarRecursos,
  armarSugerencias,
  armarUsuarios,
} from "@/lib/analitica/metricas";
import type { Dimensiones } from "@/lib/analitica/repository";
import { TIPOS_EVENTO } from "@/lib/eventos/repository";
import { ESTADOS_SUGERENCIA } from "@/lib/sugerencias/schema";

/**
 * The arithmetic of item #18, with no database and no clock in sight.
 *
 * The cases worth writing down are the awkward ones, because they are the ones a
 * screen shows without anybody noticing: a procesador that only ever failed, an
 * event pointing at a catalogue row that no longer exists, a person with no
 * area, an area whose only member left, and a period in which nothing happened.
 */

const DIMENSIONES: Dimensiones = {
  enlaces: [
    { id: 4, nombre: "Portal de Compras", activo: true },
    { id: 5, nombre: "Agente de Contratos", activo: false },
  ],
  procesadores: [
    { id: 1, nombre: "Maestro de Excel", activo: true },
    { id: 2, nombre: "Consolidador de PDF", activo: true },
  ],
  usuarios: [
    { id: 7, nombre: "Ana Quispe", area: "Peajes", activo: true, conAcceso: true },
    { id: 8, nombre: "Beto Ruiz", area: "Peajes", activo: true, conAcceso: true },
    { id: 9, nombre: "Caro Díaz", area: "", activo: true, conAcceso: true },
    { id: 10, nombre: "Dani Soto", area: "Legal", activo: true, conAcceso: false },
    { id: 11, nombre: "Eva Luna", area: "Legal", activo: false, conAcceso: true },
  ],
};

function evento(
  tipoRecurso: string,
  idRecurso: number,
  tipoEvento: string,
  total: number,
) {
  return { tipoRecurso, idRecurso, tipoEvento: tipoEvento as never, total };
}

function porUsuario(usuarioId: number, tipoEvento: string, total: number) {
  return { usuarioId, tipoEvento: tipoEvento as never, total };
}

describe("TIPOS_ERROR", () => {
  /** Derived from the vocabulary so a sixth typed error cannot be forgotten here. */
  it("son exactamente los eventos error_* del vocabulario", () => {
    expect(TIPOS_ERROR).toEqual(TIPOS_EVENTO.filter((tipo) => tipo.startsWith("error_")));
    expect(TIPOS_ERROR).toHaveLength(5);
  });
});

describe("armarRecursos", () => {
  it("suma aperturas y ejecuciones por recurso", () => {
    const recursos = armarRecursos(
      [
        evento("enlace", 4, "apertura", 12),
        evento("procesador", 1, "ejecucion", 5),
      ],
      DIMENSIONES,
    );

    expect(recursos).toEqual([
      {
        tipo: "enlace",
        id: 4,
        nombre: "Portal de Compras",
        activo: true,
        aperturas: 12,
        ejecuciones: 0,
        errores: 0,
        usos: 12,
      },
      {
        tipo: "procesador",
        id: 1,
        nombre: "Maestro de Excel",
        activo: true,
        aperturas: 0,
        ejecuciones: 5,
        errores: 0,
        usos: 5,
      },
    ]);
  });

  it("ordena por uso, de más a menos", () => {
    const recursos = armarRecursos(
      [evento("procesador", 1, "ejecucion", 3), evento("enlace", 4, "apertura", 30)],
      DIMENSIONES,
    );

    expect(recursos.map((recurso) => recurso.id)).toEqual([4, 1]);
  });

  /**
   * Without the tiebreaker the order comes back however the database felt like
   * returning it, which changes between reloads and makes the screen look like
   * it is shuffling on its own.
   */
  it("desempata por nombre, para que dos recargas den el mismo orden", () => {
    const recursos = armarRecursos(
      [evento("procesador", 2, "ejecucion", 4), evento("procesador", 1, "ejecucion", 4)],
      DIMENSIONES,
    );

    expect(recursos.map((recurso) => recurso.nombre)).toEqual([
      "Consolidador de PDF",
      "Maestro de Excel",
    ]);
  });

  /**
   * The heart of the ranking. Forty rejected files mean the procesador was tried
   * forty times and worked none of them; counting those as use would send it to
   * the top of a list an administrator reads as "esto es lo que la empresa usa".
   */
  it("los errores no cuentan como uso, aunque se informen", () => {
    const [recurso] = armarRecursos(
      [
        evento("procesador", 1, "ejecucion", 2),
        evento("procesador", 1, "error_formato", 40),
      ],
      DIMENSIONES,
    );

    expect(recurso).toMatchObject({ ejecuciones: 2, errores: 40, usos: 2 });
  });

  it("un procesador que solo falló aparece con cero usos", () => {
    const [recurso] = armarRecursos([evento("procesador", 2, "error_tamano", 3)], DIMENSIONES);

    expect(recurso).toMatchObject({ id: 2, usos: 0, errores: 3 });
  });

  /**
   * `evento_uso` has no foreign key to the resource (ADR 0002), so an event can
   * outlive the row it points at. Dropping it would erase usage that happened;
   * inventing a name would report a resource that does not exist.
   */
  it("conserva el uso de un recurso que ya no está en el catálogo, sin nombre", () => {
    const [recurso] = armarRecursos([evento("enlace", 99, "apertura", 6)], DIMENSIONES);

    expect(recurso).toMatchObject({ id: 99, nombre: null, activo: false, usos: 6 });
  });

  it("informa el uso de un recurso dado de baja durante el periodo", () => {
    const [recurso] = armarRecursos([evento("enlace", 5, "apertura", 2)], DIMENSIONES);

    expect(recurso).toMatchObject({ nombre: "Agente de Contratos", activo: false, usos: 2 });
  });

  /** A `tipo_recurso` outside the two-word vocabulary belongs to no catalogue. */
  it("descarta un tipo de recurso que no existe en vez de atribuirlo", () => {
    expect(armarRecursos([evento("sugerencia", 1, "apertura", 5)], DIMENSIONES)).toEqual([]);
  });

  it("un periodo sin eventos es una lista vacía, no una lista de ceros", () => {
    expect(armarRecursos([], DIMENSIONES)).toEqual([]);
  });
});

describe("armarErrores", () => {
  it("desglosa por tipo y siempre informa los cinco", () => {
    const [procesador] = armarErrores(
      [
        evento("procesador", 1, "error_formato", 4),
        evento("procesador", 1, "error_tamano", 1),
      ],
      DIMENSIONES,
    );

    expect(procesador.porTipo).toEqual({
      error_formato: 4,
      error_tamano: 1,
      error_contenido: 0,
      error_cantidad: 0,
      error_clave_inexistente: 0,
    });
    expect(procesador.total).toBe(5);
  });

  /** Un enlace se abre en otra pestaña: nada suyo puede fallar dentro del portal. */
  it("ignora los enlaces", () => {
    expect(armarErrores([evento("enlace", 4, "error_formato", 2)], DIMENSIONES)).toEqual([]);
  });

  it("no incluye a un procesador que solo tuvo ejecuciones buenas", () => {
    expect(armarErrores([evento("procesador", 1, "ejecucion", 9)], DIMENSIONES)).toEqual([]);
  });

  it("ordena por cantidad de errores", () => {
    const errores = armarErrores(
      [
        evento("procesador", 1, "error_formato", 1),
        evento("procesador", 2, "error_contenido", 7),
      ],
      DIMENSIONES,
    );

    expect(errores.map((procesador) => procesador.id)).toEqual([2, 1]);
  });

  /**
   * `error_clave_inexistente` is the one that says the procesador points at a
   * module the registry does not have — the failure item #10's migration exists
   * to make visible.
   */
  it("cuenta la clave inexistente, que es la que delata un procesador roto", () => {
    const [procesador] = armarErrores(
      [evento("procesador", 1, "error_clave_inexistente", 3)],
      DIMENSIONES,
    );

    expect(procesador.porTipo.error_clave_inexistente).toBe(3);
  });
});

describe("armarUsuarios", () => {
  it("suma la actividad de cada persona", () => {
    const usuarios = armarUsuarios(
      [porUsuario(7, "apertura", 4), porUsuario(7, "ejecucion", 2)],
      DIMENSIONES,
    );

    expect(usuarios[0]).toEqual({
      id: 7,
      nombre: "Ana Quispe",
      area: "Peajes",
      activo: true,
      aperturas: 4,
      ejecuciones: 2,
      usos: 6,
    });
  });

  it("ordena por actividad", () => {
    const usuarios = armarUsuarios(
      [porUsuario(7, "apertura", 1), porUsuario(8, "apertura", 9)],
      DIMENSIONES,
    );

    expect(usuarios.map((usuario) => usuario.id)).toEqual([8, 7]);
  });

  /**
   * A failed upload says something about the procesador, not about the person
   * who tried it. A ranking of "who caused the most errors" is a scoreboard
   * nobody asked for.
   */
  it("no cuenta los errores como actividad de la persona", () => {
    expect(armarUsuarios([porUsuario(7, "error_formato", 20)], DIMENSIONES)).toEqual([]);
  });

  it("no inventa a nadie: quien no usó el portal no aparece", () => {
    const usuarios = armarUsuarios([porUsuario(7, "apertura", 1)], DIMENSIONES);

    expect(usuarios).toHaveLength(1);
  });
});

describe("armarAreas", () => {
  it("suma los usos y cuenta personas distintas", () => {
    const usuarios = armarUsuarios(
      [porUsuario(7, "apertura", 4), porUsuario(8, "apertura", 6)],
      DIMENSIONES,
    );

    expect(armarAreas(usuarios)).toEqual([{ area: "Peajes", personas: 2, usos: 10 }]);
  });

  /**
   * An area of one enthusiast with 200 openings and an area of twenty people
   * with 200 openings are the same row without `personas`.
   */
  it("distingue un área muy activa de una persona muy activa", () => {
    const usuarios = armarUsuarios(
      [porUsuario(7, "apertura", 200), porUsuario(9, "apertura", 10)],
      DIMENSIONES,
    );

    const areas = armarAreas(usuarios);

    expect(areas[0]).toEqual({ area: "Peajes", personas: 1, usos: 200 });
    expect(areas[1]).toEqual({ area: "", personas: 1, usos: 10 });
  });

  /** `""` es el bucket "Entra ID no reportó departamento"; #19 le pone nombre. */
  it("conserva el área vacía como su propio grupo", () => {
    const usuarios = armarUsuarios([porUsuario(9, "apertura", 3)], DIMENSIONES);

    expect(armarAreas(usuarios)).toEqual([{ area: "", personas: 1, usos: 3 }]);
  });
});

describe("armarAdopcion", () => {
  it("cuenta a quienes tienen acceso y a cuántos de ellos lo usaron", () => {
    const usuarios = armarUsuarios([porUsuario(7, "apertura", 1)], DIMENSIONES);

    /* Con acceso y activos: 7, 8 y 9. La 11 tiene acceso pero está de baja; la 10
       está activa pero sin ningún acceso asignado. */
    expect(armarAdopcion(usuarios, DIMENSIONES)).toEqual({ conAcceso: 3, activos: 1 });
  });

  /**
   * A deactivated account cannot use the portal, so counting it in the
   * denominator would report a permanent gap no administrator could ever close.
   */
  it("deja fuera del denominador a las cuentas dadas de baja", () => {
    expect(armarAdopcion([], DIMENSIONES).conAcceso).toBe(3);
  });

  /** Sin acceso asignado no hay nada que adoptar. */
  it("deja fuera a quien no tiene ningún acceso", () => {
    const soloSinAcceso: Dimensiones = {
      ...DIMENSIONES,
      usuarios: [{ id: 10, nombre: "Dani", area: "Legal", activo: true, conAcceso: false }],
    };

    expect(armarAdopcion([], soloSinAcceso)).toEqual({ conAcceso: 0, activos: 0 });
  });

  /**
   * Somebody who used the portal without holding a grant today — an
   * administrator, or somebody whose access was revoked mid-period — must not
   * push the numerator past the denominator.
   */
  it("no cuenta como adoptante a quien usó el portal pero hoy no tiene acceso", () => {
    const usuarios = armarUsuarios([porUsuario(10, "apertura", 5)], DIMENSIONES);

    expect(armarAdopcion(usuarios, DIMENSIONES)).toEqual({ conAcceso: 3, activos: 0 });
  });

  it("informa ceros en vez de omitir la métrica cuando nadie usó nada", () => {
    expect(armarAdopcion([], DIMENSIONES)).toEqual({ conAcceso: 3, activos: 0 });
  });
});

describe("armarSugerencias", () => {
  it("informa siempre los cinco estados, con sus ceros", () => {
    const metrica = armarSugerencias([{ autorId: 7, estado: "pendiente", total: 2 }], DIMENSIONES);

    expect(Object.keys(metrica.porEstado).sort()).toEqual([...ESTADOS_SUGERENCIA].sort());
    expect(metrica.porEstado.pendiente).toBe(2);
    expect(metrica.porEstado.rechazada).toBe(0);
    expect(metrica.total).toBe(2);
  });

  /** "Por área de origen" (PRD): la del autor, no la de destino. */
  it("agrupa por el área de quien escribió", () => {
    const metrica = armarSugerencias(
      [
        { autorId: 7, estado: "pendiente", total: 2 },
        { autorId: 8, estado: "aprobada", total: 1 },
        { autorId: 9, estado: "pendiente", total: 4 },
      ],
      DIMENSIONES,
    );

    /* Ordenadas por cantidad: el área sin nombre mandó cuatro y Peajes tres. */
    expect(metrica.porArea).toEqual([
      { area: "", total: 4 },
      { area: "Peajes", total: 3 },
    ]);
  });

  it("suma varios estados del mismo autor en una sola área", () => {
    const metrica = armarSugerencias(
      [
        { autorId: 7, estado: "pendiente", total: 1 },
        { autorId: 7, estado: "implementada", total: 2 },
      ],
      DIMENSIONES,
    );

    expect(metrica.porArea).toEqual([{ area: "Peajes", total: 3 }]);
    expect(metrica.total).toBe(3);
  });

  it("un periodo sin sugerencias informa cinco ceros y ninguna área", () => {
    const metrica = armarSugerencias([], DIMENSIONES);

    expect(metrica.total).toBe(0);
    expect(metrica.porArea).toEqual([]);
    expect(metrica.porEstado.pendiente).toBe(0);
  });
});

describe("armarMetricas", () => {
  it("arma las seis secciones desde los tres conteos", () => {
    const metricas = armarMetricas(
      {
        porRecurso: [
          evento("enlace", 4, "apertura", 3),
          evento("procesador", 1, "error_formato", 1),
        ],
        porUsuario: [porUsuario(7, "apertura", 3)],
        sugerencias: [{ autorId: 8, estado: "pendiente", total: 1 }],
      },
      DIMENSIONES,
    );

    expect(metricas.recursos).toHaveLength(2);
    expect(metricas.usuarios).toHaveLength(1);
    expect(metricas.areas).toEqual([{ area: "Peajes", personas: 1, usos: 3 }]);
    expect(metricas.adopcion).toEqual({ conAcceso: 3, activos: 1 });
    expect(metricas.errores).toHaveLength(1);
    expect(metricas.sugerencias.total).toBe(1);
  });

  /**
   * The empty period is the one an administrator sees on a Monday morning, and
   * it has to be legible: empty lists where nothing happened, explicit zeros
   * where a zero is the finding.
   */
  it("un periodo vacío es legible: listas vacías y ceros explícitos", () => {
    const metricas = armarMetricas(
      { porRecurso: [], porUsuario: [], sugerencias: [] },
      DIMENSIONES,
    );

    expect(metricas.recursos).toEqual([]);
    expect(metricas.usuarios).toEqual([]);
    expect(metricas.areas).toEqual([]);
    expect(metricas.errores).toEqual([]);
    expect(metricas.adopcion).toEqual({ conAcceso: 3, activos: 0 });
    expect(metricas.sugerencias.total).toBe(0);
  });
});
