// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/usuarios/me/foto` — la foto de quien está mirando.
 *
 * LO QUE ESTE ARCHIVO TIENE QUE PROBAR, en orden de importancia:
 *
 * 1. Que la dirección con la que se consulta Graph sale del GUARD y de ningún
 *    otro lado. El token es de aplicación y puede leer a toda la empresa: lo
 *    único que impide que esta ruta se vuelva un directorio de fotos es que
 *    nadie pueda decirle de quién.
 * 2. Que nada la hace fallar. El avatar lo dibuja la barra superior, que está
 *    en cada pantalla del portal.
 * 3. Que la respuesta se puede cachear, también cuando no hay foto.
 */

const { guardRoute, leerFotoDePerfil, readDirectorioEnv } = vi.hoisted(() => ({
  guardRoute: vi.fn(),
  leerFotoDePerfil: vi.fn(),
  readDirectorioEnv: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({ guardRoute }));
vi.mock("@/lib/graph/foto", () => ({ leerFotoDePerfil }));
vi.mock("@/lib/admins/directorio-env", () => ({ readDirectorioEnv }));

import { NextResponse } from "next/server";

import { GET, dynamic } from "./route";

const COLABORADORA = {
  allowed: true as const,
  usuario: { id: 12, correo: "ana@limaexpresa.pe", nombre: "Ana Quispe", esAdmin: false },
};

const ENV = { tenantId: "t", clientId: "c", clientSecret: "s" };

function denegado(status: 401 | 403, codigo: string) {
  return {
    allowed: false as const,
    response: NextResponse.json({ codigo, mensaje: "Mensaje del guard." }, { status }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  guardRoute.mockResolvedValue(COLABORADORA);
  readDirectorioEnv.mockReturnValue(ENV);
  leerFotoDePerfil.mockResolvedValue(null);
});

describe("GET /api/usuarios/me/foto", () => {
  it("declara `dynamic = force-dynamic`, como pide lib/authz", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("pide la foto de la dirección que releyó el guard, no de una que venga afuera", async () => {
    leerFotoDePerfil.mockResolvedValue({ contenido: new ArrayBuffer(4), tipo: "image/jpeg" });

    await GET();

    /* La ruta es `me`: no hay parámetro que falsear, y este es el único correo
       que puede llegar a Graph. */
    expect(leerFotoDePerfil).toHaveBeenCalledWith("ana@limaexpresa.pe", { env: ENV });
  });

  it("responde 401 sin sesión y no habla con Graph", async () => {
    guardRoute.mockResolvedValue(denegado(401, "sesion_requerida"));

    expect((await GET()).status).toBe(401);
    expect(leerFotoDePerfil).not.toHaveBeenCalled();
  });

  it("responde 403 a una cuenta dada de baja, y tampoco consulta", async () => {
    guardRoute.mockResolvedValue(denegado(403, "cuenta_no_habilitada"));

    expect((await GET()).status).toBe(403);
    expect(leerFotoDePerfil).not.toHaveBeenCalled();
  });

  it("devuelve la imagen con el tipo que declaró Graph", async () => {
    leerFotoDePerfil.mockResolvedValue({ contenido: new ArrayBuffer(4), tipo: "image/png" });

    const respuesta = await GET();

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("image/png");
  });

  it("responde 204 y no 404 cuando esa persona no tiene foto", async () => {
    const respuesta = await GET();

    /* No falta un recurso: mucha gente simplemente no tiene foto. Un 404 en la
       consola, en cada pantalla, diría que algo se rompió. */
    expect(respuesta.status).toBe(204);
  });

  it("deja que el navegador la recuerde un día, y en privado", async () => {
    leerFotoDePerfil.mockResolvedValue({ contenido: new ArrayBuffer(4), tipo: "image/jpeg" });

    const respuesta = await GET();

    /* Sin esto, la barra superior pediría un viaje a Graph por navegación. */
    expect(respuesta.headers.get("cache-control")).toContain("max-age=86400");
    /* `private`: es de una persona, ningún proxy compartido debe guardarla. */
    expect(respuesta.headers.get("cache-control")).toContain("private");
  });

  it("también cachea el «no hay», o quien no tiene foto paga el viaje siempre", async () => {
    const respuesta = await GET();

    expect(respuesta.headers.get("cache-control")).toContain("max-age=86400");
  });

  it("sin credenciales de Entra ID contesta 204 en vez de caerse", async () => {
    readDirectorioEnv.mockImplementation(() => {
      throw new Error("AUTH_MICROSOFT_ENTRA_ID_SECRET no está definida");
    });

    const respuesta = await GET();

    /* La barra superior vive en cada pantalla: un 500 acá sería un portal
       inutilizable por culpa de un adorno. */
    expect(respuesta.status).toBe(204);
  });

  it("no filtra el detalle de la falla en la respuesta", async () => {
    readDirectorioEnv.mockImplementation(() => {
      throw new Error("AUTH_MICROSOFT_ENTRA_ID_SECRET no está definida");
    });

    const respuesta = await GET();

    expect(await respuesta.text()).toBe("");
  });
});
