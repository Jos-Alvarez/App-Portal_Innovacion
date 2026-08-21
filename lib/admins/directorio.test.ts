// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { DirectorioEnv } from "@/lib/admins/directorio-env";
import {
  GRAPH_SCOPE,
  buscarEnDirectorio,
  filtroDeBusqueda,
  mapearPersona,
  tokenUrl,
} from "@/lib/admins/directorio";

/**
 * The Graph half of the directory search.
 *
 * The contract this file exists to protect is the OPPOSITE of
 * `lib/auth/graph.ts`: that one is total and swallows everything, because a
 * missing department must never block a login. This one throws for every
 * failure, because the caller has to tell "nobody matched" from "the directory
 * could not be asked" — the first is an empty list and the second is ADR 0009's
 * degradation.
 */

const ENV: DirectorioEnv = {
  tenantId: "tenant-abc",
  clientId: "cliente-123",
  clientSecret: "secreto",
};

function respuesta(cuerpo: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

/** Answers the token request first, then the search. */
function fetchDoble(busqueda: Response | Error, token: Response = respuesta({ access_token: "t" })) {
  return vi.fn(async (url: URL | RequestInfo) => {
    const href = url instanceof URL ? url.href : String(url);

    if (href.includes("oauth2")) {
      return token;
    }

    if (busqueda instanceof Error) {
      throw busqueda;
    }

    return busqueda;
  });
}

describe("tokenUrl", () => {
  it("apunta al endpoint del tenant, nunca a /common", () => {
    expect(tokenUrl("tenant-abc")).toBe(
      "https://login.microsoftonline.com/tenant-abc/oauth2/v2.0/token",
    );
  });

  it("escapa el tenant en la ruta", () => {
    expect(tokenUrl("a b")).toContain("a%20b");
  });
});

describe("filtroDeBusqueda", () => {
  it("busca por nombre, correo y UPN", () => {
    const filtro = filtroDeBusqueda("ana");

    expect(filtro).toContain("startswith(displayName,'ana')");
    expect(filtro).toContain("startswith(mail,'ana')");
    expect(filtro).toContain("startswith(userPrincipalName,'ana')");
  });

  /** OData string literals are single-quoted; a quote inside one is doubled. */
  it("duplica las comillas simples del término", () => {
    expect(filtroDeBusqueda("O'Brien")).toContain("startswith(displayName,'O''Brien')");
  });
});

describe("mapearPersona", () => {
  it("prefiere `mail` y normaliza como el login", () => {
    expect(mapearPersona({ displayName: "Ana", mail: "Ana@Corp.com", department: "TI" })).toEqual({
      correo: "ana@corp.com",
      nombre: "Ana",
      area: "TI",
    });
  });

  /**
   * The same order `selectIdentityEmail` applies to the id_token claims — and it
   * has to be: this address keys the row the sign-in will later upsert.
   */
  it("cae al UPN cuando no hay `mail`", () => {
    expect(mapearPersona({ displayName: "Ana", userPrincipalName: "ana@corp.com" })?.correo).toBe(
      "ana@corp.com",
    );
  });

  it("descarta una fila sin dirección usable", () => {
    expect(mapearPersona({ displayName: "Sala de reuniones" })).toBeNull();
  });

  it("usa la dirección como nombre cuando el directorio no da uno", () => {
    expect(mapearPersona({ mail: "ana@corp.com" })?.nombre).toBe("ana@corp.com");
  });

  it("deja el área vacía cuando no hay departamento", () => {
    expect(mapearPersona({ mail: "ana@corp.com" })?.area).toBe("");
  });
});

describe("buscarEnDirectorio", () => {
  it("pide un token de aplicación con las credenciales del login", async () => {
    const fetchImpl = fetchDoble(respuesta({ value: [] }));

    await buscarEnDirectorio("ana", { env: ENV, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const cuerpo = String(init.body);

    expect(url).toContain("oauth2/v2.0/token");
    expect(cuerpo).toContain("grant_type=client_credentials");
    expect(cuerpo).toContain(`scope=${encodeURIComponent(GRAPH_SCOPE)}`);
  });

  it("consulta el directorio con el token recién pedido", async () => {
    const fetchImpl = fetchDoble(respuesta({ value: [] }), respuesta({ access_token: "abc" }));

    await buscarEnDirectorio("ana", { env: ENV, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[1] as unknown as [URL, RequestInit];

    expect(url.href).toContain("graph.microsoft.com/v1.0/users");
    expect(url.searchParams.get("$filter")).toContain("startswith(displayName,'ana')");
    expect(url.searchParams.get("$select")).toBe("displayName,mail,userPrincipalName,department");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });

  it("acota cuántas filas pide", async () => {
    const fetchImpl = fetchDoble(respuesta({ value: [] }));

    await buscarEnDirectorio("ana", { env: ENV, fetchImpl, limite: 5 });

    const [url] = fetchImpl.mock.calls[1] as unknown as [URL];

    expect(url.searchParams.get("$top")).toBe("5");
  });

  it("devuelve las personas mapeadas y descarta las que no tienen dirección", async () => {
    const fetchImpl = fetchDoble(
      respuesta({
        value: [
          { displayName: "Ana", mail: "ana@corp.com", department: "TI" },
          { displayName: "Sala 3" },
        ],
      }),
    );

    expect(await buscarEnDirectorio("a", { env: ENV, fetchImpl })).toEqual([
      { correo: "ana@corp.com", nombre: "Ana", area: "TI" },
    ]);
  });

  it("no confunde «nadie coincide» con un fallo", async () => {
    const fetchImpl = fetchDoble(respuesta({ value: [] }));

    await expect(buscarEnDirectorio("zzz", { env: ENV, fetchImpl })).resolves.toEqual([]);
  });

  /**
   * The permission TI may never have consented to. It has to throw: answering
   * with an empty list would turn an unconsented permission into "esa persona no
   * existe" and hide the degradation from the screen.
   */
  it("lanza cuando Graph responde 403 por falta de consentimiento", async () => {
    const fetchImpl = fetchDoble(respuesta({ error: {} }, { status: 403 }));

    await expect(buscarEnDirectorio("ana", { env: ENV, fetchImpl })).rejects.toThrow(/403/);
  });

  it("lanza cuando el token es rechazado", async () => {
    const fetchImpl = fetchDoble(respuesta({ value: [] }), respuesta({}, { status: 401 }));

    await expect(buscarEnDirectorio("ana", { env: ENV, fetchImpl })).rejects.toThrow(/401/);
  });

  it("lanza cuando la respuesta del token no trae access_token", async () => {
    const fetchImpl = fetchDoble(respuesta({ value: [] }), respuesta({ token_type: "Bearer" }));

    await expect(buscarEnDirectorio("ana", { env: ENV, fetchImpl })).rejects.toThrow(
      /access_token/,
    );
  });

  it("lanza cuando el cuerpo no trae una lista", async () => {
    const fetchImpl = fetchDoble(respuesta({ value: "muchos" }));

    await expect(buscarEnDirectorio("ana", { env: ENV, fetchImpl })).rejects.toThrow(/list of users/);
  });

  it("deja pasar el fallo de red sin convertirlo en una lista vacía", async () => {
    const fetchImpl = fetchDoble(new Error("ECONNREFUSED"));

    await expect(buscarEnDirectorio("ana", { env: ENV, fetchImpl })).rejects.toThrow(
      "ECONNREFUSED",
    );
  });

  /** An administrator is watching a search field; an unbounded fetch is a spinner. */
  it("corta la espera con un AbortSignal", async () => {
    const fetchImpl = fetchDoble(respuesta({ value: [] }));

    await buscarEnDirectorio("ana", { env: ENV, fetchImpl });

    const [, init] = fetchImpl.mock.calls[1] as unknown as [URL, RequestInit];

    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  /** The error message reaches a server log. */
  it("no filtra el secreto en el mensaje de error", async () => {
    const fetchImpl = fetchDoble(respuesta({}, { status: 500 }));

    await expect(buscarEnDirectorio("ana", { env: ENV, fetchImpl })).rejects.not.toThrow(
      /secreto/,
    );
  });
});
