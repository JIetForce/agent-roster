// tests/collisions.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

describe("discovery collisions", () => {
  // The discovery matrix lives in scripts/doctor-agents.mjs and nowhere else.
  // Duplicating it here would mean two copies that can disagree, and the copy
  // in the test is the one nobody updates.
  it("no tool discovers agent definitions from more than one source", () => {
    try {
      execFileSync("node", ["scripts/doctor-agents.mjs"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (err) {
      assert.fail(`doctor reported problems:\n${err.stdout ?? err.message}`);
    }
  });

  it("devin's claude import is disabled", () => {
    assert.ok(existsSync(".devin/config.json"), "missing .devin/config.json");
    const cfg = JSON.parse(readFileSync(".devin/config.json", "utf8"));
    assert.equal(
      cfg.read_config_from?.claude,
      false,
      "Devin would import .claude/agents and .claude/skills as duplicate profiles",
    );
  });

  it("cursor's own directory exists to shadow its compat reads", () => {
    // Cursor also reads .claude/agents and .codex/agents; .cursor/ wins on name
    // conflict, but only if the shadowing file is actually there. The role list
    // itself lives in agents/roles/, not duplicated here, so it stays correct as
    // roles are added or removed.
    if (existsSync(".claude/agents") || existsSync(".codex/agents")) {
      const roles = readdirSync("agents/roles", { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      for (const role of roles) {
        assert.ok(
          existsSync(`.cursor/agents/${role}.md`),
          `Cursor would fall through to a foreign definition of ${role}`,
        );
      }
    }
  });
});
