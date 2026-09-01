// tests/collisions.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

describe("discovery collisions", () => {
  // The matrix and the collision logic live in scripts/lib/discovery.mjs and are
  // unit-tested against fixtures in tests/discovery.test.mjs. What this asserts
  // is the end-to-end claim: run the doctor over THIS repository, as a human
  // would, and it finds nothing. Duplicating the matrix here would mean two
  // copies that can disagree, and the copy in the test is the one nobody updates.
  it("the doctor reports no problem against this repository", () => {
    try {
      execFileSync("node", ["scripts/doctor-agents.mjs"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (err) {
      assert.fail(`doctor reported problems:\n${err.stdout ?? err.message}`);
    }
  });

  // The doctor hard-fails when `.roster/review/` is git-ignored (AGENTS.md
  // step 4): readonly reviewers cannot reconstruct a diff they cannot open,
  // and Devin background subagents / Gemini-based harnesses skip ignored paths
  // during file discovery entirely. The test above only exercises the passing
  // case, so without this the fail path could be silently reverted to a warn
  // with `npm run test:agents` staying green. The mutate-and-restore pattern
  // follows tests/sync-agents.test.mjs:239-258: read the tracked file, mutate,
  // restore in `finally` so the repository is left exactly as found even when
  // the assertion throws.
  it("the doctor fails when .roster/review/ is git-ignored", () => {
    const original = readFileSync(".gitignore", "utf8");
    try {
      appendFileSync(".gitignore", "\n.roster/review/\n");
      let err;
      try {
        execFileSync("node", ["scripts/doctor-agents.mjs"], {
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (e) {
        err = e;
      }
      assert.ok(err, "doctor exited 0 with .roster/review/ ignored");
      assert.match(
        String(err.stdout ?? err.message),
        /\.roster\/review\//,
        "doctor's failure message did not mention .roster/review/",
      );
    } finally {
      writeFileSync(".gitignore", original);
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
