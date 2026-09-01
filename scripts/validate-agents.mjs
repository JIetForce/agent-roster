#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CONFIG_FILE = "config/agents.json";
const ROLES_DIR = "agents/roles";
const errors = [];
const fail = (m) => errors.push(m);

const config = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));

const roles = readdirSync(ROLES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => {
    const raw = readFileSync(join(ROLES_DIR, e.name, "role.md"), "utf8");
    const m = raw.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const meta = Object.fromEntries(
      m[1].split("\n").filter(Boolean).map((l) => {
        const kv = l.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        let v = kv[2].trim();
        if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
        return [kv[1], v];
      }),
    );
    return { meta, body: m[2].trim() };
  });

for (const { meta, body } of roles) {
  for (const [tool, tm] of Object.entries(config.tool_meta)) {
    const path =
      tm.layout === "dir"
        ? join(tm.out_dir, meta.name, `${tm.file_name}${tm.ext}`)
        : join(tm.out_dir, `${meta.name}${tm.ext}`);

    if (!existsSync(path)) {
      fail(`missing generated file: ${path}`);
      continue;
    }
    const gen = readFileSync(path, "utf8");

    if (!gen.includes("DO NOT EDIT")) fail(`${path}: missing generated banner`);

    // Compare the body, not the escaped frontmatter. The body is verbatim in
    // every format, so a mismatch means the file is stale or hand-edited.
    const firstLine = body.split("\n")[0];
    if (!gen.includes(firstLine)) fail(`${path}: role body is stale or missing`);
  }
}

/* --- security invariants, by capability class --- */

// Markers are checked against each tool's write-*grant* field only, never
// against the whole file. Claude's `disallowedTools` spells out these exact
// words ("Write", "Edit", ...) to deny them — a whole-file substring search
// would flag a role for the very text that proves it cannot act. Scoping to
// the grant field (the `tools:` line for Claude, the `allowed-tools:` block
// for Devin) keeps the assertion meaningful instead of weakening it.
// Devin has no deny-list to echo: it ignores a `permissions` key in a subagent
// profile (CFG005) and enforces `allowed-tools` alone, which is why that
// allowlist is the only field worth reading here.
// Antigravity/Cursor/Codex have no such echo either, so their markers are
// checked against the whole file.
const GRANT_FIELD = {
  claude: (text) => text.match(/^tools:.*$/m)?.[0] ?? "",
  devin: (text) => text.match(/^allowed-tools:\n(?:  - .*\n)*/m)?.[0] ?? "",
};
const grantField = (tool, text) => (GRANT_FIELD[tool] ?? ((t) => t))(text);

const WRITE_MARKERS = {
  devin:       ["- write", "- edit", "- exec"],
  antigravity: ["commandExecutionPolicy: 'auto'", "commandExecutionPolicy: 'eager'"],
  claude:      ["Write", "Edit", "Bash"],
  cursor:      ["readonly: false"],
  codex:       ['sandbox_mode = "workspace-write"', 'sandbox_mode = "danger-full-access"'],
};

const NO_WRITE_MARKERS = {
  claude: ["Write", "Edit", "NotebookEdit"],
  devin:  ["- write", "- edit"],
};

for (const { meta } of roles) {
  for (const [tool, tm] of Object.entries(config.tool_meta)) {
    const path =
      tm.layout === "dir"
        ? join(tm.out_dir, meta.name, `${tm.file_name}${tm.ext}`)
        : join(tm.out_dir, `${meta.name}${tm.ext}`);
    if (!existsSync(path)) continue; // already reported by the generation check above

    const scope = grantField(tool, readFileSync(path, "utf8"));

    if (meta.class === "readonly" && WRITE_MARKERS[tool]) {
      for (const n of WRITE_MARKERS[tool]) {
        if (scope.includes(n)) fail(`${path}: ${meta.name} is readonly but can act (found "${n}")`);
      }
    }
    // `verifier` deliberately keeps a shell. Assert only that it cannot edit
    // through a first-class tool — a shell is an escape hatch we accept and
    // document rather than pretend to have closed.
    if (meta.class === "verifier" && NO_WRITE_MARKERS[tool]) {
      for (const n of NO_WRITE_MARKERS[tool]) {
        if (scope.includes(n)) fail(`${path}: ${meta.name} must not have edit tools (found "${n}")`);
      }
    }
  }
}

/* --- the contract must be reachable from every tool --- */

if (!existsSync("AGENTS.md")) fail("missing AGENTS.md");
if (!existsSync("CLAUDE.md")) {
  fail("missing CLAUDE.md — Claude Code does not read AGENTS.md");
} else if (!readFileSync("CLAUDE.md", "utf8").includes("@AGENTS.md")) {
  fail("CLAUDE.md does not import @AGENTS.md");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("all generated profiles valid");
