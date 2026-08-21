// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CorreoEnv } from "@/lib/correo/env";
import { RUTA_ENVIO, TIMEOUT_MS, enviarCorreo } from "@/lib/correo/servicio";

const ENV: CorreoEnv = {
  baseUrl: "https://correo.test/api",
  apiKey: "clave-secreta",
  remitente: "portal@corp.com",
  destinatario: "innovacion@corp.com",
};

const MENSAJE = { asunto: "Asunto", texto: "Cuerpo" };

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("", { status: 202 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The single call `enviarCorreo` made, as `[url, init]`. */
function llamada() {
  return fetchMock.mock.calls[0] as [string, RequestInit];
}

describe("enviarCorreo", () => {
  it("posts to the configured origin plus the one send path this module owns", async () => {
    await enviarCorreo(MENSAJE, ENV);

    expect(llamada()[0]).toBe(`https://correo.test/api${RUTA_ENVIO}`);
    expect(llamada()[1].method).toBe("POST");
  });

  it("authenticates with the api key as a bearer credential", async () => {
    await enviarCorreo(MENSAJE, ENV);

    expect((llamada()[1].headers as Record<string, string>).Authorization).toBe(
      "Bearer clave-secreta",
    );
  });

  it("sends from the configured sender to the Área de Innovación, and to nobody else", async () => {
    await enviarCorreo(MENSAJE, ENV);

    expect(JSON.parse(llamada()[1].body as string)).toEqual({
      from: "portal@corp.com",
      to: ["innovacion@corp.com"],
      subject: "Asunto",
      text: "Cuerpo",
    });
  });

  it("returns the raw response, interpreting nothing", async () => {
    fetchMock.mockResolvedValue(new Response("no", { status: 500 }));

    await expect(enviarCorreo(MENSAJE, ENV)).resolves.toMatchObject({ status: 500 });
  });

  it("carries its own deadline, so a hung mail API cannot hang forever", async () => {
    await enviarCorreo(MENSAJE, ENV);

    expect(llamada()[1].signal).toBeInstanceOf(AbortSignal);
    expect(TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it("lets a transport rejection through untouched", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(enviarCorreo(MENSAJE, ENV)).rejects.toThrow("ECONNREFUSED");
  });
});
