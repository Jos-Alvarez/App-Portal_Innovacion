import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ERROR_DE_RED,
  NOMBRE_POR_DEFECTO,
  contratoDe,
  ejecutarProcesador,
  extensionDe,
  nombreDeDescarga,
  revisarSeleccion,
} from "./ejecutar-client";

/**
 * The browser's half of an execution.
 *
 * The local check gets the most attention here, and its tests are written
 * around one asymmetry: it may refuse only what the service would certainly
 * have refused. Accepting something the service will reject costs an upload;
 * refusing something the service would have accepted locks a collaborator out
 * of a resource that works. The suite therefore tests the accepting cases as
 * hard as the refusing ones.
 */

const MIB = 1024 * 1024;

/** A file of a given size without allocating it: only `size` is ever read. */
function archivo(nombre: string, bytes = 1024): File {
  const file = new File(["x"], nombre);
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

const CONTRATO = {
  entradasMin: 1,
  entradasMax: 3,
  tamanoMax: 25 * MIB,
  tamanoMaxTotal: 40 * MIB,
  formatos: ["xlsx", "csv"] as const,
};

describe("the contract comes from the row and nowhere else", () => {
  it("splits the stored format list into the one the form uses", () => {
    const contrato = contratoDe({
      id: 1,
      nombre: "Maestro",
      descripcion: null,
      claveProcesador: "maestro-excel",
      formatosAceptados: "xlsx,csv",
      tamanoMax: 25 * MIB,
      entradasMin: 1,
      entradasMax: null,
      tamanoMaxTotal: null,
      salidaEsperada: "archivo",
      activo: true,
    });

    expect(contrato.formatos).toEqual(["xlsx", "csv"]);
    /* ADR 0002 reads NULL as "sin tope", which is an absence of a bound and
       not a bound of zero. */
    expect(contrato.entradasMax).toBeNull();
    expect(contrato.tamanoMaxTotal).toBeNull();
  });
});

describe("the extension is computed exactly as the service computes it", () => {
  /**
   * `_formato` in `app/recepcion.py` splits on the LAST dot. A local check that
   * read `datos.tar.gz` as `tar.gz` would refuse an upload the service accepts
   * — the one direction this check must never fail in.
   */
  it("takes everything after the last dot, lowercased", () => {
    expect(extensionDe("Datos.XLSX")).toBe("xlsx");
    expect(extensionDe("datos.tar.gz")).toBe("gz");
  });

  it("returns nothing for a name with no dot", () => {
    expect(extensionDe("datos")).toBe("");
  });
});

describe("the local check refuses what the service would refuse", () => {
  it("catches too few files", () => {
    const mensaje = revisarSeleccion([], { ...CONTRATO, entradasMin: 2 });

    expect(mensaje).toContain("entre 2 y 3 archivos");
  });

  it("catches too many", () => {
    const seleccion = [archivo("a.xlsx"), archivo("b.xlsx"), archivo("c.xlsx"), archivo("d.xlsx")];

    expect(revisarSeleccion(seleccion, CONTRATO)).toContain("enviaste 4");
  });

  it("catches a format the row does not declare", () => {
    expect(revisarSeleccion([archivo("ventas.pdf")], CONTRATO)).toContain("«ventas.pdf»");
  });

  it("catches a file over the per-file cap", () => {
    const mensaje = revisarSeleccion([archivo("grande.xlsx", 26 * MIB)], CONTRATO);

    expect(mensaje).toContain("máximo por archivo");
  });

  it("catches a set over the combined cap", () => {
    const seleccion = [archivo("a.xlsx", 24 * MIB), archivo("b.xlsx", 20 * MIB)];

    const mensaje = revisarSeleccion(seleccion, CONTRATO);

    expect(mensaje).toContain("Los archivos suman");
  });

  /**
   * The order mirrors the pipeline — count, format, per-file size, total — so
   * the first thing the reader is told locally is the first thing they would
   * have been told remotely.
   */
  it("reports the count before the format when both are wrong", () => {
    const seleccion = [archivo("a.pdf"), archivo("b.pdf"), archivo("c.pdf"), archivo("d.pdf")];

    expect(revisarSeleccion(seleccion, CONTRATO)).toContain("archivos");
    expect(revisarSeleccion(seleccion, CONTRATO)).not.toContain("«a.pdf»");
  });

  /**
   * Two detectors, one vocabulary. A local sentence that read differently from
   * the service's would teach the reader that they are different problems.
   */
  it("uses the same words the service's error would have produced", () => {
    const mensaje = revisarSeleccion([archivo("ventas.pdf")], CONTRATO);

    expect(mensaje).toContain("solo acepta xlsx, csv");
  });
});

describe("the local check grants nothing, and never over-refuses", () => {
  it("accepts a valid selection", () => {
    expect(revisarSeleccion([archivo("ventas.xlsx")], CONTRATO)).toBeNull();
  });

  it("accepts any number of files when the row declares no maximum", () => {
    const muchos = Array.from({ length: 9 }, (_, i) => archivo(`a${i}.xlsx`));

    expect(revisarSeleccion(muchos, { ...CONTRATO, entradasMax: null })).toBeNull();
  });

  it("accepts any total when the row declares no combined cap", () => {
    const seleccion = [archivo("a.xlsx", 24 * MIB), archivo("b.xlsx", 24 * MIB)];

    expect(revisarSeleccion(seleccion, { ...CONTRATO, tamanoMaxTotal: null })).toBeNull();
  });

  /** An empty list is not "accept nothing": it is a row that declares nothing. */
  it("does not judge formats when the row declares none", () => {
    expect(revisarSeleccion([archivo("ventas.pdf")], { ...CONTRATO, formatos: [] })).toBeNull();
  });

  it("accepts a file exactly at the cap", () => {
    expect(revisarSeleccion([archivo("justo.xlsx", 25 * MIB)], CONTRATO)).toBeNull();
  });
});

describe("the file name is read from Content-Disposition", () => {
  it("reads the quoted form", () => {
    expect(nombreDeDescarga('attachment; filename="salida.xlsx"')).toBe("salida.xlsx");
  });

  /** Starlette adds the RFC 5987 form for a name Spanish is full of. */
  it("prefers the encoded form when both are present", () => {
    const cabecera =
      "attachment; filename=\"salida.xlsx\"; filename*=utf-8''informe%20de%20gesti%C3%B3n.xlsx";

    expect(nombreDeDescarga(cabecera)).toBe("informe de gestión.xlsx");
  });

  it("falls back when the service named no file", () => {
    expect(nombreDeDescarga(null)).toBe(NOMBRE_POR_DEFECTO);
    expect(nombreDeDescarga("attachment")).toBe(NOMBRE_POR_DEFECTO);
  });

  /* The value came from a file somebody uploaded; a name is a name. */
  it("strips anything that looks like a path", () => {
    expect(nombreDeDescarga('attachment; filename="../../etc/passwd"')).toBe("....etcpasswd");
  });

  it("survives a percent sequence that is not valid encoding", () => {
    expect(nombreDeDescarga("attachment; filename*=utf-8''100%")).toBe("100%");
  });
});

describe("sending the files", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respuestaConArchivo() {
    return new Response("bytes", {
      status: 200,
      headers: { "content-disposition": 'attachment; filename="salida.xlsx"' },
    });
  }

  it("posts to the portal's route, never to the service", async () => {
    vi.mocked(fetch).mockResolvedValue(respuestaConArchivo());

    await ejecutarProcesador(7, [archivo("a.xlsx")]);

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/procesadores/7/ejecutar");
  });

  /**
   * The route forwards the body untouched, so this field name is the name the
   * service reads. `lib/procesadores/servicio.ts` owns the constant and
   * explains the coupling.
   */
  it("sends every file under the shared field name", async () => {
    vi.mocked(fetch).mockResolvedValue(respuestaConArchivo());

    await ejecutarProcesador(7, [archivo("a.xlsx"), archivo("b.xlsx")]);

    const cuerpo = vi.mocked(fetch).mock.calls[0][1]?.body as FormData;

    expect(cuerpo.getAll("archivos")).toHaveLength(2);
  });

  it("returns the file and the name it should be saved under", async () => {
    vi.mocked(fetch).mockResolvedValue(respuestaConArchivo());

    const resultado = await ejecutarProcesador(7, [archivo("a.xlsx")]);

    expect(resultado.ok && resultado.nombre).toBe("salida.xlsx");
  });

  /**
   * Every failing status this route produces carries ADR 0003's message, and it
   * is written for the reader. Replacing it with a message of our own would
   * throw away the specific reason the whole error contract exists to carry.
   */
  it("shows the message the route sent", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ codigo: "formato_no_permitido", mensaje: "El archivo «x» es .pdf." }), {
        status: 422,
      }),
    );

    const resultado = await ejecutarProcesador(7, [archivo("a.pdf")]);

    expect(resultado).toEqual({ ok: false, mensaje: "El archivo «x» es .pdf." });
  });

  it("falls back when the failing answer carries no message", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("<html>gateway</html>", { status: 502 }));

    const resultado = await ejecutarProcesador(7, [archivo("a.xlsx")]);

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.mensaje).toContain("Área de Innovación");
  });

  it("reports a dropped connection as one", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await ejecutarProcesador(7, [archivo("a.xlsx")])).toEqual({
      ok: false,
      mensaje: ERROR_DE_RED,
    });
  });

  /** A 200 whose body cannot be read is an empty file and a false confirmation. */
  it("does not report success for a body it could not read", async () => {
    const rota = new Response("bytes", { status: 200 });
    vi.spyOn(rota, "blob").mockRejectedValue(new Error("stream cortado"));
    vi.mocked(fetch).mockResolvedValue(rota);

    expect((await ejecutarProcesador(7, [archivo("a.xlsx")])).ok).toBe(false);
  });

  /**
   * NO SECOND CLOCK. The route already aborts at two minutes; a timer here
   * would either cut an execution the server is still finishing — leaving its
   * `evento_uso` row written for a file nobody receives — or never be reached.
   */
  it("sets no timeout of its own", async () => {
    vi.mocked(fetch).mockResolvedValue(respuestaConArchivo());

    await ejecutarProcesador(7, [archivo("a.xlsx")]);

    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeUndefined();
  });
});
