// @vitest-environment node
import { describe, expect, it } from "vitest";

import { crearSugerenciaSchema } from "./schema";
import { autorNoEncontrado, ERROR_INTERNO, errorDePrisma, errorDeValidacion } from "./errors";

/**
 * The mapping from "something went wrong" to "a sentence the collaborator can
 * act on".
 *
 * The rejections are produced by the REAL schema rather than by hand-built
 * `ZodError`s, so these tests break if the schema's issue paths ever change
 * shape — which is exactly the coupling that keeps the messages pointing at the
 * right fields.
 */

const VALIDA = {
  titulo: "Tablero de peajes",
  descripcion: "Ver el flujo por caseta sin exportar a Excel.",
  areaDestino: "Operaciones",
};

/** The `ApiFailure` the schema produces for a body with one bad field. */
function falloDe(cuerpo: unknown) {
  const resultado = crearSugerenciaSchema.safeParse(cuerpo);

  if (resultado.success) throw new Error("El cuerpo de prueba debía ser inválido.");

  return errorDeValidacion(resultado.error);
}

describe("errorDeValidacion", () => {
  it.each([
    ["titulo", "titulo_invalido"],
    ["descripcion", "descripcion_invalida"],
    ["areaDestino", "area_destino_invalida"],
  ] as const)("nombra el campo «%s» con su propio código", (campo, codigo) => {
    const fallo = falloDe({ ...VALIDA, [campo]: "" });

    expect(fallo.status).toBe(400);
    expect(fallo.error.codigo).toBe(codigo);
  });

  /**
   * Ausente, vacío y demasiado largo son UN problema para quien llena el
   * formulario — este campo está mal — y se contestan con la misma frase. Es lo
   * que mantiene el copy corto y garantiza que ningún texto de zod se filtre por
   * pasar de largo.
   */
  it.each(["titulo", "descripcion", "areaDestino"] as const)(
    "contesta lo mismo a «%s» ausente, vacío o pasado de largo",
    (campo) => {
      const sinCampo: Record<string, unknown> = { ...VALIDA };
      delete sinCampo[campo];

      const ausente = falloDe(sinCampo);
      const vacio = falloDe({ ...VALIDA, [campo]: "" });
      const largo = falloDe({ ...VALIDA, [campo]: "a".repeat(10_000) });

      expect(vacio).toEqual(ausente);
      expect(largo).toEqual(ausente);
    },
  );

  it("contesta 400 genérico cuando el cuerpo no es una sugerencia en absoluto", () => {
    const fallo = falloDe("una idea suelta");

    expect(fallo.status).toBe(400);
    expect(fallo.error.codigo).toBe("datos_invalidos");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  NINGÚN TEXTO DE ZOD LLEGA AL NAVEGADOR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * zod habla en inglés y en jerga — "Invalid input", "Too big: expected string
   * to have <=200 characters" — y DESIGN.md pide justo lo contrario: "copys en
   * español, directos, sin jerga técnica". El mapeo va en un solo sentido: se
   * reconoce el fallo y se reemplaza, nunca se reenvía.
   */
  it("no reenvía nunca el mensaje de la librería de validación", () => {
    const cuerposMalos: unknown[] = [
      { ...VALIDA, titulo: "" },
      { ...VALIDA, descripcion: "a".repeat(10_000) },
      { ...VALIDA, areaDestino: 42 },
      undefined,
      [],
    ];

    for (const cuerpo of cuerposMalos) {
      const { mensaje } = falloDe(cuerpo).error;

      expect(mensaje).not.toMatch(/invalid|expected|string|required|too big|too small/i);
      /* Una frase en español, no un token: termina en punto y trae espacios. */
      expect(mensaje).toMatch(/\s/);
      expect(mensaje.endsWith(".")).toBe(true);
    }
  });

  /** Los topes del mensaje salen de las mismas constantes que la regla. */
  it("dice el tope real de cada campo", () => {
    expect(falloDe({ ...VALIDA, titulo: "" }).error.mensaje).toContain("200");
    expect(falloDe({ ...VALIDA, areaDestino: "" }).error.mensaje).toContain("120");
  });
});

describe("errorDePrisma", () => {
  /**
   * P2003 es la clave foránea de `autor_id`, la única que este insert toca: la
   * entrada del historial que anida apunta a la fila que se está creando. Que
   * sea 409 y no 500 importa — no hay nada roto, el mundo cambió debajo de una
   * petición que era válida, y volver a iniciar sesión es un arreglo real.
   */
  it("traduce P2003 a «tu cuenta ya no está activa», con 409", () => {
    const fallo = errorDePrisma({ code: "P2003" });

    expect(fallo).toEqual(autorNoEncontrado());
    expect(fallo.status).toBe(409);
  });

  it("manda todo lo demás al error interno", () => {
    expect(errorDePrisma({ code: "P2025" })).toEqual(ERROR_INTERNO);
    expect(errorDePrisma({ code: "P1001" })).toEqual(ERROR_INTERNO);
    expect(errorDePrisma(new Error("connection reset"))).toEqual(ERROR_INTERNO);
    expect(errorDePrisma(undefined)).toEqual(ERROR_INTERNO);
    expect(errorDePrisma(null)).toEqual(ERROR_INTERNO);
    expect(errorDePrisma({ code: 42 })).toEqual(ERROR_INTERNO);
  });

  /**
   * NO HAY RAMA PARA P2002, Y ES DELIBERADO. `sugerencia` no tiene ninguna
   * restricción única y no debe ganar una: dos personas con la misma idea, o una
   * que la manda dos veces, es información que el Área de Innovación quiere. El
   * ítem #16 existe para AGRUPAR duplicados, no para impedirlos.
   */
  it("no inventa un «duplicado»: P2002 cae en el error interno como cualquier otro", () => {
    expect(errorDePrisma({ code: "P2002" })).toEqual(ERROR_INTERNO);
  });

  /**
   * El peor final posible de un envío fallido es que la persona crea que su idea
   * quedó guardada. El mensaje lo dice con todas las letras.
   */
  it("deja claro que no se guardó nada cuando el envío falla", () => {
    expect(ERROR_INTERNO.status).toBe(500);
    expect(ERROR_INTERNO.error.mensaje).toMatch(/no se guardó nada/i);
  });

  it("no filtra nombres de tabla, códigos de Prisma ni números de SQL Server", () => {
    const mensajes = [
      ERROR_INTERNO.error.mensaje,
      autorNoEncontrado().error.mensaje,
      errorDePrisma({ code: "P2003", meta: { field_name: "sugerencia_autor_id_fkey" } }).error
        .mensaje,
    ];

    for (const mensaje of mensajes) {
      expect(mensaje).not.toMatch(/P\d{4}|fkey|sugerencia_|NVARCHAR|prisma/i);
    }
  });
});
