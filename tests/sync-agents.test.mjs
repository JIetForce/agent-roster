// tests/sync-agents.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const run = (args) =>
  execFileSync("node", args, { encoding: "utf8", stdio: "pipe" });

const EXPECTED = [
  ".devin/agents/nextjs-developer.md",
  ".devin/agents/code-reviewer.md",
  ".agent/agents/nextjs-developer/agent.md",
  ".agent/agents/code-reviewer/agent.md",
  ".claude/agents/nextjs-developer.md",
  ".claude/agents/code-reviewer.md",
  ".codex/agents/nextjs-developer.toml",
  ".codex/agents/code-reviewer.toml",
  ".cursor/agents/nextjs-developer.md",
  ".cursor/agents/code-reviewer.md",
];

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
