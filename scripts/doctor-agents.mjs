#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
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

console.log("Harness doctor\n==============");

auditCollisions("Agent definition discovery", AGENT_PATHS);
auditCollisions("Skill discovery", SKILL_PATHS);

console.log("\nContract reachability");
report(existsSync("AGENTS.md"), "AGENTS.md present (Devin, Antigravity, Cursor, Codex)");
report(existsSync("CLAUDE.md"), "CLAUDE.md present (Claude Code does not read AGENTS.md)");
report(existsSync("GEMINI.md"), "GEMINI.md present (Antigravity)");
report(existsSync(".cursor/rules/harness.mdc"), ".cursor/rules/harness.mdc present (Cursor)");

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

console.log(`
Manual discovery checks — run each in the tool itself and confirm you see
exactly ONE 'nextjs-developer' and ONE 'code-reviewer':

  Claude Code   /agents
  Devin         /agents        (also confirm no duplicates from .agent/ or .claude/)
  Antigravity   /agents        (CLI) or the agent picker (IDE)
  Cursor        type /  in the composer and look for the two names
  Codex         /agent
`);

process.exit(problems ? 1 : 0);
