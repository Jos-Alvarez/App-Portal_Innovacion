import { describe, expect, it } from "vitest";

import { enMegabytes } from "./tamanos";

/**
 * The one place a byte count becomes something a person reads. Most of these
 * cases exist because getting them wrong makes a limit look like it is not the
 * limit — the failure this function exists to prevent.
 */

const KIB = 1024;
const MIB = KIB * KIB;

describe("the unit is chosen for the reader, not for the number", () => {
  it("uses MB from one mebibyte upwards", () => {
    expect(enMegabytes(MIB)).toBe("1 MB");
    expect(enMegabytes(25 * MIB)).toBe("25 MB");
  });

  it("drops to KB below that, where a decimal of a megabyte says nothing", () => {
    expect(enMegabytes(300 * KIB)).toBe("300 KB");
    expect(enMegabytes(0)).toBe("0 KB");
  });
});

describe("the arithmetic matches the limits it describes", () => {
  /**
   * `tamano_max` is built as `25 * 1024 * 1024` on BOTH sides of the wire — the
   * portal's `TAMANO_MAX_BYTES` and the service's `CONTRATO_POR_DEFECTO`. A
   * function dividing by 1000 would render that exact ceiling as "26,2 MB" and
   * make a file that is over the limit look like it fits under it.
   */
  it("renders the shared 25 MB ceiling as 25 MB, not 26,2 MB", () => {
    expect(enMegabytes(25 * 1024 * 1024)).toBe("25 MB");
  });
});

describe("the formatting does not depend on the runtime's locale data", () => {
  it("writes the decimal separator as a comma", () => {
    expect(enMegabytes(Math.round(31.4 * MIB))).toBe("31,4 MB");
  });

  it("shows no decimal when it would be a zero", () => {
    /* "25,0 MB" is noise: the reader compares it against a limit written 25. */
    expect(enMegabytes(25 * MIB)).not.toContain(",");
  });

  it("keeps at most one decimal", () => {
    expect(enMegabytes(Math.round(12.3456 * MIB))).toBe("12,3 MB");
  });
});
