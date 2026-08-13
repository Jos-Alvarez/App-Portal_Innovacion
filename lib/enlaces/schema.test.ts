// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DESCRIPCION_MAX,
  ID_MAX,
  NOMBRE_MAX,
  TIPOS_ENLACE,
  URL_MAX,
  actualizarEnlaceSchema,
  crearEnlaceSchema,
  idEnlaceSchema,
  normalizarUrl,
} from "@/lib/enlaces/schema";

/**
 * The validation rules of an `enlace`, as pure functions over data.
 *
 * The URL block below is the reason this file matters more than the rest of the
 * suite. An administrator types the URL and a collaborator clicks it later from
 * inside the portal, already signed in — so an accepted `javascript:` URL is
 * not a formatting defect, it is arbitrary script running in the portal's own
 * origin with the reader's session attached, and a `data:` URL is
 * attacker-authored HTML served as if the portal had published it. The rule is
 * therefore an ALLOWLIST of `http` and `https`: a blocklist of known-bad
 * schemes is bypassable by construction, an allowlist is not.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** URLs that must never reach the database, and why each one is dangerous. */
const URLS_RECHAZADAS: ReadonlyArray<readonly [string, string]> = [
  ["javascript:alert(document.cookie)", "runs script in the portal's origin"],
  ["JavaScript:alert(1)", "schemes are case-insensitive to a browser"],
  ["  javascript:alert(1)  ", "surrounding whitespace must not hide the scheme"],
  ["java\tscript:alert(1)", "a tab inside the scheme is stripped by the URL parser"],
  ["java\nscript:alert(1)", "a newline inside the scheme is stripped too"],
  ["data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==", "serves attacker HTML"],
  ["data:text/html,<script>alert(1)</script>", "same, unencoded"],
  ["//ejemplo.com/ruta", "scheme-relative: inherits whatever scheme the page has"],
  ["\\\\ejemplo.com\\ruta", "backslash form of the same trick"],
  ["vbscript:msgbox(1)", "another executable scheme"],
  ["file:///c:/windows/win.ini", "reaches the reader's own filesystem"],
  ["ftp://ejemplo.com/archivo", "not a web link at all"],
  ["mailto:alguien@ejemplo.com", "not a web link either"],
  ["ejemplo.com/ruta", "no scheme at all"],
  ["", "empty"],
  ["   ", "whitespace only"],
];

/** URLs an administrator legitimately registers. */
const URLS_ACEPTADAS: readonly string[] = [
  "https://ejemplo.com",
  "https://ejemplo.com/ruta/al/recurso?a=1&b=2#seccion",
  "http://intranet.limaexpresa.local/app",
  "HTTPS://Ejemplo.com/Ruta",
  "https://ejemplo.com:8443/app",
];

function enlaceValido(overrides: Record<string, unknown> = {}) {
  return {
    nombre: "Portal de facturación",
    descripcion: "Sistema de facturación electrónica.",
    url: "https://facturacion.ejemplo.com",
    tipo: "app",
    ...overrides,
  };
}

describe("normalizarUrl", () => {
  it("removes the whitespace around what the administrator pasted", () => {
    expect(normalizarUrl("  https://ejemplo.com/ruta \n")).toBe("https://ejemplo.com/ruta");
  });

  it("removes control characters hidden inside the string", () => {
    expect(normalizarUrl("java\tscript:alert(1)")).toBe("javascript:alert(1)");
    expect(normalizarUrl("https://ejem\u0000plo.com")).toBe("https://ejemplo.com");
  });

  it("leaves an ordinary URL exactly as it was typed", () => {
    expect(normalizarUrl("https://ejemplo.com/a?b=c#d")).toBe("https://ejemplo.com/a?b=c#d");
  });
});

describe("crearEnlaceSchema — url scheme allowlist", () => {
  it.each(URLS_RECHAZADAS)("rejects %j — %s", (url) => {
    const result = crearEnlaceSchema.safeParse(enlaceValido({ url }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === "url")).toBe(true);
  });

  it.each(URLS_ACEPTADAS)("accepts %j", (url) => {
    expect(crearEnlaceSchema.safeParse(enlaceValido({ url })).success).toBe(true);
  });

  it("stores the URL as normalised, not as pasted", () => {
    const result = crearEnlaceSchema.safeParse(enlaceValido({ url: "  https://ejemplo.com/x  " }));

    expect(result.success).toBe(true);
    expect(result.data?.url).toBe("https://ejemplo.com/x");
  });

  it("rejects a URL longer than the nvarchar(2048) column can hold", () => {
    const largo = `https://ejemplo.com/${"a".repeat(URL_MAX)}`;

    const result = crearEnlaceSchema.safeParse(enlaceValido({ url: largo }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("url");
  });

  it("accepts a URL sitting exactly on the column's limit", () => {
    const base = "https://ejemplo.com/";
    const exacto = base + "a".repeat(URL_MAX - base.length);

    expect(exacto).toHaveLength(URL_MAX);
    expect(crearEnlaceSchema.safeParse(enlaceValido({ url: exacto })).success).toBe(true);
  });

  it("rejects a url that is not a string at all", () => {
    expect(crearEnlaceSchema.safeParse(enlaceValido({ url: 12 })).success).toBe(false);
    expect(crearEnlaceSchema.safeParse(enlaceValido({ url: null })).success).toBe(false);
  });
});

describe("crearEnlaceSchema — nombre", () => {
  it("trims what the administrator typed", () => {
    const result = crearEnlaceSchema.safeParse(enlaceValido({ nombre: "  Facturación  " }));

    expect(result.data?.nombre).toBe("Facturación");
  });

  it("rejects an empty name, before and after trimming", () => {
    expect(crearEnlaceSchema.safeParse(enlaceValido({ nombre: "" })).success).toBe(false);
    expect(crearEnlaceSchema.safeParse(enlaceValido({ nombre: "    " })).success).toBe(false);
  });

  it("rejects a missing name", () => {
    const sinNombre = enlaceValido();
    delete (sinNombre as Record<string, unknown>).nombre;

    const result = crearEnlaceSchema.safeParse(sinNombre);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("nombre");
  });

  it("rejects a name longer than the nvarchar(150) column, and accepts the limit itself", () => {
    expect(crearEnlaceSchema.safeParse(enlaceValido({ nombre: "a".repeat(NOMBRE_MAX) })).success).toBe(
      true,
    );
    expect(
      crearEnlaceSchema.safeParse(enlaceValido({ nombre: "a".repeat(NOMBRE_MAX + 1) })).success,
    ).toBe(false);
  });
});

describe("crearEnlaceSchema — descripcion", () => {
  it("accepts the field being absent", () => {
    const sinDescripcion = enlaceValido();
    delete (sinDescripcion as Record<string, unknown>).descripcion;

    expect(crearEnlaceSchema.safeParse(sinDescripcion).success).toBe(true);
  });

  it("accepts an explicit null, which is what the nullable column stores", () => {
    const result = crearEnlaceSchema.safeParse(enlaceValido({ descripcion: null }));

    expect(result.success).toBe(true);
    expect(result.data?.descripcion).toBeNull();
  });

  /**
   * An empty textarea and an unfilled one mean the same thing to the
   * administrator, so they must mean the same thing in the column — otherwise
   * every screen reading this row has to treat `""` and `NULL` as one case
   * forever.
   */
  it("turns an empty description into null rather than storing an empty string", () => {
    expect(crearEnlaceSchema.safeParse(enlaceValido({ descripcion: "   " })).data?.descripcion).toBeNull();
  });

  it("rejects a description longer than the nvarchar(1000) column", () => {
    expect(
      crearEnlaceSchema.safeParse(enlaceValido({ descripcion: "a".repeat(DESCRIPCION_MAX + 1) }))
        .success,
    ).toBe(false);
  });
});

describe("crearEnlaceSchema — tipo", () => {
  it.each(TIPOS_ENLACE)("accepts %s", (tipo) => {
    expect(crearEnlaceSchema.safeParse(enlaceValido({ tipo })).success).toBe(true);
  });

  it.each(["App", "AGENTE", "procesador", "", null, 1])("rejects %j", (tipo) => {
    const result = crearEnlaceSchema.safeParse(enlaceValido({ tipo }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("tipo");
  });

  /**
   * The vocabulary lives in two places that cannot see each other: this
   * validator, and the hand-written `enlace_tipo_check` constraint the
   * migration adds (MIGRACIONES.md §4 — Prisma generates no CHECK on SQL
   * Server). `lib/prisma-schema.test.ts` already pins the constraint to the
   * schema's `/// Enum-shaped:` comment; this pins the validator to the same
   * comment, closing the triangle. Edit one side only and this turns red.
   */
  it("uses exactly the vocabulary the database CHECK constraint enforces", () => {
    const schema = readFileSync(path.join(repoRoot, "prisma", "schema.prisma"), "utf8");
    const enlace = /model\s+Enlace\s*\{([\s\S]*?)^\}/m.exec(schema)?.[1] ?? "";
    const documented = /Enum-shaped:\s*("[^"]+"(?:\s*\|\s*"[^"]+")*)/.exec(enlace)?.[1] ?? "";
    const valores = [...documented.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

    expect(valores).toEqual([...TIPOS_ENLACE]);
  });
});

describe("crearEnlaceSchema — fields the client does not get to set", () => {
  /**
   * A new enlace is active; `activo` is the logical-delete flag and is moved
   * only by the baja route. Unknown keys are stripped rather than rejected, so
   * a form that posts an extra field gets a working request, not a 400 — but
   * the extra field never reaches the row either.
   */
  it("drops activo on creation instead of letting the caller preset it", () => {
    const result = crearEnlaceSchema.safeParse(enlaceValido({ activo: false }));

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("activo");
  });

  it("drops an injected id", () => {
    const result = crearEnlaceSchema.safeParse(enlaceValido({ id: 99 }));

    expect(result.data).not.toHaveProperty("id");
  });

  it("returns exactly the four columns the create writes", () => {
    const result = crearEnlaceSchema.safeParse(enlaceValido());

    expect(Object.keys(result.data ?? {}).sort()).toEqual(["descripcion", "nombre", "tipo", "url"]);
  });
});

describe("idEnlaceSchema", () => {
  it("turns the path segment into the number Prisma keys the row on", () => {
    expect(idEnlaceSchema.safeParse("7").data).toBe(7);
  });

  it.each([
    ["abc", "not a number"],
    ["", "empty segment"],
    ["1.5", "not a whole number"],
    ["-3", "negative"],
    ["0", "no row has id zero"],
    [" 7", "padded, and a padded id is a client defect"],
    ["1e3", "exponent notation is not an identifier"],
    ["٧", "non-ASCII digits"],
    ["7; DROP TABLE enlace", "anything but a number"],
    ["9999999999", "beyond what the INT column holds"],
  ])("refuses %j — %s", (raw) => {
    expect(idEnlaceSchema.safeParse(raw).success).toBe(false);
  });

  /**
   * `enlace.id` is a Prisma `Int`, so SQL Server stores a 32-bit integer.
   * Rejecting anything larger here turns what would be a database error into a
   * 400 the client can understand.
   */
  it("accepts the largest id the INT column can hold and nothing above it", () => {
    expect(idEnlaceSchema.safeParse(String(ID_MAX)).success).toBe(true);
    expect(idEnlaceSchema.safeParse(String(ID_MAX + 1)).success).toBe(false);
  });
});

describe("actualizarEnlaceSchema", () => {
  it("accepts a single field, since an edit need not resend the whole row", () => {
    const result = actualizarEnlaceSchema.safeParse({ nombre: "Nuevo nombre" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ nombre: "Nuevo nombre" });
  });

  it("rejects an update that carries no change at all", () => {
    const result = actualizarEnlaceSchema.safeParse({});

    expect(result.success).toBe(false);
    /* A whole-body problem, so no field owns it. */
    expect(result.error?.issues[0].path).toEqual([]);
  });

  it("applies the very same scheme allowlist as the create", () => {
    expect(actualizarEnlaceSchema.safeParse({ url: "javascript:alert(1)" }).success).toBe(false);
    expect(actualizarEnlaceSchema.safeParse({ url: "https://ejemplo.com" }).success).toBe(true);
  });

  it("applies the very same length and vocabulary rules as the create", () => {
    expect(actualizarEnlaceSchema.safeParse({ nombre: "" }).success).toBe(false);
    expect(actualizarEnlaceSchema.safeParse({ nombre: "a".repeat(NOMBRE_MAX + 1) }).success).toBe(false);
    expect(actualizarEnlaceSchema.safeParse({ tipo: "otro" }).success).toBe(false);
  });

  /**
   * The baja is a logical delete, so the row survives it. Allowing `activo`
   * through the edit is what makes an accidental baja recoverable without a
   * route of its own — nothing else in the product can set the flag back.
   */
  it("lets an administrator undo a baja by setting activo back to true", () => {
    expect(actualizarEnlaceSchema.safeParse({ activo: true }).data).toEqual({ activo: true });
    expect(actualizarEnlaceSchema.safeParse({ activo: false }).data).toEqual({ activo: false });
  });

  it("rejects activo sent as a string, which a checkbox serialises by accident", () => {
    const result = actualizarEnlaceSchema.safeParse({ activo: "true" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("activo");
  });

  it("still normalises what it does receive", () => {
    const result = actualizarEnlaceSchema.safeParse({
      nombre: "  Facturación  ",
      url: "  https://ejemplo.com/x  ",
      descripcion: "  ",
    });

    expect(result.data).toEqual({
      nombre: "Facturación",
      url: "https://ejemplo.com/x",
      descripcion: null,
    });
  });
});
