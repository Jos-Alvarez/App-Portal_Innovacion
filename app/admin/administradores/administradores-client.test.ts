// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_INTERNO } from "@/lib/admins/errors";

import {
  ERROR_DE_RED,
  ERROR_SIN_CONFIRMACION,
  RUTA_ADMINS,
  RUTA_DIRECTORIO,
  buscarPersonas,
  confirmacionDePromocion,
  confirmacionDeRevocacion,
  promoverAdministrador,
  revocarAdministrador,
} from "./administradores-client";

/**
 * The browser's side of `/api/admins`.
 *
 * The property worth protecting here is the one ADR 0007 rests on: the answer is
 * READ, never assumed. A 2xx whose body does not carry the row is a failure to
 * the screen — drawing an administrator on it would be showing a role nobody can
 * prove was granted.
 */

const ADMINISTRADOR = {
  id: 7,
  nombre: "Ana Quispe",
  correo: "ana@corp.com",
  area: "TI",
  activo: true,
};

const fetchMock = vi.fn();

function respuesta(cuerpo: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buscarPersonas", () => {
  it("consulta el directorio con el término codificado", async () => {
    fetchMock.mockResolvedValue(respuesta({ origen: "directorio", personas: [] }));

    await buscarPersonas("ana quispe+");

    expect(fetchMock.mock.calls[0][0]).toBe(`${RUTA_DIRECTORIO}?q=ana%20quispe%2B`);
  });

  it("devuelve las personas y de dónde salieron", async () => {
    const personas = [{ correo: "ana@corp.com", nombre: "Ana", area: "TI", enElPortal: null }];
    fetchMock.mockResolvedValue(respuesta({ origen: "portal", personas }));

    expect(await buscarPersonas("ana")).toEqual({ ok: true, origen: "portal", personas });
  });

  it("reenvía el mensaje del servidor tal cual", async () => {
    fetchMock.mockResolvedValue(
      respuesta({ codigo: "termino_invalido", mensaje: "Escribe al menos 2 caracteres." }, { status: 400 }),
    );

    expect(await buscarPersonas("a")).toEqual({
      ok: false,
      mensaje: "Escribe al menos 2 caracteres.",
    });
  });

  it("no inventa un origen que el servidor no mandó", async () => {
    fetchMock.mockResolvedValue(respuesta({ personas: [] }));

    expect(await buscarPersonas("ana")).toMatchObject({ ok: false });
  });

  it("dice que no hubo conexión cuando la petición ni salió", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await buscarPersonas("ana")).toEqual({ ok: false, mensaje: ERROR_DE_RED });
  });
});

describe("promoverAdministrador", () => {
  it("manda el correo como cuerpo JSON", async () => {
    fetchMock.mockResolvedValue(respuesta({ administrador: ADMINISTRADOR }));

    await promoverAdministrador("ana@corp.com");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(RUTA_ADMINS);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ correo: "ana@corp.com" });
  });

  it("devuelve la fila que confirmó el servidor", async () => {
    fetchMock.mockResolvedValue(respuesta({ administrador: ADMINISTRADOR }));

    expect(await promoverAdministrador("ana@corp.com")).toEqual({
      ok: true,
      administrador: ADMINISTRADOR,
    });
  });

  /** ADR 0007: the server is the only truth about a role. */
  it("no da por hecho el cambio ante un 200 sin fila", async () => {
    fetchMock.mockResolvedValue(respuesta({}));

    expect(await promoverAdministrador("ana@corp.com")).toEqual({
      ok: false,
      mensaje: ERROR_SIN_CONFIRMACION,
    });
  });

  it("reenvía el rechazo del servidor sin reescribirlo", async () => {
    fetchMock.mockResolvedValue(
      respuesta(
        { codigo: "ya_es_administrador", mensaje: "Esa persona ya es administradora del portal." },
        { status: 409 },
      ),
    );

    expect(await promoverAdministrador("ana@corp.com")).toEqual({
      ok: false,
      mensaje: "Esa persona ya es administradora del portal.",
    });
  });

  /** A gateway page or a truncated stream: a failure whose body is not the envelope. */
  it("cae al mensaje interno cuando el fallo no trae el envelope", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));

    expect(await promoverAdministrador("ana@corp.com")).toEqual({
      ok: false,
      mensaje: ERROR_INTERNO.error.mensaje,
    });
  });
});

describe("revocarAdministrador", () => {
  it("borra el rol de esa persona por su identificador", async () => {
    fetchMock.mockResolvedValue(respuesta({ administrador: ADMINISTRADOR }));

    await revocarAdministrador(7);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(`${RUTA_ADMINS}/7`);
    expect(init.method).toBe("DELETE");
  });

  it("no manda cuerpo: la petición es la URL y el verbo", async () => {
    fetchMock.mockResolvedValue(respuesta({ administrador: ADMINISTRADOR }));

    await revocarAdministrador(7);

    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBeUndefined();
  });

  it("reenvía la regla de mínimo 1 administrador tal como la escribió la API", async () => {
    fetchMock.mockResolvedValue(
      respuesta(
        { codigo: "ultimo_administrador", mensaje: "No puedes quitar el rol: …" },
        { status: 409 },
      ),
    );

    expect(await revocarAdministrador(7)).toEqual({
      ok: false,
      mensaje: "No puedes quitar el rol: …",
    });
  });

  it("dice que no hubo conexión cuando la petición ni salió", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await revocarAdministrador(7)).toEqual({ ok: false, mensaje: ERROR_DE_RED });
  });
});

describe("los mensajes de confirmación", () => {
  it("nombran a la persona, que es lo que distingue una acción de la siguiente", () => {
    expect(confirmacionDePromocion("Ana Quispe")).toContain("Ana Quispe");
    expect(confirmacionDeRevocacion("Ana Quispe")).toContain("Ana Quispe");
  });

  it("dicen cosas distintas", () => {
    expect(confirmacionDePromocion("Ana")).not.toBe(confirmacionDeRevocacion("Ana"));
  });
});
