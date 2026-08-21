// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { SugerenciaAdminDTO } from "@/lib/sugerencias/repository";

import { armarBloques, resumenDeGrupo } from "./agrupacion";

/**
 * Cómo una lista plana se convierte en los bloques que dibuja la pantalla.
 *
 * Esta es la única parte de la agrupación que es una DECISIÓN y no un renderizado,
 * así que se prueba sin montar nada. Lo que protege es el orden — que un grupo no
 * se escape del "más nuevas primero" — y la honestidad del filtro.
 */

const GRUPO_PEAJES = { id: 5, titulo: "Tableros de peajes" };
const GRUPO_ACTAS = { id: 9, titulo: "Firmas digitales" };

function sugerencia(
  id: number,
  estado: SugerenciaAdminDTO["estado"],
  grupo: SugerenciaAdminDTO["grupo"] = null,
): SugerenciaAdminDTO {
  return {
    id,
    titulo: `Sugerencia ${id}`,
    descripcion: "…",
    areaDestino: "Operaciones",
    estado,
    fechaCreacion: "2026-08-21T14:30:00.000Z",
    autor: { nombre: "Ana Quispe", area: "Peajes" },
    grupo,
    historial: [],
  };
}

/** Los ids que quedan dibujados, en el orden en que se dibujan. */
function ordenDibujado(bloques: ReturnType<typeof armarBloques>): number[] {
  return bloques.flatMap((bloque) =>
    bloque.tipo === "suelta" ? [bloque.sugerencia.id] : bloque.miembros.map((fila) => fila.id),
  );
}

describe("armarBloques", () => {
  it("deja sueltas las sugerencias sin grupo", () => {
    const lista = [sugerencia(1, "pendiente"), sugerencia(2, "aprobada")];

    const bloques = armarBloques(lista, lista);

    expect(bloques).toHaveLength(2);
    expect(bloques.every((bloque) => bloque.tipo === "suelta")).toBe(true);
  });

  it("junta en un bloque a los miembros del mismo grupo", () => {
    const lista = [
      sugerencia(1, "pendiente", GRUPO_PEAJES),
      sugerencia(2, "aprobada", GRUPO_PEAJES),
    ];

    const bloques = armarBloques(lista, lista);

    expect(bloques).toHaveLength(1);
    expect(bloques[0]).toMatchObject({ tipo: "grupo", grupo: GRUPO_PEAJES, total: 2 });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  EL GRUPO SE DIBUJA DONDE HABRÍA IDO SU MIEMBRO MÁS NUEVO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * La lista viene ordenada más nuevas primero y eso es una promesa de la
   * pantalla. Ordenar los grupos aparte — todos arriba, o por id de grupo — la
   * rompería en silencio: un balde creado hoy con una idea de marzo saltaría al
   * tope de una lista que dice ser cronológica.
   */
  it("emite el grupo en la posición del primer miembro que aparece", () => {
    const lista = [
      sugerencia(1, "pendiente"),
      sugerencia(2, "pendiente", GRUPO_PEAJES),
      sugerencia(3, "pendiente"),
      sugerencia(4, "pendiente", GRUPO_PEAJES),
    ];

    const bloques = armarBloques(lista, lista);

    /* El grupo sale en el lugar de la #2, y la #4 se pliega dentro. */
    expect(ordenDibujado(bloques)).toEqual([1, 2, 4, 3]);
  });

  it("no reordena nada por su cuenta: respeta el orden que recibió", () => {
    const lista = [
      sugerencia(10, "pendiente", GRUPO_ACTAS),
      sugerencia(9, "pendiente"),
      sugerencia(8, "pendiente", GRUPO_ACTAS),
    ];

    expect(ordenDibujado(armarBloques(lista, lista))).toEqual([10, 8, 9]);
  });

  it("no repite un grupo por cada miembro", () => {
    const lista = [
      sugerencia(1, "pendiente", GRUPO_PEAJES),
      sugerencia(2, "pendiente", GRUPO_PEAJES),
      sugerencia(3, "pendiente", GRUPO_PEAJES),
    ];

    expect(armarBloques(lista, lista)).toHaveLength(1);
  });

  it("mantiene separados dos grupos distintos", () => {
    const lista = [
      sugerencia(1, "pendiente", GRUPO_PEAJES),
      sugerencia(2, "pendiente", GRUPO_ACTAS),
      sugerencia(3, "pendiente", GRUPO_PEAJES),
    ];

    const bloques = armarBloques(lista, lista);

    expect(bloques).toHaveLength(2);
    expect(ordenDibujado(bloques)).toEqual([1, 3, 2]);
  });

  it("devuelve una lista vacía cuando no hay nada visible", () => {
    expect(armarBloques([], [sugerencia(1, "pendiente")])).toEqual([]);
  });

  /* ── El filtro ────────────────────────────────────────────────────────── */

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  EL FILTRO FILTRA SUGERENCIAS, NO GRUPOS — Y `total` ES EL PORQUÉ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Dos miembros de un grupo pueden estar en dos estados distintos: es el punto
   * entero del ítem #16. Mostrar el grupo ENTERO porque un miembro matchea
   * pondría una tarjeta `pendiente` bajo un filtro "Aprobada" — el filtro estaría
   * mintiendo. Mostrar sólo los que matchean sin decir nada más dejaría un bloque
   * que parece un grupo de uno.
   */
  it("muestra sólo los miembros que pasaron el filtro", () => {
    const todas = [
      sugerencia(1, "pendiente", GRUPO_PEAJES),
      sugerencia(2, "aprobada", GRUPO_PEAJES),
    ];
    const visibles = todas.filter((fila) => fila.estado === "aprobada");

    const bloques = armarBloques(visibles, todas);

    expect(ordenDibujado(bloques)).toEqual([2]);
  });

  it("cuenta `total` sobre la lista completa, no sobre la filtrada", () => {
    const todas = [
      sugerencia(1, "pendiente", GRUPO_PEAJES),
      sugerencia(2, "aprobada", GRUPO_PEAJES),
      sugerencia(3, "aprobada", GRUPO_PEAJES),
    ];
    const visibles = todas.filter((fila) => fila.estado === "aprobada");

    const [bloque] = armarBloques(visibles, todas);

    expect(bloque).toMatchObject({ tipo: "grupo", total: 3 });
    expect(bloque.tipo === "grupo" && bloque.miembros).toHaveLength(2);
  });

  it("no dibuja un grupo del que no quedó ningún miembro visible", () => {
    const todas = [
      sugerencia(1, "pendiente", GRUPO_PEAJES),
      sugerencia(2, "pendiente", GRUPO_PEAJES),
      sugerencia(3, "aprobada"),
    ];
    const visibles = todas.filter((fila) => fila.estado === "aprobada");

    const bloques = armarBloques(visibles, todas);

    expect(bloques).toHaveLength(1);
    expect(bloques[0]?.tipo).toBe("suelta");
  });
});

describe("resumenDeGrupo", () => {
  /** "5 de 5" es una frase que hace buscar la que falta. */
  it("no menciona el filtro cuando no hay nada oculto", () => {
    expect(resumenDeGrupo(3, 3)).toBe("3 sugerencias");
  });

  it("dice cuántas está viendo el lector y cuántas hay de verdad", () => {
    expect(resumenDeGrupo(1, 4)).toBe("1 de 4 sugerencias");
  });

  /** Un grupo nunca llega a uno — lo impide el repositorio — pero el filtro sí. */
  it("concuerda el singular", () => {
    expect(resumenDeGrupo(1, 1)).toBe("1 sugerencia");
  });
});
