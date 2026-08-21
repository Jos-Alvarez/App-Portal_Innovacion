import { describe, expect, it } from "vitest";

import { readCorreoEnv } from "@/lib/correo/env";

const complete = {
  MAIL_API_BASE_URL: " https://correo.test/api/ ",
  MAIL_API_KEY: " api-key ",
  MAIL_FROM_ADDRESS: " Portal@Corp.com ",
  MAIL_INNOVACION_ADDRESS: " Innovacion@Corp.com ",
};

describe("readCorreoEnv", () => {
  it("returns the normalized values when every required variable is present", () => {
    expect(readCorreoEnv(complete)).toEqual({
      baseUrl: "https://correo.test/api",
      apiKey: "api-key",
      remitente: "portal@corp.com",
      destinatario: "innovacion@corp.com",
    });
  });

  it("strips every trailing slash, so the variable can be written either way", () => {
    expect(readCorreoEnv({ ...complete, MAIL_API_BASE_URL: "https://correo.test///" }).baseUrl).toBe(
      "https://correo.test",
    );
  });

  it("names every missing required variable in the error", () => {
    expect(() => readCorreoEnv({})).toThrow(/MAIL_API_BASE_URL/);
    expect(() => readCorreoEnv({})).toThrow(/MAIL_API_KEY/);
    expect(() => readCorreoEnv({})).toThrow(/MAIL_FROM_ADDRESS/);
    expect(() => readCorreoEnv({})).toThrow(/MAIL_INNOVACION_ADDRESS/);
  });

  it("rejects a blank required variable as loudly as a missing one", () => {
    expect(() => readCorreoEnv({ ...complete, MAIL_API_KEY: "   " })).toThrow(/MAIL_API_KEY/);
  });

  it("never puts the api key in the error, because the error is a log line", () => {
    expect(() => readCorreoEnv({ ...complete, MAIL_FROM_ADDRESS: "" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("api-key") }),
    );
  });
});
