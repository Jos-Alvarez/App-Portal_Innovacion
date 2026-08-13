import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Structural tests for the database contract.
 *
 * These tests read `prisma/schema.prisma`, the migration SQL and
 * `migration_lock.toml` as TEXT. They never open a database connection: the
 * provisioned databases exist for Prisma Migrate, and pointing an automated
 * suite at a shared corporate instance is not an accepted risk (README.md,
 * operational rules).
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prismaDir = path.join(repoRoot, "prisma");
const migrationsDir = path.join(prismaDir, "migrations");

const schemaSource = readFileSync(path.join(prismaDir, "schema.prisma"), "utf8");
const migrationLock = readFileSync(path.join(migrationsDir, "migration_lock.toml"), "utf8");

/** Concatenated SQL of every migration, oldest first. */
function readAllMigrationSql(): string {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8"))
    .join("\n");
}

const migrationSql = readAllMigrationSql();

interface Model {
  name: string;
  table: string;
  body: string;
}

interface Field {
  model: string;
  table: string;
  name: string;
  /** Physical column name: `@map(...)` when present, otherwise the field name. */
  column: string;
  /** Type token as written, e.g. `String`, `String?`, `Sugerencia[]`. */
  type: string;
  /** Everything after the type: attributes as written. */
  attributes: string;
  /** `///` documentation lines attached to the field, joined by spaces. */
  doc: string;
}

interface CheckConstraint {
  name: string;
  table: string;
  column: string;
  values: string[];
}

function parseModels(source: string): Model[] {
  const models: Model[] = [];
  const modelBlock = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;

  while ((match = modelBlock.exec(source)) !== null) {
    const [, name, body] = match;
    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    models.push({ name, table: mapped ? mapped[1] : name, body });
  }

  return models;
}

function parseFields(model: Model): Field[] {
  const fields: Field[] = [];
  let doc: string[] = [];

  for (const rawLine of model.body.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith("///")) {
      doc.push(line.slice(3).trim());
      continue;
    }
    if (line === "" || line.startsWith("//") || line.startsWith("@@")) {
      doc = [];
      continue;
    }

    const field = /^(\w+)\s+(\w+(?:\[\])?\??)\s*(.*)$/.exec(line);
    if (field === null) {
      doc = [];
      continue;
    }

    const [, name, type, attributes] = field;
    const mapped = /@map\("([^"]+)"\)/.exec(attributes);
    fields.push({
      model: model.name,
      table: model.table,
      name,
      column: mapped ? mapped[1] : name,
      type,
      attributes,
      doc: doc.join(" "),
    });
    doc = [];
  }

  return fields;
}

/**
 * Marker every enum-shaped column carries in its `///` documentation, followed
 * by the allowed values as `"a" | "b" | "c"`. Prisma has no native enums on SQL
 * Server, so this comment is the only place the vocabulary is declared.
 */
const ENUM_DOC_MARKER = "Enum-shaped:";

function documentedVocabulary(doc: string): string[] {
  const start = doc.indexOf(ENUM_DOC_MARKER);
  if (start === -1) return [];

  const rest = doc.slice(start + ENUM_DOC_MARKER.length);
  const list = /^\s*("[^"]+"(?:\s*\|\s*"[^"]+")*)/.exec(rest);
  if (list === null) return [];

  return [...list[1].matchAll(/"([^"]+)"/g)].map((value) => value[1]);
}

/** Every `CHECK (<column> IN (...))` added by an `ALTER TABLE` in a migration. */
function parseCheckConstraints(sql: string): CheckConstraint[] {
  const statement =
    /ALTER\s+TABLE\s+\[dbo\]\.\[(\w+)\]\s+ADD\s+CONSTRAINT\s+\[(\w+)\]\s+CHECK\s*\(\s*\[(\w+)\]\s+IN\s*\(([^)]*)\)\s*\)/gi;
  const constraints: CheckConstraint[] = [];
  let match: RegExpExecArray | null;

  while ((match = statement.exec(sql)) !== null) {
    const [, table, name, column, values] = match;
    constraints.push({
      name,
      table,
      column,
      values: [...values.matchAll(/'([^']*)'/g)].map((value) => value[1]),
    });
  }

  return constraints;
}

const models = parseModels(schemaSource);
const fields = models.flatMap(parseFields);
const enumFields = fields.filter((field) => field.doc.includes(ENUM_DOC_MARKER));
const checkConstraints = parseCheckConstraints(migrationSql);

function field(model: string, name: string): Field {
  const found = fields.find((candidate) => candidate.model === model && candidate.name === name);
  if (found === undefined) throw new Error(`${model}.${name} is missing from schema.prisma`);
  return found;
}

describe("prisma schema — entities", () => {
  it("maps the nine ADR 0002 entities to their snake_case tables", () => {
    const tables = Object.fromEntries(models.map((model) => [model.name, model.table]));

    expect(tables).toEqual({
      Usuario: "usuario",
      Enlace: "enlace",
      Procesador: "procesador",
      AsignacionEnlace: "asignacion_enlace",
      AsignacionProcesador: "asignacion_procesador",
      Sugerencia: "sugerencia",
      GrupoSugerencia: "grupo_sugerencia",
      HistorialSugerencia: "historial_sugerencia",
      EventoUso: "evento_uso",
    });
  });

  it("declares the four evento_uso indexes the analytics screen reads through", () => {
    const eventoUso = models.find((model) => model.name === "EventoUso");
    const indexes = [...(eventoUso?.body ?? "").matchAll(/@@index\(\[([^\]]+)\]\)/g)]
      .map((match) => match[1].split(",").map((column) => column.trim()).join(","))
      .sort();

    expect(indexes).toEqual(
      ["fecha", "tipoRecurso,idRecurso,fecha", "usuarioId,fecha", "tipoEvento,fecha"].sort(),
    );
  });

  it("keeps usuario.area NOT NULL with a default so analytics never groups on NULL", () => {
    const area = field("Usuario", "area");

    expect(area.type).toBe("String");
    expect(area.attributes).toContain('@default("")');
  });

  it("keeps the two identity lookup keys unique", () => {
    expect(field("Usuario", "correo").attributes).toContain("@unique");
    expect(field("Procesador", "claveProcesador").attributes).toContain("@unique");
  });

  /**
   * `enlace.nombre` is the enlace's identity to a collaborator: the dashboard
   * shows the name, so two rows called "Facturación" are indistinguishable
   * there and the one they need is a coin toss. The constraint belongs in the
   * database and not only in the API, because a duplicate that slipped in by
   * any other route would be just as unusable.
   *
   * `url` is deliberately NOT unique: registering the same external system
   * twice, under two names for two audiences, is legitimate.
   */
  it("keeps enlace.nombre unique and enlace.url free to repeat", () => {
    expect(field("Enlace", "nombre").attributes).toContain("@unique");
    expect(field("Enlace", "url").attributes).not.toContain("@unique");
  });

  /**
   * On SQL Server, Prisma expresses `@unique` as a table constraint rather than
   * as a `CREATE UNIQUE INDEX` — the same form `usuario_correo_key` already
   * takes in the initial migration. Asserting the constraint is what proves the
   * schema attribute reached the database, since the attribute alone changes
   * nothing until a migration carries it.
   */
  it("backs that uniqueness with a constraint in the migrations", () => {
    expect(migrationSql).toMatch(
      /ALTER\s+TABLE\s+\[dbo\]\.\[enlace\]\s+ADD\s+CONSTRAINT\s+\[enlace_nombre_key\]\s+UNIQUE\s+NONCLUSTERED\s*\(\s*\[nombre\]\s*\)/i,
    );
  });

  it("declares no scalar list, which the sqlserver provider cannot express", () => {
    const scalarLists = fields.filter((candidate) =>
      /^(String|Int|BigInt|Float|Decimal|Boolean|DateTime|Bytes|Json)\[\]$/.test(candidate.type),
    );

    expect(scalarLists.map((candidate) => `${candidate.model}.${candidate.name}`)).toEqual([]);
  });
});

describe("prisma schema — datasource and migration engine", () => {
  it("declares both url and shadowDatabaseUrl so Migrate never creates a database", () => {
    const datasource = /datasource\s+db\s*\{([\s\S]*?)\}/.exec(schemaSource)?.[1] ?? "";

    expect(datasource).toMatch(/provider\s*=\s*"sqlserver"/);
    expect(datasource).toMatch(/\burl\s*=\s*env\("DATABASE_URL"\)/);
    expect(datasource).toMatch(/shadowDatabaseUrl\s*=\s*env\("SHADOW_DATABASE_URL"\)/);
  });

  it("pins the mssql provider in migration_lock.toml", () => {
    expect(migrationLock).toMatch(/^provider\s*=\s*"mssql"$/m);
  });
});

describe("prisma schema — enum-shaped columns and their CHECK constraints", () => {
  it("documents a non-empty vocabulary on every enum-shaped column", () => {
    expect(enumFields.length).toBeGreaterThan(0);

    const malformed = enumFields.filter(
      (candidate) => candidate.type !== "String" || documentedVocabulary(candidate.doc).length === 0,
    );

    expect(malformed.map((candidate) => `${candidate.model}.${candidate.name}`)).toEqual([]);
  });

  /**
   * The contract this suite exists for. Prisma generates neither native enums
   * nor CHECK constraints on SQL Server, so every enum-shaped column needs a
   * hand-written CHECK in its migration. The comparison runs in both
   * directions and is derived by scanning, never hardcoded: adding a sixth
   * enum-shaped column without its CHECK, or editing a vocabulary in only one
   * of the two places, turns this red.
   */
  it("enforces every documented vocabulary with a matching CHECK constraint", () => {
    const documented = Object.fromEntries(
      enumFields.map((candidate) => [
        `${candidate.table}.${candidate.column}`,
        [...documentedVocabulary(candidate.doc)].sort(),
      ]),
    );
    const enforced = Object.fromEntries(
      checkConstraints.map((constraint) => [
        `${constraint.table}.${constraint.column}`,
        [...constraint.values].sort(),
      ]),
    );

    expect(enforced).toEqual(documented);
  });
});
