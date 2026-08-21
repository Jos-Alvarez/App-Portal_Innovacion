// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  agruparSugerencias,
  AVISO_SIN_ACTUALIZAR,
  CONFIRMACION_QUITAR,
  ERROR_DE_RED,
  ERROR_DE_RED_GRUPO,
  ERROR_SIN_LISTA,
  ERROR_SIN_CONFIRMACION,
  OPCIONES_TODAS,
  RUTA_TODAS,
  cambiarEstado,
  confirmacionDeCambio,
  confirmacionDeGrupo,
  obtenerTodas,
  quitarDeGrupo,
  RUTA_GRUPOS,
  rutaEstado,
  rutaGrupoDeSugerencia,
} from "./sugerencias-client";

/**
 * El lado del navegador de la pantalla de gestión.
 *
 * `fetch` is the only thing replaced. What these tests protect is the CONTRACT
 * between this module and the screen: that a bad minute never resolves into an
 * empty inbox, and that an ambiguous answer is never reported as a success.
 */

const SUGERENCIA = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
  estado: "aprobada",
  fechaCreacion: "2026-08-21T14:30:00.000Z",
  autor: { nombre: "Ana Quispe", area: "Peajes" },
  grupo: null,
  historial: [],
};

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

describe("las rutas", () => {
  /** La lectura ensanchada es un camino propio, nunca una bandera sobre la del colaborador. */
  it("apunta a `/api/sugerencias/todas`, y no a `/api/sugerencias` con un parámetro", () => {
    expect(RUTA_TODAS).toBe("/api/sugerencias/todas");
    expect(RUTA_TODAS).not.toContain("?");
  });

  it("arma la ruta del cambio de estado tal como la nombra el ADR 0003", () => {
    expect(rutaEstado(31)).toBe("/api/sugerencias/31/estado");
  });
});

describe("OPCIONES_TODAS", () => {
  /**
   * ADR 0007 pide las dos: revalidación al foco y por intervalo. `revalidateOnFocus`
   * es el default de SWR y se escribe igual, porque un requisito cumplido por un
   * default no declarado es uno que `swr` podría cambiar sin que nada acá lo note.
   */
  it("declara los dos relojes del ADR 0007", () => {
    expect(OPCIONES_TODAS.refreshInterval).toBe(60_000);
    expect(OPCIONES_TODAS.revalidateOnFocus).toBe(true);
  });
});

describe("obtenerTodas", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  ESTE FETCHER TIRA, Y ESA ES LA DECISIÓN ENTERA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * SWR reemplaza el valor cacheado con lo que el fetcher RESUELVE y se queda con
   * el último bueno cuando RECHAZA. Devolver `[]` en un mal minuto vaciaría la
   * bandeja a "todavía no hay sugerencias" — que acá se lee como "nadie mandó
   * nada", una afirmación sobre la empresa y no sobre la red.
   */
  it("devuelve la lista cuando la respuesta es la esperada", async () => {
    fetchMock().mockResolvedValue(respuesta({ sugerencias: [SUGERENCIA] }));

    await expect(obtenerTodas(RUTA_TODAS)).resolves.toEqual([SUGERENCIA]);
  });

  it.each([401, 403, 500, 503])("tira ante un %i", async (status) => {
    fetchMock().mockResolvedValue(respuesta({ codigo: "x", mensaje: "y" }, status));

    await expect(obtenerTodas(RUTA_TODAS)).rejects.toThrow(String(status));
  });

  it("tira ante un 200 cuyo cuerpo no es JSON", async () => {
    fetchMock().mockResolvedValue(new Response("<html>gateway</html>", { status: 200 }));

    await expect(obtenerTodas(RUTA_TODAS)).rejects.toThrow(/sin la lista/);
  });

  it.each([{}, { sugerencias: null }, { sugerencias: "muchas" }, { otra: [] }])(
    "tira ante un 200 sin lista: %o",
    async (cuerpo) => {
      fetchMock().mockResolvedValue(respuesta(cuerpo));

      await expect(obtenerTodas(RUTA_TODAS)).rejects.toThrow(/sin la lista/);
    },
  );

  it("deja pasar el rechazo del propio fetch, que ya es la señal que SWR necesita", async () => {
    fetchMock().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(obtenerTodas(RUTA_TODAS)).rejects.toThrow("Failed to fetch");
  });

  it("acepta una lista vacía como respuesta legítima", async () => {
    fetchMock().mockResolvedValue(respuesta({ sugerencias: [] }));

    await expect(obtenerTodas(RUTA_TODAS)).resolves.toEqual([]);
  });
});

describe("cambiarEstado", () => {
  it("manda un PATCH con el estado en el cuerpo", async () => {
    fetchMock().mockResolvedValue(respuesta({ sugerencia: SUGERENCIA }));

    await cambiarEstado(31, "aprobada");

    const [ruta, init] = fetchMock().mock.calls[0] as [string, RequestInit];

    expect(ruta).toBe("/api/sugerencias/31/estado");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ estado: "aprobada" });
  });

  it("devuelve la sugerencia actualizada cuando el servidor confirma", async () => {
    fetchMock().mockResolvedValue(respuesta({ sugerencia: SUGERENCIA }));

    await expect(cambiarEstado(31, "aprobada")).resolves.toEqual({
      ok: true,
      sugerencia: SUGERENCIA,
    });
  });

  /** El mensaje del servidor se muestra tal cual: `lib/api/errors` lo escribe para leerse. */
  it("reenvía sin tocar la frase del 409 de conflicto", async () => {
    fetchMock().mockResolvedValue(
      respuesta(
        { codigo: "estado_en_conflicto", mensaje: "Otra persona cambió el estado…" },
        409,
      ),
    );

    await expect(cambiarEstado(31, "aprobada")).resolves.toEqual({
      ok: false,
      mensaje: "Otra persona cambió el estado…",
    });
  });

  it("cae en la frase genérica cuando el fallo no trae sobre", async () => {
    fetchMock().mockResolvedValue(new Response("<html>504</html>", { status: 504 }));

    const resultado = await cambiarEstado(31, "aprobada");

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.mensaje).toMatch(/quedó como estaba/i);
  });

  it("distingue el servidor inalcanzable, donde nada se escribió", async () => {
    fetchMock().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(cambiarEstado(31, "aprobada")).resolves.toEqual({
      ok: false,
      mensaje: ERROR_DE_RED,
    });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  UN 200 SIN CUERPO ÚTIL ES UNA DUDA, Y SE DICE COMO DUDA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Es el caso opuesto al envío del colaborador. Allá la respuesta dudosa tenía
   * que leerse como "no se envió", para que nadie crea a salvo una idea que no se
   * escribió. Acá el desenlace ambiguo es un cambio que probablemente SÍ se
   * aplicó, así que la frase no promete ninguna de las dos cosas y manda a mirar
   * la lista.
   */
  it("trata un 200 sin sugerencia como falla, y no promete que quedó como estaba", async () => {
    fetchMock().mockResolvedValue(respuesta({}));

    const resultado = await cambiarEstado(31, "aprobada");

    expect(resultado).toEqual({ ok: false, mensaje: ERROR_SIN_CONFIRMACION });
    expect(ERROR_SIN_CONFIRMACION).not.toMatch(/quedó como estaba/i);
    expect(ERROR_SIN_CONFIRMACION).toMatch(/actualiza/i);
  });
});

describe("los mensajes de la pantalla", () => {
  it("confirma nombrando el estado que se acaba de aplicar", () => {
    expect(confirmacionDeCambio("Aprobada")).toBe("Sugerencia marcada como Aprobada.");
  });

  /** El aviso del refresco no es un error: lo que está en pantalla sigue siendo cierto. */
  it("el aviso de refresco no dice que algo esté mal, sólo que puede estar atrasado", () => {
    expect(AVISO_SIN_ACTUALIZAR).toMatch(/última versión/i);
    expect(AVISO_SIN_ACTUALIZAR).not.toMatch(/error/i);
  });

  it("ninguna frase de esta pantalla filtra códigos técnicos", () => {
    for (const frase of [AVISO_SIN_ACTUALIZAR, ERROR_DE_RED, ERROR_SIN_CONFIRMACION]) {
      expect(frase).not.toMatch(/prisma|zod|sql|http|\b\d{3}\b/i);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 *  ÍTEM #16 — LA AGRUPACIÓN
 * ══════════════════════════════════════════════════════════════════════════ */

const AGRUPADA = { ...SUGERENCIA, grupo: { id: 42, titulo: "Tableros de peajes" } };

describe("las rutas de agrupación", () => {
  it("apunta a la ruta que nombra el ADR 0003", () => {
    expect(RUTA_GRUPOS).toBe("/api/sugerencias/grupos");
  });

  it("arma la ruta de la pertenencia de una sugerencia", () => {
    expect(rutaGrupoDeSugerencia(31)).toBe("/api/sugerencias/31/grupo");
  });
});

describe("agruparSugerencias", () => {
  it("manda un POST con el título y los ids", async () => {
    fetchMock().mockResolvedValue(respuesta({ sugerencias: [AGRUPADA] }, 201));

    await agruparSugerencias("Tableros de peajes", [7, 12]);

    const [ruta, init] = fetchMock().mock.calls[0] as [string, RequestInit];

    expect(ruta).toBe("/api/sugerencias/grupos");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      titulo: "Tableros de peajes",
      sugerenciaIds: [7, 12],
    });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  DEVUELVE LA LISTA ENTERA, NO EL GRUPO QUE CREÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Una escritura de agrupación llega a filas que quien llama nunca nombró:
   * disolver el grupo anterior anula el `grupo_id` de un sobreviviente. Por eso
   * la pantalla reemplaza su cache entera en vez de parchar una entrada — no hay
   * entrada que parchar que alcance.
   */
  it("devuelve la lista completa cuando el servidor confirma", async () => {
    fetchMock().mockResolvedValue(respuesta({ sugerencias: [AGRUPADA] }, 201));

    await expect(agruparSugerencias("Peajes", [7, 12])).resolves.toEqual({
      ok: true,
      sugerencias: [AGRUPADA],
    });
  });

  it("acepta el 201 como éxito, que es lo que contesta el alta", async () => {
    fetchMock().mockResolvedValue(respuesta({ sugerencias: [] }, 201));

    expect((await agruparSugerencias("Peajes", [7, 12])).ok).toBe(true);
  });

  it("reenvía sin tocar la frase del 409", async () => {
    fetchMock().mockResolvedValue(
      respuesta(
        { codigo: "sugerencias_no_encontradas", mensaje: "Alguna de las sugerencias ya no existe." },
        409,
      ),
    );

    await expect(agruparSugerencias("Peajes", [7, 12])).resolves.toEqual({
      ok: false,
      mensaje: "Alguna de las sugerencias ya no existe.",
    });
  });

  it("distingue el servidor inalcanzable, donde nada se escribió", async () => {
    fetchMock().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(agruparSugerencias("Peajes", [7, 12])).resolves.toEqual({
      ok: false,
      mensaje: ERROR_DE_RED_GRUPO,
    });
  });

  /**
   * La duda es más ancha acá que en el cambio de estado: una escritura de
   * agrupación puede disolver un grupo y liberar una sugerencia que nadie nombró,
   * así que "no cambió nada" es justamente lo que no se puede prometer cuando
   * falta el cuerpo.
   */
  it("trata un 2xx sin lista como falla, y no promete que nada cambió", async () => {
    fetchMock().mockResolvedValue(respuesta({ grupo: { id: 42 } }, 201));

    await expect(agruparSugerencias("Peajes", [7, 12])).resolves.toEqual({
      ok: false,
      mensaje: ERROR_SIN_LISTA,
    });
    expect(ERROR_SIN_LISTA).not.toMatch(/no cambió|quedaron como estaban/i);
    expect(ERROR_SIN_LISTA).toMatch(/actualiza/i);
  });
});

describe("quitarDeGrupo", () => {
  it("manda un DELETE a la pertenencia, sin cuerpo", async () => {
    fetchMock().mockResolvedValue(respuesta({ sugerencias: [SUGERENCIA] }));

    await quitarDeGrupo(31);

    const [ruta, init] = fetchMock().mock.calls[0] as [string, RequestInit];

    expect(ruta).toBe("/api/sugerencias/31/grupo");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("devuelve la lista completa, porque disolver libera una fila que nadie nombró", async () => {
    fetchMock().mockResolvedValue(respuesta({ sugerencias: [SUGERENCIA] }));

    await expect(quitarDeGrupo(31)).resolves.toEqual({ ok: true, sugerencias: [SUGERENCIA] });
  });

  it("reenvía la frase del 409 cuando ya estaba suelta", async () => {
    fetchMock().mockResolvedValue(
      respuesta({ codigo: "sugerencia_sin_grupo", mensaje: "Ya no está en ningún grupo." }, 409),
    );

    await expect(quitarDeGrupo(31)).resolves.toEqual({
      ok: false,
      mensaje: "Ya no está en ningún grupo.",
    });
  });

  it("distingue el servidor inalcanzable", async () => {
    fetchMock().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(quitarDeGrupo(31)).resolves.toEqual({ ok: false, mensaje: ERROR_DE_RED_GRUPO });
  });
});

describe("los mensajes de la agrupación", () => {
  it("confirma diciendo cuántas se agruparon", () => {
    expect(confirmacionDeGrupo(3)).toBe("Agrupamos 3 sugerencias.");
  });

  it("confirma la salida del grupo", () => {
    expect(CONFIRMACION_QUITAR).toMatch(/salió del grupo/i);
  });

  /** Agrupar no toca el estado, así que ninguna frase de acá puede hablar de uno. */
  it("ninguna frase de agrupación habla del estado de una sugerencia", () => {
    for (const frase of [ERROR_DE_RED_GRUPO, ERROR_SIN_LISTA, CONFIRMACION_QUITAR]) {
      expect(frase).not.toMatch(/pendiente|revisión|aprobada|rechazada|implementada/i);
    }
  });

  it("ninguna frase de esta pantalla filtra códigos técnicos", () => {
    for (const frase of [ERROR_DE_RED_GRUPO, ERROR_SIN_LISTA, CONFIRMACION_QUITAR]) {
      expect(frase).not.toMatch(/prisma|zod|sql|http|\b\d{3}\b/i);
    }
  });
});
