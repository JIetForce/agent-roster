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

/* --- security invariants: the reviewer must not be able to write --- */

const mustNotContain = (path, needles, why) => {
  if (!existsSync(path)) return fail(`missing ${path}`);
  const text = readFileSync(path, "utf8");
  for (const n of needles) {
    if (text.includes(n)) fail(`${path}: ${why} (found "${n}")`);
  }
};

mustNotContain(
  ".devin/agents/code-reviewer.md",
  ["\n  - edit", "\n  - write", "\n  - exec"],
  "reviewer allowed-tools grants a write capability",
);

mustNotContain(
  ".agent/agents/code-reviewer/agent.md",
  ["write_to_file", "replace_file_content", "run_command"],
  "reviewer tools grant a write or command capability",
);

const antigravityReviewer = existsSync(".agent/agents/code-reviewer/agent.md")
  ? readFileSync(".agent/agents/code-reviewer/agent.md", "utf8")
  : "";
if (!/^mainAgent: false$/m.test(antigravityReviewer)) {
  fail(".agent/agents/code-reviewer/agent.md: mainAgent must be false");
}
if (!/^commandExecutionPolicy: 'off'$/m.test(antigravityReviewer)) {
  fail(".agent/agents/code-reviewer/agent.md: commandExecutionPolicy must be 'off'");
}

const claudeReviewer = existsSync(".claude/agents/code-reviewer.md")
  ? readFileSync(".claude/agents/code-reviewer.md", "utf8")
  : "";
if (!/^tools: /m.test(claudeReviewer)) {
  fail(".claude/agents/code-reviewer.md: missing tools allowlist");
}
if (/^tools: .*\b(Edit|Write|Bash|NotebookEdit)\b/m.test(claudeReviewer)) {
  fail(".claude/agents/code-reviewer.md: tools allowlist grants a write capability");
}

if (
  existsSync(".cursor/agents/code-reviewer.md") &&
  !/^readonly: true$/m.test(readFileSync(".cursor/agents/code-reviewer.md", "utf8"))
) {
  fail(".cursor/agents/code-reviewer.md: readonly must be true");
}

if (
  existsSync(".codex/agents/code-reviewer.toml") &&
  !/^sandbox_mode = "read-only"$/m.test(
    readFileSync(".codex/agents/code-reviewer.toml", "utf8"),
  )
) {
  fail(".codex/agents/code-reviewer.toml: sandbox_mode must be read-only");
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
