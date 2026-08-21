// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CAMPO_ARCHIVOS,
  TIMEOUT_MS,
  ejecutarEnServicio,
  readServicioEnv,
  rutaDeEjecucion,
} from "./servicio";

/**
 * The wire contract with the FastAPI service.
 *
 * These assertions are pinned to the SERVICE'S SOURCE, not to the ADRs — the
 * two disagree, and this suite is where that is recorded in a form that fails
 * when someone "corrects" the code back to the document.
 */

const ENV = { baseUrl: "http://procesadores.interno:8000", token: "s3cr3to" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the path", () => {
  /**
   * ADR 0006 and TECH-DESIGN both write `/interno/procesadores/{clave}/ejecutar`.
   * `app/recepcion.py` mounts `POST /procesadores/{clave_procesador}` under a
   * `/interno` mount — there is no `/ejecutar` segment. The service is what
   * answers requests, so the service is what this follows.
   */
  it("has no /ejecutar segment, matching the service and not the ADR", () => {
    expect(rutaDeEjecucion("maestro-excel")).toBe("/interno/procesadores/maestro-excel");
  });

  /**
   * `clave_procesador` is validated for format when an administrator writes it,
   * but this function is what splices a database value into a URL. Encoding it
   * means a row that predates that validation cannot reshape the request.
   */
  it("encodes the key rather than trusting the column", () => {
    expect(rutaDeEjecucion("../salud")).toBe("/interno/procesadores/..%2Fsalud");
  });
});

describe("the configuration", () => {
  it("names every missing variable at once", () => {
    expect(() => readServicioEnv({})).toThrow(
      /PROCESADORES_BASE_URL, PROCESADORES_SERVICE_TOKEN/,
    );
  });

  it("treats a blank value as missing", () => {
    expect(() =>
      readServicioEnv({ PROCESADORES_BASE_URL: "   ", PROCESADORES_SERVICE_TOKEN: "t" }),
    ).toThrow(/PROCESADORES_BASE_URL/);
  });

  /* `http://host/` + `/interno/...` would be `//interno/...`, which some
     proxies normalise and others answer 404 to. */
  it("removes a trailing slash so the variable can be written either way", () => {
    const env = readServicioEnv({
      PROCESADORES_BASE_URL: "http://procesadores.interno:8000/",
      PROCESADORES_SERVICE_TOKEN: "t",
    });

    expect(env.baseUrl).toBe("http://procesadores.interno:8000");
  });
});

describe("the request", () => {
  function espiarFetch() {
    const espia = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", espia);
    return espia;
  }

  function llamar(signal = AbortSignal.timeout(1000)) {
    return ejecutarEnServicio({
      clave: "maestro-excel",
      cuerpo: new ReadableStream(),
      contentType: "multipart/form-data; boundary=----abc",
      signal,
      env: ENV,
    });
  }

  it("posts to the service's own route", async () => {
    const fetch = espiarFetch();

    await llamar();

    expect(fetch.mock.calls[0][0]).toBe(
      "http://procesadores.interno:8000/interno/procesadores/maestro-excel",
    );
    expect(fetch.mock.calls[0][1].method).toBe("POST");
  });

  /** `AutenticacionDeBorde` refuses anything else, before reading the body. */
  it("authenticates with the service token as a bearer credential", async () => {
    const fetch = espiarFetch();

    await llamar();

    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer s3cr3to");
  });

  /**
   * The browser's own header, boundary included. Rebuilding it would mean
   * re-encoding the body, which is the whole thing this design avoids.
   */
  it("forwards the browser's Content-Type untouched", async () => {
    const fetch = espiarFetch();

    await llamar();

    expect(fetch.mock.calls[0][1].headers["Content-Type"]).toBe(
      "multipart/form-data; boundary=----abc",
    );
  });

  /** Without it, Node throws outright when the body is a stream. */
  it("declares the half-duplex body undici requires", async () => {
    const fetch = espiarFetch();

    await llamar();

    expect(fetch.mock.calls[0][1].duplex).toBe("half");
  });

  it("passes the caller's signal through, because the caller owns the clock", async () => {
    const fetch = espiarFetch();
    const signal = AbortSignal.timeout(5000);

    await llamar(signal);

    expect(fetch.mock.calls[0][1].signal).toBe(signal);
  });

  /**
   * Nothing is interpreted here. The route needs the raw status and the raw
   * headers, and `resultado.ts` is what decides what they mean.
   */
  it("returns the service's answer as it came", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    expect((await llamar()).status).toBe(503);
  });
});

describe("the two constants that are pinned to another repository", () => {
  /** `archivos: Annotated[list[UploadFile], File()]` in `app/recepcion.py`. */
  it("names the multipart field the way the service reads it", () => {
    expect(CAMPO_ARCHIVOS).toBe("archivos");
  });

  /**
   * `CORTE_DEL_PORTAL` in `app/core/configuracion.py` is two minutes, and the
   * service refuses to start unless its own timeout is strictly below it. This
   * is the portal's side of that agreement.
   */
  it("keeps the portal's deadline at the two minutes the service assumes", () => {
    expect(TIMEOUT_MS).toBe(120_000);
  });
});
