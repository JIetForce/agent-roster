#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

// Which tools scan which project paths for AGENT definitions.
const AGENT_PATHS = {
  ".claude/agents": ["claude", "devin", "cursor"],
  ".agents/agents": ["antigravity", "devin"],
  ".agent/agents": ["antigravity"],
  ".devin/agents": ["devin"],
  ".cursor/agents": ["cursor"],
  ".codex/agents": ["codex", "cursor"],
};

const SKILL_PATHS = {
  ".claude/skills": ["claude", "devin"],
  ".agents/skills": ["antigravity", "devin"],
  ".agent/skills": ["antigravity"],
  ".devin/skills": ["devin"],
  ".codex/skills": ["codex"],
};

// Paths a tool reads only for cross-tool compatibility, and which a
// higher-precedence path of its own shadows.
const SHADOWED = {
  cursor: { by: ".cursor/agents", shadows: [".claude/agents", ".codex/agents"] },
};

// Devin can be told to stop importing another tool's config. A path the
// operator has already switched off is not a collision, so honour it here —
// otherwise the doctor reports a problem that is already solved.
const DEVIN_IMPORTS = {
  claude: [".claude/agents", ".claude/skills"],
  cursor: [".cursor/agents"],
};

function suppressed() {
  if (!existsSync(".devin/config.json")) return {};
  const from = JSON.parse(readFileSync(".devin/config.json", "utf8"))
    .read_config_from ?? {};
  const devin = Object.entries(from)
    .filter(([, enabled]) => enabled === false)
    .flatMap(([tool]) => DEVIN_IMPORTS[tool] ?? []);
  return devin.length ? { devin } : {};
}

const SUPPRESSED = suppressed();

let problems = 0;
const report = (ok, msg) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${msg}`);
  if (!ok) problems++;
};

function auditCollisions(label, matrix) {
  console.log(`\n${label}`);
  const seen = {};
  for (const [path, tools] of Object.entries(matrix)) {
    if (!existsSync(path)) continue;
    for (const t of tools) (seen[t] ??= []).push(path);
  }
  for (const [tool, paths] of Object.entries(seen)) {
    const shadow = SHADOWED[tool];
    const off = SUPPRESSED[tool] ?? [];
    let effective = paths.filter((p) => !off.includes(p));
    if (shadow && effective.includes(shadow.by)) {
      effective = effective.filter((p) => !shadow.shadows.includes(p));
    }
    report(
      effective.length === 1,
      effective.length === 1
        ? `${tool}: one source (${effective[0]})`
        : `${tool}: ${effective.length} sources — ${effective.join(", ")}`,
    );
  }
}

console.log("Agent roster doctor\n==============");

auditCollisions("Agent definition discovery", AGENT_PATHS);
auditCollisions("Skill discovery", SKILL_PATHS);

console.log("\nMCP sources");
const MCP_SOURCES = {
  claude:      { path: ".mcp.json",              note: "project scope, generated" },
  antigravity: { path: ".agent/mcp_config.json", note: "customization root" },
  devin:       { path: null,                     note: "global only — edit ~/.config/devin/mcp_config.json by hand" },
  codex:       { path: null,                     note: "per-agent `mcp_servers` in .codex/agents/*.toml, or global ~/.codex/config.toml" },
  cursor:      { path: null,                     note: "unverified" },
};
// Informational only — a project may legitimately have no per-tool MCP file
// yet, so these never touch `problems` / the exit code.
for (const [tool, { path, note }] of Object.entries(MCP_SOURCES)) {
  if (!path) console.log(`  info ${tool}: ${note}`);
  else if (existsSync(path)) console.log(`  ok   ${tool}: ${path} (${note})`);
  else console.log(`  warn ${tool}: ${path} missing (${note})`);
}

// Global skill installs, one per harness — not vendored into this repo, so
// existence can only be checked against markers verified on a real machine.
// Each tool below installs superpowers through a different mechanism, and
// each marker was confirmed against this machine on 2026-08-29:
//   Claude Code  — a plugin entry, ~/.claude/plugins/installed_plugins.json
//   Codex        — a plugin entry, ~/.codex/config.toml
//   Antigravity  — a declared skills path, ~/.gemini/config/skills.json
//   Devin        — account-level "personal plugins", installed cloud-side.
//                   There is no local file to check; report how to check it
//                   instead of guessing "absent" for something installed.
console.log("\nGlobal skills (installed per harness, not vendored here)");
const HOME = process.env.HOME ?? "";

const claudePlugins = `${HOME}/.claude/plugins/installed_plugins.json`;
const claudeFound = existsSync(claudePlugins) &&
  readFileSync(claudePlugins, "utf8").includes("superpowers@");
console.log(`  ${claudeFound ? "found  " : "absent "} superpowers — Claude Code (${claudePlugins})`);

const codexConfig = `${HOME}/.codex/config.toml`;
const codexFound = existsSync(codexConfig) &&
  readFileSync(codexConfig, "utf8").includes('[plugins."superpowers@claude-plugins-official"]');
console.log(`  ${codexFound ? "found  " : "absent "} superpowers — Codex (${codexConfig})`);

const geminiSkills = `${HOME}/.gemini/config/skills.json`;
let antigravityFound = false;
if (existsSync(geminiSkills)) {
  const raw = readFileSync(geminiSkills, "utf8");
  antigravityFound = [...raw.matchAll(/"path"\s*:\s*"([^"]*)"/g)]
    .some(([, p]) => p.includes("superpowers"));
}
console.log(`  ${antigravityFound ? "found  " : "absent "} superpowers — Antigravity (${geminiSkills})`);

console.log(
  "  info    superpowers — Devin: personal plugins are account-level and cloud-side, " +
    "no local marker exists; run `devin plugins list` to check",
);

console.log("\nContract reachability");
report(existsSync("AGENTS.md"), "AGENTS.md present (Devin, Antigravity, Cursor, Codex)");
report(existsSync("CLAUDE.md"), "CLAUDE.md present (Claude Code does not read AGENTS.md)");
report(existsSync("GEMINI.md"), "GEMINI.md present (Antigravity)");
report(
  existsSync(".cursor/rules/agent-roster.mdc"),
  ".cursor/rules/agent-roster.mdc present (Cursor)",
);

console.log("\nRepository preconditions");
let hasGit = false;
try {
  execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "pipe" });
  hasGit = true;
} catch {}
report(hasGit, "git repository (the review loop is built on `git diff`)");

console.log("\nInstalled CLIs");
for (const [bin, name] of [
  ["claude", "Claude Code"], ["devin", "Devin"],
  ["agy", "Antigravity"], ["cursor-agent", "Cursor"], ["codex", "Codex"],
]) {
  let found = false;
  try {
    execFileSync("command", ["-v", bin], { stdio: "pipe", shell: true });
    found = true;
  } catch {}
  console.log(`  ${found ? "found  " : "absent "} ${name} (${bin})`);
}

// Read the role list rather than naming roles here. A hardcoded list is the
// copy nobody updates, and this footer is the one place a human is told what
// "correct" looks like.
const roleNames = existsSync("agents/roles")
  ? readdirSync("agents/roles", { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];

console.log(`
Manual discovery checks — run each in the tool itself and confirm you see
exactly ONE of each of these ${roleNames.length} roles, and no duplicates:

  ${roleNames.join(", ")}

  Claude Code   /agents
  Devin         /agents        (also confirm no duplicates from .agent/ or .claude/)
  Antigravity   /agents        (CLI) or the agent picker (IDE)
  Cursor        type /  in the composer and look for the names
  Codex         /agent
`);

process.exit(problems ? 1 : 0);
