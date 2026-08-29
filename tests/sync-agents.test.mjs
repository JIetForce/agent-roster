// tests/sync-agents.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";

const run = (args) =>
  execFileSync("node", args, { encoding: "utf8", stdio: "pipe" });

// The role list is read from disk so the test keeps covering every role as
// roles are added. The path *shapes* stay written out here on purpose: if they
// were derived from config/agents.json the test would mirror the generator's
// own logic and pass however wrong that config became.
const SHAPES = [
  (r) => `.devin/agents/${r}.md`,
  (r) => `.agent/agents/${r}/agent.md`,
  (r) => `.claude/agents/${r}.md`,
  (r) => `.codex/agents/${r}.toml`,
  (r) => `.cursor/agents/${r}.md`,
];

const ROLES = readdirSync("agents/roles", { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const EXPECTED = ROLES.flatMap((r) => SHAPES.map((shape) => shape(r)));

describe("harness generation", () => {
  it("generates every expected profile", () => {
    run(["scripts/sync-agents.mjs"]);
    for (const f of EXPECTED) assert.ok(existsSync(f), `missing ${f}`);
  });

  it("is idempotent — a second sync reports no drift", () => {
    run(["scripts/sync-agents.mjs"]);
    // --check exits non-zero if regenerating would change anything.
    run(["scripts/sync-agents.mjs", "--check"]);
  });

  it("detects a hand-edit as drift", () => {
    run(["scripts/sync-agents.mjs"]);
    const path = ".claude/agents/code-reviewer.md";
    const original = readFileSync(path, "utf8");
    try {
      writeFileSync(path, original + "\nhand edited\n");
      assert.throws(
        () => run(["scripts/sync-agents.mjs", "--check"]),
        "--check should fail on a hand-edited generated file",
      );
    } finally {
      writeFileSync(path, original);
    }
  });

  it("banners every generated file", () => {
    run(["scripts/sync-agents.mjs"]);
    for (const f of EXPECTED) {
      assert.match(
        readFileSync(f, "utf8"),
        /DO NOT EDIT/,
        `${f} is missing the generated-file banner`,
      );
    }
  });

  it("passes the validator", () => {
    run(["scripts/validate-agents.mjs"]);
  });
});

describe("reviewer is read-only in every tool", () => {
  it("devin", () => {
    const f = readFileSync(".devin/agents/code-reviewer.md", "utf8");
    for (const t of ["edit", "write", "exec"]) {
      assert.ok(!f.includes(`\n  - ${t}\n`), `devin reviewer grants ${t}`);
    }
  });

  it("antigravity", () => {
    const f = readFileSync(".agent/agents/code-reviewer/agent.md", "utf8");
    for (const t of ["write_to_file", "replace_file_content", "run_command"]) {
      assert.ok(!f.includes(t), `antigravity reviewer grants ${t}`);
    }
    assert.match(f, /commandExecutionPolicy: 'off'/);
    assert.match(f, /mainAgent: false/);
  });

  it("claude", () => {
    const f = readFileSync(".claude/agents/code-reviewer.md", "utf8");
    assert.match(f, /^tools: Read, Glob, Grep$/m);
    assert.ok(!/\bEdit\b|\bWrite\b|\bBash\b/.test(f.split("---")[1]));
  });

  it("cursor", () => {
    assert.match(
      readFileSync(".cursor/agents/code-reviewer.md", "utf8"),
      /^readonly: true$/m,
    );
  });

  it("codex", () => {
    assert.match(
      readFileSync(".codex/agents/code-reviewer.toml", "utf8"),
      /^sandbox_mode = "read-only"$/m,
    );
  });
});

describe("harness skill projection", () => {
  it("every generated skill names its tool's dispatch mechanism", () => {
    const cases = [
      [".claude/skills/review-loop/SKILL.md", "subagent_type"],
      [".devin/skills/review-loop/SKILL.md", "run_subagent"],
      [".agent/skills/review-loop/SKILL.md", "invoke_subagent"],
      [".codex/skills/review-loop/SKILL.md", "spawn"],
    ];
    for (const [path, needle] of cases) {
      const text = readFileSync(path, "utf8");
      assert.ok(text.includes(needle), `${path}: missing dispatch instruction "${needle}"`);
      assert.ok(!text.includes("<!-- DISPATCH -->"), `${path}: marker left unreplaced`);
      assert.ok(text.includes("DO NOT EDIT"), `${path}: missing generated banner`);
    }
  });
});
