// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  GRAPH_FOTO_ORIGINAL_URL,
  GRAPH_FOTO_URL,
  leerFotoDePerfil,
} from "@/lib/graph/foto";

/**
 * La foto de perfil, con Graph como doble.
 *
 * LO QUE ESTE ARCHIVO TIENE QUE PROBAR es que la función es TOTAL. Del otro
 * lado hay un disco de 32px que ya sabe dibujar iniciales, así que «esta
 * persona no tiene foto», «TI no consintió el permiso» y «Graph no contesta»
 * terminan las tres igual — y si alguna se propagara como excepción, la barra
 * superior se caería en cada pantalla del portal por un adorno.
 *
 * El segundo pedido —el original, cuando la miniatura no existe— es lo otro:
 * hay inquilinos que no generan `96x96`, y sin ese respaldo TODO EL MUNDO se
 * quedaría sin foto en ellos aunque la tengan cargada.
 */

const ENV = { tenantId: "tenant-abc", clientId: "cliente", clientSecret: "secreto" };
const CORREO = "jose.alvarez@limaexpresa.pe";

const BYTES = new Uint8Array([137, 80, 78, 71]).buffer;

function respuestaToken() {
  return new Response(JSON.stringify({ access_token: "t" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function respuestaFoto(tipo = "image/jpeg") {
  return new Response(BYTES, { status: 200, headers: { "Content-Type": tipo } });
}

function sinContenido(status: number) {
  return new Response(null, { status });
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("leerFotoDePerfil", () => {
  it("pide la miniatura de la dirección, con el token de aplicación", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respuestaToken())
      .mockResolvedValueOnce(respuestaFoto());

    const foto = await leerFotoDePerfil(CORREO, { env: ENV, fetchImpl });

    expect(foto?.tipo).toBe("image/jpeg");
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(GRAPH_FOTO_URL(CORREO));
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("escapa la dirección en la URL en vez de pegarla tal cual", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respuestaToken())
      .mockResolvedValueOnce(respuestaFoto());

    await leerFotoDePerfil("a+b@corp.com", { env: ENV, fetchImpl });

    const [url] = fetchImpl.mock.calls[1] as [string];
    expect(url).toContain("a%2Bb%40corp.com");
  });

  it("cae al original cuando el inquilino no genera la miniatura", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respuestaToken())
      .mockResolvedValueOnce(sinContenido(404))
      .mockResolvedValueOnce(respuestaFoto("image/png"));

    const foto = await leerFotoDePerfil(CORREO, { env: ENV, fetchImpl });

    /* Sin este respaldo, en un inquilino sin miniaturas nadie tendría foto. */
    expect(foto?.tipo).toBe("image/png");
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(GRAPH_FOTO_ORIGINAL_URL(CORREO));
  });

  it("devuelve null cuando esa persona no tiene foto, que no es un error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respuestaToken())
      .mockResolvedValue(sinContenido(404));

    expect(await leerFotoDePerfil(CORREO, { env: ENV, fetchImpl })).toBeNull();
  });

  it("devuelve null cuando TI no consintió el permiso, sin distinguirlo", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respuestaToken())
      .mockResolvedValue(sinContenido(403));

    /* Del otro lado, «no tiene foto» y «no puedo mirar» se dibujan igual. */
    expect(await leerFotoDePerfil(CORREO, { env: ENV, fetchImpl })).toBeNull();
  });

  it("devuelve null cuando Entra ID rechaza el token, sin propagar la excepción", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(sinContenido(401));

    expect(await leerFotoDePerfil(CORREO, { env: ENV, fetchImpl })).toBeNull();
  });

  it("devuelve null cuando Graph no se puede alcanzar", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("network"));

    /* Una excepción acá tiraría la barra superior en cada pantalla del portal
       por culpa de un adorno. */
    expect(await leerFotoDePerfil(CORREO, { env: ENV, fetchImpl })).toBeNull();
  });

  it("se conforma con un tipo razonable si Graph no declara ninguno", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respuestaToken())
      .mockResolvedValueOnce(new Response(BYTES, { status: 200 }));

    const foto = await leerFotoDePerfil(CORREO, { env: ENV, fetchImpl });

    /* La respuesta es binaria: sin un tipo, el navegador no sabe qué recibió. */
    expect(foto?.tipo).toBeTruthy();
  });
});
