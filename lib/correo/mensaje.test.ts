import { describe, expect, it } from "vitest";

import { mensajeDeSugerencia } from "@/lib/correo/mensaje";
import type { SugerenciaDTO } from "@/lib/sugerencias/repository";

const SUGERENCIA: SugerenciaDTO = {
  id: 42,
  titulo: "Tablero de peajes en tiempo real",
  descripcion: "Un tablero que muestre el tránsito por estación sin exportar a Excel.",
  areaDestino: "Tecnología",
  estado: "pendiente",
  fechaCreacion: "2026-08-21T14:30:00.000Z",
  historial: [
    {
      id: 1,
      estadoAnterior: null,
      estadoNuevo: "pendiente",
      fechaCambio: "2026-08-21T14:30:00.000Z",
      autor: "Ana Rojas",
    },
  ],
};

const AUTORA = { nombre: "Ana Rojas", correo: "ana.rojas@corp.com" };

describe("mensajeDeSugerencia", () => {
  it("puts the title in the subject, so the inbox is readable without opening anything", () => {
    const { asunto } = mensajeDeSugerencia(SUGERENCIA, AUTORA);

    expect(asunto).toContain("Tablero de peajes en tiempo real");
  });

  it("marks the subject as coming from the portal", () => {
    expect(mensajeDeSugerencia(SUGERENCIA, AUTORA).asunto).toMatch(/^\[Portal de Innovación\]/);
  });

  it("carries the author, the destination area and the whole description in the body", () => {
    const { texto } = mensajeDeSugerencia(SUGERENCIA, AUTORA);

    expect(texto).toContain("Ana Rojas");
    expect(texto).toContain("ana.rojas@corp.com");
    expect(texto).toContain("Tecnología");
    expect(texto).toContain("sin exportar a Excel");
  });

  it("names the suggestion by id, which is what an administrator can search by", () => {
    expect(mensajeDeSugerencia(SUGERENCIA, AUTORA).texto).toContain("#42");
  });

  it("writes the date in Lima time, not UTC, because the reader is in Lima", () => {
    /* 14:30 UTC is 09:30 in America/Lima (UTC-5, no DST). */
    expect(mensajeDeSugerencia(SUGERENCIA, AUTORA).texto).toContain("09:30");
  });

  it("says the suggestion is already registered, so nobody treats the mail as the record", () => {
    expect(mensajeDeSugerencia(SUGERENCIA, AUTORA).texto).toMatch(/registrada/i);
  });

  it("collapses a newline in the title, because a header cannot carry one", () => {
    const inyectada = { ...SUGERENCIA, titulo: "Idea\r\ncon salto" };

    expect(mensajeDeSugerencia(inyectada, AUTORA).asunto).toBe(
      "[Portal de Innovación] Nueva sugerencia: Idea con salto",
    );
  });

  it("trims a subject that a 200-character title would otherwise blow up", () => {
    const larga = { ...SUGERENCIA, titulo: "T".repeat(200) };
    const { asunto } = mensajeDeSugerencia(larga, AUTORA);

    expect(asunto.length).toBeLessThanOrEqual(120);
    expect(asunto).toMatch(/…$/);
  });

  it("keeps the description whole, however long it is — the body has no header limit", () => {
    const larga = { ...SUGERENCIA, descripcion: "D".repeat(4000) };

    expect(mensajeDeSugerencia(larga, AUTORA).texto).toContain("D".repeat(4000));
  });
});
