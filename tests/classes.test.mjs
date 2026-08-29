// tests/classes.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CLASSES = new Set(["readonly", "verifier", "implementer"]);
const config = JSON.parse(readFileSync("config/agents.json", "utf8"));

const roles = readdirSync("agents/roles", { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => {
    const raw = readFileSync(join("agents/roles", e.name, "role.md"), "utf8");
    const fm = raw.match(/^---\n([\s\S]*?)\n---/)[1];
    const meta = Object.fromEntries(
      fm.split("\n").filter(Boolean).map((l) => {
        const kv = l.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        return [kv[1], kv[2].trim().replace(/^['"]|['"]$/g, "")];
      }),
    );
    return { dir: e.name, meta };
  });

describe("capability classes", () => {
  it("every role declares a known class", () => {
    for (const { dir, meta } of roles) {
      assert.ok(meta.class, `${dir}: role.md has no \`class\``);
      assert.ok(CLASSES.has(meta.class), `${dir}: unknown class "${meta.class}"`);
    }
  });

  it("every tool configures every class a role actually uses", () => {
    const used = new Set(roles.map((r) => r.meta.class));
    for (const tool of Object.keys(config.tool_meta)) {
      for (const cls of used) {
        assert.ok(
          config.tools[tool]?.[cls],
          `config/agents.json: ${tool} has no entry for class "${cls}"`,
        );
      }
    }
  });

  it("no role declares the removed `type` key", () => {
    for (const { dir, meta } of roles) {
      assert.equal(meta.type, undefined, `${dir}: \`type\` was replaced by \`class\``);
    }
  });
});
