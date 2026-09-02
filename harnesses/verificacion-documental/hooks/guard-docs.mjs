#!/usr/bin/env node
/**
 * PreToolUse guard for the "verificacion-documental" harness.
 *
 * While a verification run is open (the sentinel file exists), any attempt to
 * Edit/Write/MultiEdit a document inside the audited perimeter is blocked.
 * Outside a run the hook is a no-op, so normal editing of PRD.md, BACKLOG.md,
 * the ADRs and friends is never affected.
 *
 * Exit codes (Claude Code PreToolUse contract):
 *   0 -> allow
 *   2 -> block, stderr is fed back to the agent
 */

import fs from "node:fs";
import path from "node:path";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SENTINEL = path.join(PROJECT_DIR, ".claude", ".verificacion-documental.lock");

// Paths are matched project-relative, with forward slashes, case-insensitively.
const PERIMETER = [
  /^prd\.md$/,
  /^design\.md$/,
  /^tech-design\.md$/,
  /^backlog\.md$/,
  /^adrs\/.+\.md$/,
];

const allow = () => process.exit(0);

const block = (relPath) => {
  process.stderr.write(
    `Bloqueado por el harness de verificacion documental: "${relPath}" pertenece al ` +
      `perimetro auditado y la corrida esta abierta.\n` +
      `Esta skill es de solo lectura sobre el perimetro. No busques una via alternativa ` +
      `(Bash, sed, heredoc) para escribir igual: reporta el hallazgo en ` +
      `VERIFICACION-DOCUMENTAL.md y deja la correccion en manos de una persona.\n`,
  );
  process.exit(2);
};

// No open run -> nothing to guard. This is the fail-open half, and it is safe:
// the guard only ever needs to be active during a verification run.
let runIsOpen = false;
try {
  runIsOpen = fs.existsSync(SENTINEL);
} catch {
  runIsOpen = false;
}
if (!runIsOpen) allow();

// From here on a run IS open, so ambiguity resolves to "block". An unparseable
// payload during a run must not silently open a write path into the perimeter.
let payload = "";
try {
  payload = fs.readFileSync(0, "utf8");
} catch {
  block("<no se pudo leer la invocacion>");
}

let input;
try {
  input = JSON.parse(payload);
} catch {
  block("<invocacion no parseable>");
}

const targets = [];
const ti = input?.tool_input ?? {};
if (typeof ti.file_path === "string") targets.push(ti.file_path);
if (typeof ti.notebook_path === "string") targets.push(ti.notebook_path);
if (Array.isArray(ti.edits)) {
  for (const e of ti.edits) {
    if (typeof e?.file_path === "string") targets.push(e.file_path);
  }
}

// A write tool with no resolvable target, during an open run, is ambiguous.
if (targets.length === 0) block("<destino de escritura no resuelto>");

for (const target of targets) {
  const rel = path
    .relative(PROJECT_DIR, path.resolve(PROJECT_DIR, target))
    .split(path.sep)
    .join("/");

  // Outside the project tree: not our business.
  if (rel.startsWith("../")) continue;

  const key = rel.toLowerCase();
  if (PERIMETER.some((re) => re.test(key))) block(rel);
}

allow();
