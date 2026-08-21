// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { type BuscarPersonasDeps, buscarPersonas, combinar, desdeElPortal } from "@/lib/admins/busqueda";
import type { PersonaDirectorio } from "@/lib/admins/directorio";
import type { PersonaDelPortal } from "@/lib/admins/repository";
import { RESULTADOS_MAX } from "@/lib/admins/schema";

/**
 * The degradation of ADR 0009, and the only place it is decided.
 *
 * Every dependency is injected, exactly as in `lib/authz/authorize.ts`, so what
 * is exercised here is the real branching — which source answered, what happens
 * when one of them fails, and how the two lists are merged — rather than a mock
 * of Microsoft Graph.
 */

const ANA: PersonaDirectorio = { correo: "ana@corp.com", nombre: "Ana Quispe", area: "TI" };
const BETO: PersonaDirectorio = { correo: "beto@corp.com", nombre: "Beto Ruiz", area: "Legal" };

const FILA_ANA: PersonaDelPortal = {
  id: 7,
  nombre: "Ana Q.",
  correo: "ana@corp.com",
  area: "Innovación",
  activo: true,
  esAdmin: true,
};

function deps(overrides: Partial<BuscarPersonasDeps> = {}): BuscarPersonasDeps {
  return {
    buscarEnDirectorio: vi.fn(async () => [ANA]),
    leerPortalPorCorreos: vi.fn(async () => []),
    buscarEnPortal: vi.fn(async () => []),
    dominioCorporativo: "corp.com",
    onDegradacion: vi.fn(),
    ...overrides,
  };
}

describe("combinar", () => {
  it("cuelga de cada persona lo que el portal ya sabe de ella", () => {
    expect(combinar([ANA], [FILA_ANA])[0].enElPortal).toEqual({
      id: 7,
      esAdmin: true,
      activo: true,
    });
  });

  it("deja `enElPortal` en null para quien nunca entró", () => {
    expect(combinar([BETO], [FILA_ANA])[0].enElPortal).toBeNull();
  });

  /**
   * The directory is the company's own record; the `usuario` row is a copy taken
   * at that person's last sign-in and can be months out of date after a rename.
   */
  it("se queda con el nombre y el área del directorio, no con la copia del portal", () => {
    const [persona] = combinar([ANA], [FILA_ANA]);

    expect(persona.nombre).toBe("Ana Quispe");
    expect(persona.area).toBe("TI");
  });

  it("ordena por nombre", () => {
    expect(combinar([BETO, ANA], []).map((persona) => persona.nombre)).toEqual([
      "Ana Quispe",
      "Beto Ruiz",
    ]);
  });

  it("empareja sin distinguir mayúsculas", () => {
    const fila = { ...FILA_ANA, correo: "ANA@CORP.COM" };

    expect(combinar([ANA], [fila])[0].enElPortal).not.toBeNull();
  });
});

describe("desdeElPortal", () => {
  it("da la misma forma que el directorio, con la fila siempre presente", () => {
    expect(desdeElPortal([FILA_ANA])).toEqual([
      {
        correo: "ana@corp.com",
        nombre: "Ana Q.",
        area: "Innovación",
        enElPortal: { id: 7, esAdmin: true, activo: true },
      },
    ]);
  });
});

describe("buscarPersonas", () => {
  it("usa el directorio cuando puede y lo dice", async () => {
    const resultado = await buscarPersonas("ana", deps());

    expect(resultado.origen).toBe("directorio");
    expect(resultado.personas).toHaveLength(1);
  });

  it("consulta el portal por las direcciones que el directorio devolvió", async () => {
    const leerPortalPorCorreos = vi.fn(async () => []);

    await buscarPersonas("ana", deps({ leerPortalPorCorreos }));

    expect(leerPortalPorCorreos).toHaveBeenCalledWith(["ana@corp.com"]);
  });

  /**
   * ADR 0009's mitigation, and the reason `directorio.ts` throws for everything:
   * this is the one place that turns a failure into a different answer.
   */
  it("cae a las personas que ya entraron cuando el directorio falla", async () => {
    const buscarEnPortal = vi.fn(async () => [FILA_ANA]);
    const resultado = await buscarPersonas(
      "ana",
      deps({
        buscarEnDirectorio: vi.fn(async () => {
          throw new Error("403");
        }),
        buscarEnPortal,
      }),
    );

    expect(resultado.origen).toBe("portal");
    expect(resultado.personas[0].correo).toBe("ana@corp.com");
    expect(buscarEnPortal).toHaveBeenCalledWith("ana");
  });

  it("no lanza cuando el directorio no está configurado", async () => {
    await expect(
      buscarPersonas(
        "ana",
        deps({
          buscarEnDirectorio: vi.fn(async () => {
            throw new Error("Missing required environment variable(s)");
          }),
        }),
      ),
    ).resolves.toMatchObject({ origen: "portal" });
  });

  it("avisa por qué degradó, para que quede en el log", async () => {
    const onDegradacion = vi.fn();
    const fallo = new Error("403");

    await buscarPersonas(
      "ana",
      deps({
        buscarEnDirectorio: vi.fn(async () => {
          throw fallo;
        }),
        onDegradacion,
      }),
    );

    expect(onDegradacion).toHaveBeenCalledWith(fallo);
  });

  it("no consulta el portal por correos cuando ya degradó", async () => {
    const leerPortalPorCorreos = vi.fn(async () => []);

    await buscarPersonas(
      "ana",
      deps({
        buscarEnDirectorio: vi.fn(async () => {
          throw new Error("403");
        }),
        leerPortalPorCorreos,
      }),
    );

    expect(leerPortalPorCorreos).not.toHaveBeenCalled();
  });

  /**
   * A guest in the tenant cannot sign in to this portal, so offering to promote
   * them would end in a refusal the reader could not have predicted.
   */
  it("descarta a quien no es del dominio corporativo", async () => {
    const invitada = { correo: "ana@otra.com", nombre: "Ana Externa", area: "" };
    const resultado = await buscarPersonas(
      "ana",
      deps({ buscarEnDirectorio: vi.fn(async () => [ANA, invitada]) }),
    );

    expect(resultado.personas.map((persona) => persona.correo)).toEqual(["ana@corp.com"]);
  });

  /**
   * A courtesy, not the rule: the promotion route applies the domain check
   * itself and fails closed, so an unset domain can at worst widen this list.
   */
  it("no filtra nada cuando el dominio no está configurado", async () => {
    const invitada = { correo: "ana@otra.com", nombre: "Ana Externa", area: "" };
    const resultado = await buscarPersonas(
      "ana",
      deps({
        dominioCorporativo: "",
        buscarEnDirectorio: vi.fn(async () => [ANA, invitada]),
      }),
    );

    expect(resultado.personas).toHaveLength(2);
  });

  it("acota los resultados del directorio", async () => {
    const muchas = Array.from({ length: RESULTADOS_MAX + 5 }, (_unused, indice) => ({
      correo: `p${indice}@corp.com`,
      nombre: `Persona ${indice}`,
      area: "",
    }));

    const resultado = await buscarPersonas(
      "p",
      deps({ buscarEnDirectorio: vi.fn(async () => muchas) }),
    );

    expect(resultado.personas).toHaveLength(RESULTADOS_MAX);
  });

  /**
   * With both sources down there is nothing left to degrade to, so this really
   * is a failure the route reports as a 500.
   */
  it("deja pasar el fallo de la base de datos", async () => {
    await expect(
      buscarPersonas(
        "ana",
        deps({
          buscarEnDirectorio: vi.fn(async () => {
            throw new Error("403");
          }),
          buscarEnPortal: vi.fn(async () => {
            throw new Error("SQL Server no responde");
          }),
        }),
      ),
    ).rejects.toThrow("SQL Server no responde");
  });
});
