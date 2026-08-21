// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TIPOS_EVENTO } from "@/lib/eventos/repository";
import { TIPOS_ERROR_SERVICIO } from "@/lib/procesadores/resultado";

import { EVENTO_POR_TIPO, desenlaceDeFallo, envioInvalido } from "./ejecucion-errores";

/**
 * The portal's answer to a failed execution: a status, a stable `codigo`, a
 * Spanish sentence, and — sometimes — a row in `evento_uso`.
 *
 * The event mapping carries the most weight here. It is the part a future
 * change is most likely to get wrong, and the damage is invisible: item #19
 * reads `evento_uso` as the whole history of usage, and a misfiled row shows up
 * there as a problem that never happened.
 */

describe("each typed error becomes its own event", () => {
  it.each([
    ["formato", "error_formato"],
    ["tamano", "error_tamano"],
    ["contenido", "error_contenido"],
    ["cantidad", "error_cantidad"],
    ["clave_inexistente", "error_clave_inexistente"],
  ] as const)("records %s as %s", (tipo, evento) => {
    const { evento: registrado } = desenlaceDeFallo({ clase: "tipificado", tipo, contexto: {} });

    expect(registrado).toBe(evento);
  });
});

describe("the two that used to have none", () => {
  /**
   * The vocabulary originally stopped at the three errors ADR 0006 names in
   * passing, so these two arrived with nowhere to go and recorded nothing. The
   * migration `20260821143000_evento_uso_errores_tipificados_completos` widened
   * the CHECK constraint; these are the assertions that would have failed
   * before it.
   */
  it("records a refused count", () => {
    expect(EVENTO_POR_TIPO.cantidad).toBe("error_cantidad");
  });

  /**
   * The case that argued for the migration. A procesador whose
   * `clave_procesador` matches no module in the registry produces no
   * `ejecucion` and, before this, no error either — people try it, fail and
   * stop trying. Zero events reads in item #19 exactly like a procesador
   * nobody wants, and an administrator acting on that would retire the very
   * resource people were failing to use.
   */
  it("records a clave the service's registry does not have", () => {
    expect(EVENTO_POR_TIPO.clave_inexistente).toBe("error_clave_inexistente");
  });
});

describe("the mapping is total, and stays that way", () => {
  it("has an entry for every type the service can send", () => {
    expect(Object.keys(EVENTO_POR_TIPO).sort()).toEqual([...TIPOS_ERROR_SERVICIO].sort());
  });

  /** No branch may quietly drop an error on the floor again. */
  it("names an event for every one of them", () => {
    expect(Object.values(EVENTO_POR_TIPO).filter((evento) => evento === null)).toEqual([]);
  });

  /**
   * The guard against the tempting shortcut. A member the CHECK constraint
   * does not accept is rejected by SQL Server at write time, so this is the
   * assertion that fails first if someone adds a mapping without the migration
   * that makes it storable.
   */
  it("only ever names events the database actually accepts", () => {
    for (const evento of Object.values(EVENTO_POR_TIPO)) {
      expect(TIPOS_EVENTO).toContain(evento);
    }
  });

  /**
   * One event per typed error, never two errors sharing one. A shared member
   * would put back exactly the ambiguity the widening removed: item #19 could
   * no longer tell which of the two problems it is reporting.
   */
  it("gives each error its own event rather than sharing one", () => {
    const eventos = Object.values(EVENTO_POR_TIPO);

    expect(new Set(eventos).size).toBe(eventos.length);
  });
});

describe("the statuses", () => {
  /**
   * 422 and not 400 for the four the collaborator can act on: the request was
   * well formed, parsed, authorised and reached the service. What failed is the
   * content of the files — and 422 is the status the service itself answers, so
   * the two hops agree instead of translating.
   */
  it.each(["formato", "tamano", "contenido", "cantidad"] as const)(
    "answers 422 for %s",
    (tipo) => {
      const { falla } = desenlaceDeFallo({ clase: "tipificado", tipo, contexto: {} });

      expect(falla.status).toBe(422);
    },
  );

  /** The portal is fine; the thing it depends on is not configured for this. */
  it("answers 502 for a registry key that does not exist", () => {
    const { falla } = desenlaceDeFallo({
      clase: "tipificado",
      tipo: "clave_inexistente",
      contexto: {},
    });

    expect(falla.status).toBe(502);
  });

  it.each([
    ["saturado", 503],
    ["expirado", 504],
    ["inalcanzable", 502],
    ["fallo_interno", 502],
    ["no_autenticado", 502],
    ["peticion_invalida", 502],
    ["respuesta_inesperada", 502],
  ] as const)("answers %s with %i", (motivo, status) => {
    const { falla } = desenlaceDeFallo({ clase: "infraestructura", motivo });

    expect(falla.status).toBe(status);
  });
});

describe("no infrastructure failure is ever recorded as usage", () => {
  it.each([
    "saturado",
    "expirado",
    "inalcanzable",
    "fallo_interno",
    "no_autenticado",
    "peticion_invalida",
    "respuesta_inesperada",
  ] as const)("writes no row for %s", (motivo) => {
    expect(desenlaceDeFallo({ clase: "infraestructura", motivo }).evento).toBeNull();
  });
});

describe("what the reader is told", () => {
  /**
   * The temptation is to collapse the seven into one "algo salió mal". The
   * reader's next action differs — wait, retry now, send something smaller, or
   * stop and report it — so a single message would make most of them do the
   * wrong thing.
   */
  it("gives every infrastructure failure its own sentence", () => {
    const motivos = [
      "saturado",
      "expirado",
      "inalcanzable",
      "fallo_interno",
      "no_autenticado",
      "peticion_invalida",
      "respuesta_inesperada",
    ] as const;

    const mensajes = motivos.map(
      (motivo) => desenlaceDeFallo({ clase: "infraestructura", motivo }).falla.error.mensaje,
    );

    expect(new Set(mensajes).size).toBe(motivos.length);
  });

  /**
   * DESIGN.md: "lenguaje claro sin códigos". `codigo` is the handle the UI may
   * branch on; it is never rendered, and no message may carry one.
   */
  it("keeps technical codes out of the prose", () => {
    const { falla } = desenlaceDeFallo({ clase: "infraestructura", motivo: "fallo_interno" });

    expect(falla.error.codigo).toBe("fallo_del_servicio");
    expect(falla.error.mensaje).not.toContain("fallo_del_servicio");
    expect(falla.error.mensaje).not.toMatch(/\b(500|502|HTTP)\b/);
  });

  it("uses the shared vocabulary for a typed error rather than writing its own", () => {
    const { falla } = desenlaceDeFallo({
      clase: "tipificado",
      tipo: "cantidad",
      contexto: { minimo: 1, maximo: 3, recibido: 5 },
    });

    expect(falla.error.mensaje).toContain("entre 1 y 3 archivos");
  });
});

describe("the failure that never reaches the service", () => {
  /** Unreachable from the portal's own form: this one really is malformed. */
  it("answers 400 when the body was not multipart", () => {
    expect(envioInvalido().status).toBe(400);
  });
});
