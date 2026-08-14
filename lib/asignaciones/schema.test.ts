// @vitest-environment node
import { describe, expect, it } from "vitest";

import { INT_MAX, idRutaSchema } from "@/lib/asignaciones/schema";

/**
 * The only thing this resource validates.
 *
 * An assignment has no body and no fields — the row IS the grant — so the whole
 * of its validation is the two identifiers in the path. What is worth pinning
 * down is the boundary item #6 established: a number SQL Server's INT column
 * cannot hold is a 400 the reader can act on, decided here, and never a
 * database error decided three layers down.
 */

describe("idRutaSchema", () => {
  it.each([
    ["1", 1],
    ["7", 7],
    ["42", 42],
    [String(INT_MAX), INT_MAX],
  ])("reads %s as the number %i", (crudo, esperado) => {
    expect(idRutaSchema.parse(crudo)).toBe(esperado);
  });

  it("refuses the value just past what the INT column holds", () => {
    expect(idRutaSchema.safeParse(String(INT_MAX + 1)).success).toBe(false);
  });

  it.each([
    ["zero, since identities start at one", "0"],
    ["a negative number", "-3"],
    ["a decimal", "1.5"],
    ["letters", "abc"],
    ["a number with spaces around it", " 7 "],
    ["the empty string", ""],
    ["a number in exponential notation", "1e3"],
    ["a hexadecimal literal", "0x7"],
    ["a number with a thousands separator", "1,000"],
    ["a leading plus sign", "+7"],
  ])("refuses %s", (_caso, crudo) => {
    expect(idRutaSchema.safeParse(crudo).success).toBe(false);
  });

  it("matches SQL Server's signed 32-bit ceiling", () => {
    expect(INT_MAX).toBe(2_147_483_647);
  });
});
