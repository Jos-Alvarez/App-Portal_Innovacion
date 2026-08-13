import { describe, expect, it } from "vitest";

import {
  isAdminEmail,
  isEmailFromAllowedDomain,
  mapToUsuarioUpsert,
  normalizeEmail,
  selectIdentityEmail,
} from "@/lib/auth/identity";

/**
 * The whole authentication decision reduces to these four pure functions. They
 * take every value they need as an argument — no environment, no network, no
 * database — so the rules that decide who gets in are testable in isolation.
 */

describe("normalizeEmail", () => {
  it("lowercases and trims a usable address", () => {
    expect(normalizeEmail("  Jose.Alvarez@Corp.COM \t")).toBe("jose.alvarez@corp.com");
  });

  it("collapses every unusable value to the empty string", () => {
    for (const value of [undefined, null, "", "   ", 42, {}, []]) {
      expect(normalizeEmail(value)).toBe("");
    }
  });
});

describe("selectIdentityEmail", () => {
  it("prefers the email claim", () => {
    expect(
      selectIdentityEmail({ email: "A@corp.com", preferred_username: "b@corp.com" }),
    ).toBe("a@corp.com");
  });

  it("falls back to preferred_username, which is the UPN Entra ID always emits", () => {
    expect(selectIdentityEmail({ preferred_username: "B@corp.com" })).toBe("b@corp.com");
  });

  it("returns the empty string when the claims carry no address at all", () => {
    expect(selectIdentityEmail({})).toBe("");
    expect(selectIdentityEmail({ email: null, preferred_username: "  " })).toBe("");
  });
});

describe("isEmailFromAllowedDomain", () => {
  const domain = "corp.com";

  it("accepts an address in the allowed domain regardless of case or padding", () => {
    expect(isEmailFromAllowedDomain("  Jose.Alvarez@CORP.com ", domain)).toBe(true);
  });

  it("accepts an allowed domain written with a leading @ or odd case", () => {
    expect(isEmailFromAllowedDomain("jose@corp.com", " @Corp.Com ")).toBe(true);
  });

  it("rejects another domain, including one that merely ends with the allowed one", () => {
    expect(isEmailFromAllowedDomain("jose@otra.com", domain)).toBe(false);
    expect(isEmailFromAllowedDomain("jose@evilcorp.com", domain)).toBe(false);
  });

  it("rejects subdomains, which are a different tenant namespace", () => {
    expect(isEmailFromAllowedDomain("jose@mail.corp.com", domain)).toBe(false);
  });

  it("rejects a missing or malformed address", () => {
    for (const value of [undefined, null, "", "   ", "jose", "@corp.com", "jose@", 7]) {
      expect(isEmailFromAllowedDomain(value, domain)).toBe(false);
    }
  });

  it("rejects an address with more than one @ or with inner whitespace", () => {
    expect(isEmailFromAllowedDomain("jose@corp.com@corp.com", domain)).toBe(false);
    expect(isEmailFromAllowedDomain("jo se@corp.com", domain)).toBe(false);
  });

  it("accepts an address of exactly the 320-character correo column width", () => {
    const exact = `${"a".repeat(320 - 1 - domain.length)}@${domain}`;
    expect(exact).toHaveLength(320);
    expect(isEmailFromAllowedDomain(exact, domain)).toBe(true);
  });

  it("rejects an address longer than the 320-character correo column", () => {
    const tooLong = `${"a".repeat(320 - domain.length)}@${domain}`;
    expect(tooLong).toHaveLength(321);
    expect(isEmailFromAllowedDomain(tooLong, domain)).toBe(false);
  });

  it("fails closed when the allowed domain is missing or blank", () => {
    for (const value of [undefined, null, "", "   ", "@"]) {
      expect(isEmailFromAllowedDomain("jose@corp.com", value)).toBe(false);
    }
  });
});

describe("isAdminEmail", () => {
  it("matches the configured address ignoring case and padding", () => {
    expect(isAdminEmail(" Jose@Corp.com ", "jose@CORP.com")).toBe(true);
  });

  it("does not match a different address", () => {
    expect(isAdminEmail("otro@corp.com", "jose@corp.com")).toBe(false);
  });

  it("promotes nobody when ADMIN_EMAIL is unset or blank", () => {
    for (const value of [undefined, null, "", "   "]) {
      expect(isAdminEmail("jose@corp.com", value)).toBe(false);
      expect(isAdminEmail(value, value)).toBe(false);
    }
  });
});

describe("mapToUsuarioUpsert", () => {
  it("maps the claims to the four usuario columns", () => {
    expect(
      mapToUsuarioUpsert({
        email: " Jose.Alvarez@Corp.com ",
        name: "  José Álvarez  ",
        department: "  Innovación  ",
        esAdmin: true,
      }),
    ).toEqual({
      correo: "jose.alvarez@corp.com",
      nombre: "José Álvarez",
      area: "Innovación",
      esAdmin: true,
    });
  });

  it("maps an absent department to the empty-area bucket, never to null", () => {
    for (const department of [undefined, null, "", "   ", 42]) {
      expect(mapToUsuarioUpsert({ email: "jose@corp.com", department, esAdmin: false }).area).toBe(
        "",
      );
    }
  });

  it("falls back to the address when Entra ID sends no name, since nombre is NOT NULL", () => {
    expect(mapToUsuarioUpsert({ email: "jose@corp.com", name: "  ", esAdmin: false }).nombre).toBe(
      "jose@corp.com",
    );
  });

  it("truncates nombre and area to their column widths", () => {
    const mapped = mapToUsuarioUpsert({
      email: "jose@corp.com",
      name: "n".repeat(250),
      department: "a".repeat(200),
      esAdmin: false,
    });

    expect(mapped.nombre).toHaveLength(200);
    expect(mapped.area).toHaveLength(120);
  });

  it("refuses to build a row without an address", () => {
    expect(() => mapToUsuarioUpsert({ email: "  ", esAdmin: false })).toThrow(/e-mail/i);
  });
});
