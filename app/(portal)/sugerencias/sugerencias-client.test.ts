import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AVISO_SIN_ACTUALIZAR,
  CONFIRMACION_ENVIO,
  ERROR_DE_RED,
  OPCIONES_SUGERENCIAS,
  RUTA_SUGERENCIAS,
  ZONA_HORARIA,
  enviarSugerencia,
  formatearFecha,
  obtenerSugerencias,
} from "./sugerencias-client";

/**
 * The browser's half of `/api/sugerencias`.
 *
 * The ENDPOINT's rules are not re-tested here — its own suite owns the guard,
 * the scope and the status codes. What this file pins down is what the browser
 * does with each possible answer, which the endpoint cannot decide for it.
 */

const CREADA = "2026-08-21T14:30:00.000Z";

const SUGERENCIA = {
  id: 31,
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta.",
  areaDestino: "Operaciones",
  estado: "pendiente" as const,
  fechaCreacion: CREADA,
  historial: [
    {
      id: 90,
      estadoAnterior: null,
      estadoNuevo: "pendiente" as const,
      fechaCambio: CREADA,
      autor: "Ana Quispe",
    },
  ],
};

const DATOS = {
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta.",
  areaDestino: "Operaciones",
};

const respuesta = (cuerpo: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("la política de revalidación", () => {
  /**
   * ADR 0007 pide "revalidación al recuperar el foco y en intervalos". Ambas
   * quedan escritas, incluso `revalidateOnFocus`, que ya es el valor por defecto
   * de SWR: un requisito satisfecho por un default que nadie declaró es uno que
   * `swr` podría cambiar en un major sin que una sola línea de este repositorio
   * cambie para notarlo.
   */
  it("revalida al foco y cada minuto, y lo declara", () => {
    expect(OPCIONES_SUGERENCIAS.revalidateOnFocus).toBe(true);
    expect(OPCIONES_SUGERENCIAS.refreshInterval).toBe(60_000);
  });

  it("apunta a la ruta de colección del ADR 0003, sin parámetros", () => {
    expect(RUTA_SUGERENCIAS).toBe("/api/sugerencias");
  });
});

describe("obtenerSugerencias", () => {
  it("devuelve la lista de un 200 bien formado", async () => {
    fetchMock.mockResolvedValue(respuesta({ sugerencias: [SUGERENCIA] }));

    expect(await obtenerSugerencias(RUTA_SUGERENCIAS)).toEqual([SUGERENCIA]);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  LANZA SIEMPRE, Y ESE ES TODO EL CONTRATO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * SWR reemplaza el valor cacheado con lo que el fetcher RESUELVA y conserva el
   * último bueno cuando RECHAZA. Devolver `[]` en un mal minuto vaciaría una
   * pantalla llena de sugerencias en "todavía no enviaste ninguna" — que aquí es
   * peor que en el dashboard, porque quien lo lea concluiría, razonablemente, que
   * lo que escribió se perdió.
   */
  it.each([
    ["un 500", () => respuesta({ codigo: "error_interno" }, { status: 500 })],
    ["un 401", () => respuesta({ codigo: "no_autenticado" }, { status: 401 })],
    [
      "un 200 que no es JSON",
      () => new Response("<html>mantenimiento</html>", { status: 200 }),
    ],
    ["un 200 sin la clave sugerencias", () => respuesta({ otra: [] })],
    ["un 200 con algo que no es lista", () => respuesta({ sugerencias: { id: 1 } })],
  ])("lanza ante %s en vez de devolver una lista vacía", async (_caso, construir) => {
    fetchMock.mockResolvedValue(construir());

    await expect(obtenerSugerencias(RUTA_SUGERENCIAS)).rejects.toThrow();
  });

  it("deja pasar el rechazo de fetch tal cual: ya es la señal que SWR necesita", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(obtenerSugerencias(RUTA_SUGERENCIAS)).rejects.toThrow("Failed to fetch");
  });

  it("acepta una lista vacía como respuesta legítima: todavía no enviaste nada", async () => {
    fetchMock.mockResolvedValue(respuesta({ sugerencias: [] }));

    expect(await obtenerSugerencias(RUTA_SUGERENCIAS)).toEqual([]);
  });
});

describe("enviarSugerencia", () => {
  it("hace POST con el cuerpo en JSON a la ruta de colección", async () => {
    fetchMock.mockResolvedValue(respuesta({ sugerencia: SUGERENCIA }, { status: 201 }));

    await enviarSugerencia(DATOS);

    const [ruta, init] = fetchMock.mock.calls[0];

    expect(ruta).toBe(RUTA_SUGERENCIAS);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(DATOS);
  });

  it("devuelve la sugerencia registrada cuando el servidor contesta 201", async () => {
    fetchMock.mockResolvedValue(respuesta({ sugerencia: SUGERENCIA }, { status: 201 }));

    expect(await enviarSugerencia(DATOS)).toEqual({ ok: true, sugerencia: SUGERENCIA });
  });

  it("muestra la frase del servidor cuando el servidor tiene una", async () => {
    fetchMock.mockResolvedValue(
      respuesta(
        { codigo: "titulo_invalido", mensaje: "Escribe un título para tu sugerencia." },
        { status: 400 },
      ),
    );

    expect(await enviarSugerencia(DATOS)).toEqual({
      ok: false,
      mensaje: "Escribe un título para tu sugerencia.",
    });
  });

  it("cae en la frase genérica si el fallo no trae sobre de error", async () => {
    fetchMock.mockResolvedValue(new Response("504 Gateway Timeout", { status: 504 }));

    const resultado = await enviarSugerencia(DATOS);

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.mensaje).toMatch(/no se guardó nada/i);
  });

  /** Sin status y sin cuerpo: al servidor no se llegó, así que no se escribió nada. */
  it("dice que la sugerencia no se envió cuando no hubo red", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await enviarSugerencia(DATOS)).toEqual({ ok: false, mensaje: ERROR_DE_RED });
  });

  /**
   * Un 201 sin sugerencia adentro se trata como FALLO, que es la dirección
   * conservadora y merece decirse en voz alta: puede que la fila sí se haya
   * escrito. Decirle a alguien que su idea no salió cuando sí salió cuesta un
   * duplicado que el ítem #16 agrupa; decirle que salió cuando no, cuesta la idea.
   */
  it("trata un 201 sin sugerencia como fallo, no como éxito", async () => {
    fetchMock.mockResolvedValue(respuesta({ ok: true }, { status: 201 }));

    expect((await enviarSugerencia(DATOS)).ok).toBe(false);
  });
});

describe("formatearFecha", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  UNA ZONA HORARIA FIJA, Y NO ES UNA SIMPLIFICACIÓN
   * ══════════════════════════════════════════════════════════════════════════
   *
   * La lista se renderiza en el servidor y se hidrata en el navegador. Con la
   * zona ambiente, la misma fecha se formatearía dos veces — una con la zona del
   * proceso, otra con la de quien lee — y una sugerencia enviada a las 21:00 en
   * Lima ya es el día siguiente en UTC. React encontraría textos distintos y
   * reportaría un desajuste de hidratación.
   *
   * Este test lo prueba de la única forma que vale: cambiando la zona del proceso
   * y comprobando que la salida no se mueve.
   */
  it("da la misma hora sin importar la zona horaria del proceso", () => {
    /* 14:30 UTC = 09:30 en Lima (UTC−5, sin horario de verano). */
    const esperado = formatearFecha(CREADA);

    expect(esperado).toContain("21/08/2026");
    expect(esperado).toMatch(/09:30/);
    expect(ZONA_HORARIA).toBe("America/Lima");
  });

  /** Un envío de las 21:00 en Lima ya es el día siguiente en UTC. */
  it("no adelanta el día en un envío de la noche", () => {
    expect(formatearFecha("2026-08-22T02:00:00.000Z")).toContain("21/08/2026");
  });

  it("escribe la fecha en orden día/mes/año, sin depender del locale del navegador", () => {
    expect(formatearFecha("2026-01-05T15:00:00.000Z")).toContain("05/01/2026");
  });

  /**
   * La fecha es contexto alrededor de una sugerencia, nunca el punto de la
   * pantalla: no vale una excepción que deje la lista en blanco.
   */
  it("devuelve un guion ante una fecha ilegible, no «Invalid Date»", () => {
    expect(formatearFecha("no es una fecha")).toBe("—");
    expect(formatearFecha("")).toBe("—");
  });
});

describe("los mensajes de la pantalla", () => {
  /**
   * Son tres eventos distintos y DESIGN.md los trata distinto: el envío que
   * falló (rojo, junto al formulario), la revalidación de fondo que no llegó
   * (ámbar, sobre la lista) y el envío que salió (toast). Compartir texto entre
   * ellos sería empezar a confundirlos.
   */
  it("no reutiliza una frase para dos situaciones diferentes", () => {
    const frases = [AVISO_SIN_ACTUALIZAR, ERROR_DE_RED, CONFIRMACION_ENVIO];

    expect(new Set(frases).size).toBe(frases.length);
  });

  it("el aviso de fondo no alarma: la lista sigue siendo válida", () => {
    expect(AVISO_SIN_ACTUALIZAR).toMatch(/última versión que cargamos/i);
    expect(AVISO_SIN_ACTUALIZAR).not.toMatch(/error|falló|perdi/i);
  });

  it("el fallo de red sí dice que la sugerencia no se envió", () => {
    expect(ERROR_DE_RED).toMatch(/no se envió/i);
  });
});
