import { describe, expect, it } from "vitest";

import { ETIQUETA_TIPO, TONO_TIPO } from "@/lib/enlaces/etiquetas";

import { ETIQUETA_RECURSO, TONO_RECURSO, saludo } from "./etiquetas";

/**
 * The dashboard's vocabulary of three, and the one promise it makes: an
 * `enlace` is named and coloured here exactly as the administrator who created
 * it sees it named and coloured in the catalogue.
 */

describe("el vocabulario del dashboard", () => {
  it("nombra los tres tipos que el colaborador puede tener asignados", () => {
    expect(Object.keys(ETIQUETA_RECURSO).sort()).toEqual(["agente", "app", "procesador"]);
    expect(Object.keys(TONO_RECURSO).sort()).toEqual(["agente", "app", "procesador"]);
  });

  it("usa las mismas palabras que el catálogo para app y agente", () => {
    /* Two screens naming the same stored value differently is the drift
       `lib/enlaces/etiquetas.ts` was written to prevent. */
    expect(ETIQUETA_RECURSO.app).toBe(ETIQUETA_TIPO.app);
    expect(ETIQUETA_RECURSO.agente).toBe(ETIQUETA_TIPO.agente);
    expect(TONO_RECURSO.app).toBe(TONO_TIPO.app);
    expect(TONO_RECURSO.agente).toBe(TONO_TIPO.agente);
  });

  it("reserva el violeta para el agente de IA, como manda DESIGN.md", () => {
    expect(TONO_RECURSO.agente).toBe("agent");
  });

  it("da al procesador el navy, el tono de marca que queda libre", () => {
    /* DESIGN.md no le asigna color: ok, warn y danger son de estado, neutral es
       "pendiente", info y agent ya están tomados por los dos tipos de enlace. */
    expect(TONO_RECURSO.procesador).toBe("navy");
    expect(ETIQUETA_RECURSO.procesador).toBe("Procesador");
  });
});

describe("saludo", () => {
  it("usa el primer nombre, no el `displayName` entero de Entra ID", () => {
    /* En este tenant el displayName es el nombre legal completo. Devolverle
       sus cuatro nombres a alguien es lo contrario de saludarlo. */
    expect(saludo("Jose Rolando Alvarez Fernandez")).toBe("Hola, Jose");
  });

  it("con un solo nombre lo deja como está", () => {
    expect(saludo("María")).toBe("Hola, María");
  });

  it("un correo no tiene primer nombre, así que va entero", () => {
    /* El login y el pre-registro caen a la dirección cuando no saben más;
       saludar por media dirección sería peor que por la dirección. */
    expect(saludo("sheyla.paz@limaexpresa.pe")).toBe("Hola, sheyla.paz@limaexpresa.pe");
  });

  it("ignora los espacios de sobra en vez de saludar al vacío", () => {
    expect(saludo("   Ana   Quispe  ")).toBe("Hola, Ana");
  });

  it("sin nombre pierde la coma, no la arrastra", () => {
    expect(saludo("   ")).toBe("Hola");
  });
});
