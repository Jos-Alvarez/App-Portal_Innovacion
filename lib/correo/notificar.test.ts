// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SugerenciaDTO } from "@/lib/sugerencias/repository";

const { after, enviarCorreo, readCorreoEnv } = vi.hoisted(() => ({
  after: vi.fn(),
  enviarCorreo: vi.fn(),
  readCorreoEnv: vi.fn(),
}));

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after,
}));
vi.mock("@/lib/correo/servicio", async (original) => ({
  ...(await original<typeof import("@/lib/correo/servicio")>()),
  enviarCorreo,
}));
vi.mock("@/lib/correo/env", async (original) => ({
  ...(await original<typeof import("@/lib/correo/env")>()),
  readCorreoEnv,
}));

import { notificarSugerencia, programarNotificacion } from "@/lib/correo/notificar";

const ENV = {
  baseUrl: "https://correo.test",
  apiKey: "clave",
  remitente: "portal@corp.com",
  destinatario: "innovacion@corp.com",
};

const SUGERENCIA: SugerenciaDTO = {
  id: 42,
  titulo: "Tablero de peajes",
  descripcion: "Un tablero por estación.",
  areaDestino: "Tecnología",
  estado: "pendiente",
  fechaCreacion: "2026-08-21T14:30:00.000Z",
  historial: [],
};

const AUTORA = { nombre: "Ana Rojas", correo: "ana.rojas@corp.com" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  readCorreoEnv.mockReturnValue(ENV);
  enviarCorreo.mockResolvedValue(new Response("", { status: 202 }));
});

describe("notificarSugerencia", () => {
  it("sends the message built from the suggestion, with the configured environment", async () => {
    await notificarSugerencia(SUGERENCIA, AUTORA);

    expect(enviarCorreo).toHaveBeenCalledWith(
      expect.objectContaining({
        asunto: expect.stringContaining("Tablero de peajes"),
        texto: expect.stringContaining("ana.rojas@corp.com"),
      }),
      ENV,
    );
  });

  it("reports success when the API accepts it", async () => {
    await expect(notificarSugerencia(SUGERENCIA, AUTORA)).resolves.toBe(true);
  });

  it("swallows a rejected send and reports failure instead of throwing", async () => {
    enviarCorreo.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(notificarSugerencia(SUGERENCIA, AUTORA)).resolves.toBe(false);
  });

  it("treats a non-2xx answer as a failure, not as a send", async () => {
    enviarCorreo.mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(notificarSugerencia(SUGERENCIA, AUTORA)).resolves.toBe(false);
  });

  it("does not even try when the mail environment is not configured", async () => {
    readCorreoEnv.mockImplementation(() => {
      throw new Error("Missing required mail environment variable(s): MAIL_API_KEY.");
    });

    await expect(notificarSugerencia(SUGERENCIA, AUTORA)).resolves.toBe(false);
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("is silent to the user but never to the log — every failure leaves a line", async () => {
    enviarCorreo.mockRejectedValue(new Error("ECONNREFUSED"));

    await notificarSugerencia(SUGERENCIA, AUTORA);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("#42"),
      expect.objectContaining({ message: "ECONNREFUSED" }),
    );
  });

  it("names the suggestion in the log, so a missing mail can be traced to a row", async () => {
    enviarCorreo.mockResolvedValue(new Response("", { status: 503 }));

    await notificarSugerencia(SUGERENCIA, AUTORA);

    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/#42.*503|503.*#42/));
  });
});

describe("programarNotificacion", () => {
  it("hands the send to `after`, so the response is never waiting on the mail API", () => {
    programarNotificacion(SUGERENCIA, AUTORA);

    expect(after).toHaveBeenCalledOnce();
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("runs the notification when the scheduled task is executed", async () => {
    after.mockImplementation((tarea: () => Promise<unknown>) => tarea());

    programarNotificacion(SUGERENCIA, AUTORA);
    await vi.waitFor(() => expect(enviarCorreo).toHaveBeenCalledOnce());
  });

  it("returns nothing, so no caller can accidentally await the mail", () => {
    expect(programarNotificacion(SUGERENCIA, AUTORA)).toBeUndefined();
  });

  it("never throws, even if scheduling itself fails — the suggestion is already saved", () => {
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope.");
    });

    expect(() => programarNotificacion(SUGERENCIA, AUTORA)).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });
});
