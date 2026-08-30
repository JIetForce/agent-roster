// tests/discovery.test.mjs
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  auditCollisions,
  definitionsAt,
  strayPaths,
  suppressed,
} from "../scripts/lib/discovery.mjs";

// realpath the sandbox: on macOS /tmp is itself a symlink, and the module
// compares resolved targets.
const roots = [];
function sandbox() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "roster-discovery-")));
  roots.push(root);
  return root;
}
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function file(root, rel, body = "x") {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, "utf8");
  return path;
}

const forTool = (results, tool) => results.find((r) => r.tool === tool);

describe("definitionsAt", () => {
  it("names a flat .md definition by its basename", () => {
    const root = sandbox();
    file(root, ".claude/agents/developer.md");
    file(root, ".claude/agents/verifier.md");
    assert.deepEqual([...definitionsAt(".claude/agents", root).keys()].sort(), [
      "developer",
      "verifier",
    ]);
  });

  it("names a .toml definition by its basename", () => {
    const root = sandbox();
    file(root, ".codex/agents/developer.toml");
    assert.deepEqual([...definitionsAt(".codex/agents", root).keys()], ["developer"]);
  });

  it("names a directory-layout definition by its directory", () => {
    const root = sandbox();
    file(root, ".agent/agents/developer/agent.md");
    assert.deepEqual([...definitionsAt(".agent/agents", root).keys()], ["developer"]);
  });

  it("resolves a symlinked definition to the directory it points at", () => {
    const root = sandbox();
    file(root, ".agents/skills/shadcn/SKILL.md");
    mkdirSync(join(root, ".devin/skills"), { recursive: true });
    symlinkSync(join(root, ".agents/skills/shadcn"), join(root, ".devin/skills/shadcn"));

    assert.equal(
      definitionsAt(".devin/skills", root).get("shadcn"),
      definitionsAt(".agents/skills", root).get("shadcn"),
      "a symlink and its target must resolve to one definition",
    );
  });

  it("skips a broken symlink rather than throwing", () => {
    const root = sandbox();
    mkdirSync(join(root, ".devin/skills"), { recursive: true });
    symlinkSync(join(root, "nowhere"), join(root, ".devin/skills/gone"));
    assert.equal(definitionsAt(".devin/skills", root).size, 0);
  });

  it("is empty for a directory that does not exist", () => {
    assert.equal(definitionsAt(".claude/agents", sandbox()).size, 0);
  });
});

describe("auditCollisions", () => {
  const SKILLS = {
    ".claude/skills": ["claude", "devin"],
    ".agents/skills": ["antigravity", "devin"],
    ".agent/skills": ["antigravity"],
    ".devin/skills": ["devin"],
  };

  it("passes a tool whose two source directories hold different skills", () => {
    // The case that used to fail: antigravity reads .agents/skills (shadcn) and
    // .agent/skills (review-loop). Two directories, no name in common, nothing
    // for either tool to disambiguate.
    const root = sandbox();
    file(root, ".agents/skills/shadcn/SKILL.md");
    file(root, ".agent/skills/review-loop/SKILL.md");

    const antigravity = forTool(auditCollisions(SKILLS, root), "antigravity");
    assert.deepEqual(antigravity.sources, [".agents/skills", ".agent/skills"]);
    assert.deepEqual(antigravity.collisions, []);
    assert.equal(antigravity.count, 2);
  });

  it("passes a name reachable by two paths that resolve to one definition", () => {
    const root = sandbox();
    file(root, ".agents/skills/shadcn/SKILL.md");
    mkdirSync(join(root, ".devin/skills"), { recursive: true });
    symlinkSync(join(root, ".agents/skills/shadcn"), join(root, ".devin/skills/shadcn"));

    const devin = forTool(auditCollisions(SKILLS, root), "devin");
    assert.deepEqual(devin.collisions, [], "a symlink to the same skill is not a collision");
    assert.equal(devin.count, 1);
  });

  it("fails a name that resolves to two different definitions", () => {
    const root = sandbox();
    file(root, ".agents/skills/shadcn/SKILL.md", "one");
    file(root, ".devin/skills/shadcn/SKILL.md", "another");

    const devin = forTool(auditCollisions(SKILLS, root), "devin");
    assert.equal(devin.collisions.length, 1);
    assert.equal(devin.collisions[0].name, "shadcn");
    assert.deepEqual(devin.collisions[0].paths, [
      ".agents/skills/shadcn",
      ".devin/skills/shadcn",
    ]);
  });

  it("fails identical copies at two paths — identical today still drifts tomorrow", () => {
    const root = sandbox();
    file(root, ".agents/skills/shadcn/SKILL.md", "same");
    file(root, ".devin/skills/shadcn/SKILL.md", "same");
    assert.equal(forTool(auditCollisions(SKILLS, root), "devin").collisions.length, 1);
  });

  it("honours a Devin import the operator has switched off", () => {
    const root = sandbox();
    file(root, ".devin/config.json", JSON.stringify({ read_config_from: { claude: false } }));
    file(root, ".claude/skills/review-loop/SKILL.md", "claude copy");
    file(root, ".devin/skills/review-loop/SKILL.md", "devin copy");

    assert.deepEqual(suppressed(root), { devin: [".claude/agents", ".claude/skills"] });
    const devin = forTool(auditCollisions(SKILLS, root), "devin");
    assert.deepEqual(devin.sources, [".devin/skills"]);
    assert.deepEqual(devin.collisions, []);
  });

  it("lets a tool's own directory shadow the paths it reads only for compatibility", () => {
    const root = sandbox();
    const AGENTS = {
      ".claude/agents": ["cursor"],
      ".cursor/agents": ["cursor"],
    };
    file(root, ".claude/agents/developer.md", "claude copy");
    file(root, ".cursor/agents/developer.md", "cursor copy");

    const cursor = forTool(auditCollisions(AGENTS, root), "cursor");
    assert.deepEqual(cursor.sources, [".cursor/agents"]);
    assert.deepEqual(cursor.collisions, []);
  });

  it("reports nothing for a tool with no source directory present", () => {
    assert.deepEqual(auditCollisions(SKILLS, sandbox()), []);
  });
});

describe("strayPaths", () => {
  it("flags a harness directory that lost its leading dot", () => {
    const root = sandbox();
    file(root, "agent/skills/shadcn/SKILL.md");
    assert.deepEqual(strayPaths({ ".agent/skills": ["antigravity"] }, root), [
      { path: "agent/skills", meant: ".agent/skills" },
    ]);
  });

  it("never flags this repository's own source directory", () => {
    // `agents/skills` is where the roster keeps the canonical skill body. It is
    // one dropped dot away from `.agents/skills` and must stay exempt.
    const root = sandbox();
    file(root, "agents/skills/review-loop/SKILL.md");
    assert.deepEqual(strayPaths({ ".agents/skills": ["antigravity", "devin"] }, root), []);
  });

  it("is empty when nothing stray exists", () => {
    const root = sandbox();
    file(root, ".agent/skills/review-loop/SKILL.md");
    assert.deepEqual(strayPaths({ ".agent/skills": ["antigravity"] }, root), []);
  });
});
