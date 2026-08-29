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

// Roles of class `readonly`, read from the same source the generator uses, so
// this suite covers every one of them as roles are added.
const classOf = (role) => {
  const fm = readFileSync(`agents/roles/${role}/role.md`, "utf8")
    .match(/^---\n([\s\S]*?)\n---/)[1];
  return fm.match(/^class:\s*(.+)$/m)?.[1].trim();
};
const READONLY = ROLES.filter((r) => classOf(r) === "readonly");

// scripts/validate-agents.mjs — run by "passes the validator" above — already
// asserts the *negative* for every readonly role: no write or exec marker in
// the tool's grant field. This suite asserts the *positive*, which the
// validator does not: that the field which actually makes a profile read-only
// is present. Absence of a bad value is not presence of a good one — a
// renderer that silently stopped emitting `commandExecutionPolicy` would pass
// the validator while shipping a profile that grants everything by default.
// Antigravity's tool allowlist is checked here for the same reason: it is the
// lever that decides what the subagent can do, and the validator never reads it.
describe("readonly roles keep the shape that makes them read-only", () => {
  it("antigravity: allowlist excludes write and exec tools", () => {
    for (const role of READONLY) {
      const f = readFileSync(`.agent/agents/${role}/agent.md`, "utf8");
      for (const t of ["write_to_file", "replace_file_content", "run_command"]) {
        assert.ok(!f.includes(t), `.agent/agents/${role}/agent.md grants ${t}`);
      }
      assert.match(f, /^tools:\n(?:  - .+\n)+/m, `${role}: no antigravity tool allowlist`);
      assert.match(f, /commandExecutionPolicy: 'off'/, `${role}: policy is not 'off'`);
      assert.match(f, /mainAgent: false/, `${role}: is exposed as a main agent`);
    }
  });

  it("claude: tools line is present and read-only", () => {
    for (const role of READONLY) {
      assert.match(
        readFileSync(`.claude/agents/${role}.md`, "utf8"),
        /^tools: Read, Glob, Grep$/m,
        `${role}: claude profile is missing its read-only tools line`,
      );
    }
  });

  it("devin: denies write, edit and exec explicitly", () => {
    for (const role of READONLY) {
      const f = readFileSync(`.devin/agents/${role}.md`, "utf8");
      const deny = f.match(/^permissions:\n  deny:\n(?:    - .*\n)+/m)?.[0] ?? "";
      for (const t of ["write", "edit", "exec"]) {
        assert.ok(deny.includes(`- ${t}\n`), `${role}: devin profile does not deny ${t}`);
      }
    }
  });

  it("cursor: readonly flag is set", () => {
    for (const role of READONLY) {
      assert.match(
        readFileSync(`.cursor/agents/${role}.md`, "utf8"),
        /^readonly: true$/m,
        `${role}: cursor profile is not readonly`,
      );
    }
  });

  it("codex: sandbox is read-only", () => {
    for (const role of READONLY) {
      assert.match(
        readFileSync(`.codex/agents/${role}.toml`, "utf8"),
        /^sandbox_mode = "read-only"$/m,
        `${role}: codex profile is not sandboxed read-only`,
      );
    }
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
