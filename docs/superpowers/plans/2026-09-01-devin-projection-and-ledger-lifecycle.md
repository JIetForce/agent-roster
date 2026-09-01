# Devin Projection and Ledger Lifecycle Implementation Plan

> **For agentic workers:** this repository's `AGENTS.md` is the execution contract, and it
> **supersedes** `superpowers:subagent-driven-development` and `superpowers:executing-plans` — do not
> invoke either. Run one cycle of the `AGENTS.md` loop per task below: coordinator writes the spec →
> `developer` implements → capture the diff → `verifier` → three reviewers in parallel → coordinator
> commits. **The developer does not commit.** Each task's `Commit` step states the pathspec the
> coordinator uses at step 8, after every verdict is in. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the Devin projection actually bind at dispatch (profile, tools, model), and make one
delivery produce one commit.

**Architecture:** Five independent tasks against the generator, its config, the contract and the
doctor. Nothing changes in the six role bodies — this is a change to how roles are dispatched and
how the loop closes, not to what the roles do. The capability class stays the source of permissions;
a new `role_overrides` block refines only what genuinely differs per role, and the existing validator
re-checks the *generated* file against the class invariants, so an override cannot widen a role.

**Tech Stack:** Node 20+ ESM scripts (`scripts/*.mjs`), `node:test` + `node:assert/strict`, no
runtime dependencies. Devin CLI 3000.6.7 for the empirical checks.

**Spec:** `docs/superpowers/specs/2026-09-01-devin-projection-and-ledger-lifecycle-design.md`

## Global Constraints

- Model slugs, verbatim: `glm-5-2` (GLM-5.2 High, 200K, Free), `swe-1-7` (SWE-1.7 Max, 262K, Free).
- **Never `swe-1-7-medium`**, even though it is also free.
- **Never the bare alias `swe`** — it resolves to SWE-1.7 Lightning, $2.5 / $12.5 per 1M.
- Both free tiers are a promotion that **ends 2026-09-16**.
- Claude Code profiles keep `model: sonnet`. `glm-*` and `swe-*` exist only inside Devin.
- No vendor model slug may appear in `agents/roles/*/role.md`. Roles stay harness-agnostic.
- Generated files carry a `DO NOT EDIT` banner: never hand-edit `.devin/`, `.claude/`, `.agent/`,
  `.codex/`, `.cursor/`. Change the source, then run `npm run sync:agents`.
- `npm test` is the host application's; this repository's suite is `npm run test:agents`.

---

### Task 1: Per-role model overrides

**Files:**
- Modify: `config/agents.json` — `tools.devin` block
- Modify: `scripts/sync-agents.mjs:189-197` — the generation loop
- Modify: `tests/sync-agents.test.mjs` — add a describe block
- Modify: `README.md` — the "capability class, not per-harness settings" claim
- Regenerated: `.devin/agents/*.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `config.tools.<harness>.role_overrides.<role>` — an object shallow-merged over the class
  block, consumed by the generation loop in `scripts/sync-agents.mjs`. Later tasks edit sibling keys
  of `tools.devin` and must not disturb it.

- [ ] **Step 1: Write the failing test**

Append a new top-level `describe` block at the end of `tests/sync-agents.test.mjs`. `ROLES` and
`run` are already module-level there; do not redeclare them.

```javascript
describe("per-role model overrides", () => {
  it("devin: code-reviewer is pinned to swe-1-7, every other role to glm-5-2", () => {
    const modelOf = (role) =>
      readFileSync(`.devin/agents/${role}.md`, "utf8").match(/^model: (.+)$/m)?.[1];

    assert.equal(modelOf("code-reviewer"), "swe-1-7");
    for (const role of ROLES.filter((r) => r !== "code-reviewer")) {
      assert.equal(modelOf(role), "glm-5-2", `${role}: expected the primary model`);
    }
  });

  it("an override refines its class without dropping the class's other keys", () => {
    // code-reviewer is `readonly`: the override changes the model only, so the
    // class's tool allowlist must survive the merge intact.
    const f = readFileSync(".devin/agents/code-reviewer.md", "utf8");
    assert.match(f, /^allowed-tools:\n  - read\n  - grep\n  - glob\n/m);
  });

  it("claude profiles are untouched by devin's overrides", () => {
    for (const role of ROLES) {
      assert.match(
        readFileSync(`.claude/agents/${role}.md`, "utf8"),
        /^model: sonnet$/m,
        `${role}: claude profile lost its model`,
      );
    }
  });

  it("rejects an override for a role that does not exist", () => {
    const original = readFileSync("config/agents.json", "utf8");
    const cfg = JSON.parse(original);
    cfg.tools.devin.role_overrides = { "no-such-role": { model: "glm-5-2" } };
    writeFileSync("config/agents.json", JSON.stringify(cfg, null, 2) + "\n");
    try {
      // execFileSync throws an Error whose *message* is only "Command failed";
      // the generator's own text lands on stderr, so assert against that.
      let err;
      try {
        run(["scripts/sync-agents.mjs"]);
      } catch (e) {
        err = e;
      }
      assert.ok(err, "sync accepted an override naming a role that does not exist");
      assert.match(String(err.stderr ?? err.message), /no-such-role/);
    } finally {
      writeFileSync("config/agents.json", original);
      run(["scripts/sync-agents.mjs"]);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/sync-agents.test.mjs`
Expected: FAIL — `modelOf("code-reviewer")` is `sonnet`, not `swe-1-7`.

- [ ] **Step 3: Add the override block to `config/agents.json`**

Replace the whole `tools.devin` block with:

```json
    "devin": {
      "readonly": {
        "model": "glm-5-2",
        "allowed-tools": ["read", "grep", "glob"],
        "permissions": { "deny": ["write", "edit", "notebook_edit", "exec"] }
      },
      "verifier": {
        "model": "glm-5-2",
        "allowed-tools": ["read", "grep", "glob", "exec"],
        "permissions": { "deny": ["write", "edit", "notebook_edit"] }
      },
      "implementer": {
        "model": "glm-5-2",
        "allowed-tools": ["read", "grep", "glob", "exec", "edit", "write"]
      },
      "role_overrides": {
        "code-reviewer": { "model": "swe-1-7" }
      }
    },
```

The `permissions` blocks stay here on purpose — Task 2 removes them, and keeping the two changes
apart keeps each reviewable on its own.

- [ ] **Step 4: Merge the override in the generator**

In `scripts/sync-agents.mjs`, in the `for (const { meta, body } of roles)` loop, replace:

```javascript
    const cfg = config.tools[tool]?.[meta.class];
    if (!cfg) {
      throw new Error(
        `config/agents.json: tool "${tool}" has no entry for class ` +
          `"${meta.class}" (role ${meta.name}). Add one, or remove the tool.`,
      );
    }
```

with:

```javascript
    const classCfg = config.tools[tool]?.[meta.class];
    if (!classCfg) {
      throw new Error(
        `config/agents.json: tool "${tool}" has no entry for class ` +
          `"${meta.class}" (role ${meta.name}). Add one, or remove the tool.`,
      );
    }
    // The class grants permissions; a role override refines what differs per
    // role — in practice the model. It is a shallow merge, and it is not a
    // security boundary: `npm run validate:agents` re-checks the *generated*
    // file against the class invariants, so an override that widened a
    // readonly role's tools would still fail the build.
    const cfg = { ...classCfg, ...(config.tools[tool]?.role_overrides?.[meta.name] ?? {}) };
```

- [ ] **Step 5: Reject an override naming a role that does not exist**

A typo in `role_overrides` would otherwise do nothing at all, silently — which is the exact failure
mode this whole change exists to fix. Immediately after `const roles = readdirSync(...)` in
`scripts/sync-agents.mjs`, add:

```javascript
// An override keyed by a name no role has is a typo that would otherwise apply
// to nothing, silently, forever.
const roleNames = new Set(roles.map((r) => r.meta.name));
for (const [tool, toolCfg] of Object.entries(config.tools)) {
  for (const name of Object.keys(toolCfg.role_overrides ?? {})) {
    if (!roleNames.has(name)) {
      throw new Error(
        `config/agents.json: tools.${tool}.role_overrides."${name}" names no role ` +
          `(known roles: ${[...roleNames].sort().join(", ")})`,
      );
    }
  }
}
```

- [ ] **Step 6: Regenerate and run the tests**

Run: `npm run sync:agents && node --test tests/sync-agents.test.mjs`
Expected: PASS. `.devin/agents/code-reviewer.md` now reads `model: swe-1-7`, the other five
`model: glm-5-2`.

- [ ] **Step 7: Correct the README's class claim**

In `README.md`, the paragraph under the roles table currently reads:

> A role declares a **capability class**, not per-harness settings. `config/agents.json` maps each
> class to every harness's own permission vocabulary once, so adding a role costs one file instead of
> five config blocks.

Append to it:

```markdown
The class is what grants permissions. Where one role genuinely needs a different *setting* — not
different permissions — `tools.<harness>.role_overrides.<role>` refines it. Today that is one entry:
`code-reviewer` runs a different model family from the `developer` whose diff it reads, so the widest
review lens does not share the author's blind spots.

Devin roles run free models during a promotion that **ends 2026-09-16**: `glm-5-2` (GLM-5.2 High)
everywhere, `swe-1-7` (SWE-1.7 Max) for `code-reviewer`. Two traps worth naming: `swe-1-7-medium` is
also free and is deliberately unused, and the bare alias `swe` is *not* free — it resolves to
SWE-1.7 Lightning. `npm run doctor:agents` re-checks both facts against the installed CLI.
```

- [ ] **Step 8: Full suite**

Run: `npm run test:agents`
Expected: PASS, including `validate:agents` (the override must not have widened anything).

- [ ] **Step 9: Commit** — coordinator only, at step 8 of the loop, after all verdicts

```bash
git commit -m "feat(agents): per-role model overrides, Devin roles onto free models" -- \
  config/agents.json scripts/sync-agents.mjs tests/sync-agents.test.mjs README.md \
  .devin/agents config/.agents-manifest.json docs/superpowers .roster
```

The spec and this plan ride along in this first commit — they are not committed separately.

---

### Task 2: Remove the `permissions` key Devin ignores

**Files:**
- Modify: `config/agents.json` — drop `permissions` from `tools.devin.readonly` and
  `tools.devin.verifier`
- Modify: `tests/sync-agents.test.mjs:112-120` — the test that asserts the ignored key
- Modify: `scripts/validate-agents.mjs:52-59` — the comment that describes it
- Regenerated: `.devin/agents/*.md`

**Interfaces:**
- Consumes: Task 1's `tools.devin` block.
- Produces: nothing new. After this task no generated Devin profile contains a `permissions:` key.

- [ ] **Step 1: Rewrite the no-op test**

Devin reports `CFG005: unsupported frontmatter key(s) ignored: permissions`, so the current test
asserts the presence of a key the runtime discards. Replace the whole
`it("devin: denies write, edit and exec explicitly", ...)` block with:

```javascript
  it("devin: readonly roles grant exactly read, grep and glob", () => {
    // `allowed-tools` is an allowlist and Devin enforces it: a subagent under a
    // readonly profile is handed `find_file_by_name`, `grep`, `read` and nothing
    // else. `permissions` is NOT enforced (CFG005: unsupported key), so this
    // assertion deliberately reads the field that binds.
    for (const role of READONLY) {
      const f = readFileSync(`.devin/agents/${role}.md`, "utf8");
      const grant = f.match(/^allowed-tools:\n(?:  - .*\n)*/m)?.[0] ?? "";
      assert.equal(
        grant,
        "allowed-tools:\n  - read\n  - grep\n  - glob\n",
        `${role}: devin allowlist is not exactly the read-only three`,
      );
    }
  });

  it("devin: no profile carries the unsupported permissions key", () => {
    for (const role of ROLES) {
      const f = readFileSync(`.devin/agents/${role}.md`, "utf8");
      assert.ok(
        !/^permissions:/m.test(f),
        `${role}: devin ignores \`permissions\` (CFG005) — remove it from config/agents.json`,
      );
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/sync-agents.test.mjs`
Expected: FAIL on the second test — every readonly profile still carries `permissions:`.

- [ ] **Step 3: Drop the key from the config**

In `config/agents.json`, `tools.devin` becomes:

```json
    "devin": {
      "readonly": {
        "model": "glm-5-2",
        "allowed-tools": ["read", "grep", "glob"]
      },
      "verifier": {
        "model": "glm-5-2",
        "allowed-tools": ["read", "grep", "glob", "exec"]
      },
      "implementer": {
        "model": "glm-5-2",
        "allowed-tools": ["read", "grep", "glob", "exec", "edit", "write"]
      },
      "role_overrides": {
        "code-reviewer": { "model": "swe-1-7" }
      }
    },
```

- [ ] **Step 4: Correct the validator's comment**

In `scripts/validate-agents.mjs`, the comment above `GRANT_FIELD` claims Devin's `permissions.deny`
spells out the denied words. That becomes false. Replace:

```javascript
// Markers are checked against each tool's write-*grant* field only, never
// against the whole file. Devin's `permissions.deny` and Claude's
// `disallowedTools` spell out these exact words ("write", "edit", ...) to
// deny them — a whole-file substring search would flag a role for the very
// text that proves it cannot act. Scoping to the grant field (the `tools:`
// line for Claude, the `allowed-tools:` block for Devin) keeps the assertion
// meaningful instead of weakening it. Antigravity/Cursor/Codex have no such
// deny-list echo, so their markers are checked against the whole file.
```

with:

```javascript
// Markers are checked against each tool's write-*grant* field only, never
// against the whole file. Claude's `disallowedTools` spells out these exact
// words ("Write", "Edit", ...) to deny them — a whole-file substring search
// would flag a role for the very text that proves it cannot act. Scoping to
// the grant field (the `tools:` line for Claude, the `allowed-tools:` block
// for Devin) keeps the assertion meaningful instead of weakening it.
// Devin has no deny-list to echo: it ignores a `permissions` key in a subagent
// profile (CFG005) and enforces `allowed-tools` alone, which is why that
// allowlist is the only field worth reading here.
// Antigravity/Cursor/Codex have no such echo either, so their markers are
// checked against the whole file.
```

- [ ] **Step 5: Regenerate and verify**

Run: `npm run sync:agents && npm run test:agents`
Expected: PASS.

- [ ] **Step 6: Verify against the CLI**

Run: `devin doctor`
Expected: `pass custom subagent profiles — 6 profile(s) loaded: ...` and **zero** `CFG005` warnings.

- [ ] **Step 7: Commit** — coordinator only, after all verdicts

```bash
git commit -m "fix(agents): drop the permissions key Devin ignores, test the allowlist that binds" -- \
  config/agents.json scripts/validate-agents.mjs tests/sync-agents.test.mjs \
  .devin/agents config/.agents-manifest.json .roster
```

---

### Task 3: Dispatch by named profile

**Files:**
- Modify: `AGENTS.md:280` — the Devin bullet under `## Dispatch, per harness`
- Modify: `AGENTS.md:215-217` — the Devin bullet under `### Per-tool concurrency facts`
- Modify: `config/agents.json` — `dispatch_lines.devin`
- Modify: `README.md` — `## Verification status`
- Modify: `tests/sync-agents.test.mjs` — the skill projection test
- Regenerated: `.devin/skills/review-loop/SKILL.md`

**Interfaces:**
- Consumes: the profile names generated by Task 1 — they are the `run_subagent` enum values.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Tighten the skill projection test**

In `tests/sync-agents.test.mjs`, the `harness skill projection` test checks only that the Devin copy
contains `run_subagent`. Add, inside that same `describe` block:

```javascript
  it("devin's dispatch line names the profile, not the general subagent", () => {
    const text = readFileSync(".devin/skills/review-loop/SKILL.md", "utf8");
    assert.match(text, /profile: "<role>"/, "dispatch line does not pass a named profile");
    assert.match(text, /is_background/, "dispatch line does not state foreground vs background");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/sync-agents.test.mjs`
Expected: FAIL — the generated skill still says `subagent_general`.

- [ ] **Step 3: Rewrite `dispatch_lines.devin`**

In `config/agents.json`, replace the `devin` entry of `dispatch_lines` with:

```json
    "devin":       "Dispatch each role with `run_subagent` using `profile: \"<role>\"` — the six roles are profiles Devin loads from `.devin/agents/`, and the profile is what binds the role's tools and model. Never substitute `subagent_general` or `subagent_explore` for a role: that discards both. The spec (and, for reviewers, the diff path) goes in `task`. **`developer` and `verifier` run with `is_background: false`**; the researcher and the three reviewers run with `is_background: true`, which is what makes them concurrent — Devin allows only one foreground subagent at a time.",
```

- [ ] **Step 4: Rewrite the `AGENTS.md` dispatch bullet**

Replace the `- **Devin** — ...` bullet under `## Dispatch, per harness` with:

```markdown
- **Devin** — `run_subagent` with `profile: "<role>"`. The six roles are subagent profiles Devin
  loads from `.devin/agents/`; confirm with `devin doctor`, which reports how many it loaded. The
  profile is what binds the role's tool allowlist and its model, so **never substitute
  `subagent_general` or `subagent_explore` for a role** — that hands the work to a general-purpose
  agent with full tool access and the session's model, and the roster stops meaning anything. Put
  the spec (and, for a reviewer, the diff path) in `task`; the role definition itself is already the
  profile's system prompt and does not need to be repeated. `developer` and `verifier` run with
  `is_background: false`; the researcher and the three reviewers run with `is_background: true` —
  see `### Per-tool concurrency facts`.
```

- [ ] **Step 5: Rewrite the `AGENTS.md` concurrency bullet**

Replace the `- **Devin** — concurrent. A **background** subagent auto-denies ...` bullet under
`### Per-tool concurrency facts` with:

```markdown
- **Devin** — concurrent, but **only one foreground subagent at a time**. `researcher`,
  `code-reviewer`, `security-reviewer` and `quality-reviewer` therefore go `is_background: true`:
  their three tools are read-only and auto-approved, so a background run is safe, and it is the only
  way to get the three lenses onto one diff at once. `developer` and `verifier` go
  `is_background: false` — a background subagent auto-denies any tool you have not already approved
  this session, so a background writer fails the first time it runs a command.
```

- [ ] **Step 6: Record what is now verified, in `README.md`**

Under `## Verification status`, after the existing two exceptions, add:

```markdown
- **Devin's profile behaviour is verified empirically**, against CLI 3000.6.7 on 2026-09-01, not
  from documentation: `devin doctor` reports the six profiles loaded, `run_subagent`'s `profile`
  parameter is an enum containing all six role names, `model:` binds (a subagent dispatched under a
  profile reports that profile's model, not the parent session's), `allowed-tools:` is enforced (a
  readonly role is handed exactly `find_file_by_name`, `grep`, `read`), and `permissions:` is ignored
  outright. A profile with no `model:` key does not inherit the session model — it falls to Devin's
  own subagent default.
```

- [ ] **Step 7: Regenerate and verify**

Run: `npm run sync:agents && npm run test:agents`
Expected: PASS.

- [ ] **Step 8: Verify end-to-end against the CLI**

Run:

```bash
devin --model swe-1-7 --respect-workspace-trust false -p 'Call run_subagent with profile="code-reviewer", is_background=false, title="probe", task="From your own context only, no file reads: name your model, and list the exact names of every tool you have." Report its answer verbatim.'
```

Expected: the subagent reports SWE-1.7 and a toolset of `find_file_by_name`, `grep`, `read`. Repeat
with `profile="researcher"` and expect GLM-5.2. Both models are free; this costs nothing.

- [ ] **Step 9: Commit** — coordinator only, after all verdicts

```bash
git commit -m "fix(agents): dispatch Devin roles by profile instead of subagent_general" -- \
  AGENTS.md README.md config/agents.json tests/sync-agents.test.mjs \
  .devin/skills .claude/skills .agent/skills .codex/skills config/.agents-manifest.json .roster
```

---

### Task 4: The doctor catches this class of defect

**Files:**
- Create: `scripts/lib/devin-models.mjs`
- Create: `tests/fixtures/devin-models-list.txt`
- Create: `tests/devin-models.test.mjs`
- Modify: `scripts/doctor-agents.mjs` — a new section before `Installed CLIs`
- Modify: `README.md` — retire Task 1's forward-looking sentence (Step 7)

**Interfaces:**
- Consumes: `config.tools.<harness>.<class>.model` and `config.tools.<harness>.role_overrides.<role>.model`
  from Task 1.
- Produces: `parseModelCatalog(text) -> Map<slug, { label: string, free: boolean }>`, exported from
  `scripts/lib/devin-models.mjs`.

- [ ] **Step 1: Capture the fixture**

Run: `devin models list > tests/fixtures/devin-models-list.txt`

If the CLI is absent, write the fixture by hand with at least these lines, which are the shapes the
parser must handle — a family header, an alias line with no bracket, a free model and a priced one:

```text
SWE-1.7 (swe-1.7)
  swe-1-7                                SWE-1.7 Max  [262K context, Free]
  swe-1-7-medium                         SWE-1.7 Medium  [262K context, Free]

SWE-1.7 Lightning (swe-1.7-lightning)
  aliases: swe
  swe-1-7-lightning                      SWE-1.7 Lightning Max  [202752 context, $2.5 / 1M Input · $1 / 1M Cached input · $12.5 / 1M Output]

GLM-5.2 (glm-5.2)
  glm-5-2                                GLM-5.2 High  [200K context, Free]
  glm-5-2-max                            GLM-5.2 Max  [200K context, $0.7 / 1M Input · $0.13 / 1M Cached input · $2.2 / 1M Output]
```

- [ ] **Step 2: Write the failing test**

Create `tests/devin-models.test.mjs`:

```javascript
// tests/devin-models.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseModelCatalog } from "../scripts/lib/devin-models.mjs";

const catalog = parseModelCatalog(
  readFileSync("tests/fixtures/devin-models-list.txt", "utf8"),
);

describe("devin model catalog", () => {
  it("reads a free model", () => {
    assert.equal(catalog.get("swe-1-7").free, true);
    assert.equal(catalog.get("swe-1-7").label, "SWE-1.7 Max");
  });

  it("reads a priced model as not free", () => {
    assert.equal(catalog.get("swe-1-7-lightning").free, false);
  });

  it("does not mistake an alias line for a model", () => {
    assert.equal(catalog.has("aliases:"), false);
    assert.equal(catalog.has("swe"), false);
  });

  it("reads every model this repository pins", () => {
    for (const slug of ["glm-5-2", "swe-1-7"]) {
      assert.ok(catalog.has(slug), `catalog is missing ${slug}`);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/devin-models.test.mjs`
Expected: FAIL — `scripts/lib/devin-models.mjs` does not exist.

- [ ] **Step 4: Write the parser**

Create `scripts/lib/devin-models.mjs`:

```javascript
// `devin models list` prints families at column 0 and their models indented by
// two spaces, each ending in a bracketed context/price summary. Alias lines are
// indented the same way but carry no bracket, which is what separates them.
const MODEL_LINE = /^ {2}(\S+)\s{2,}(.+?)\s*\[([^\]]*)\]\s*$/;

export function parseModelCatalog(text) {
  const catalog = new Map();
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = line.match(MODEL_LINE);
    if (!m) continue;
    const [, slug, label, meta] = m;
    catalog.set(slug, { label: label.trim(), free: /\bFree\b/.test(meta) });
  }
  return catalog;
}

// Every model slug this repository pins, as `${tool}.${role-or-class} -> slug`.
export function pinnedModels(config) {
  const pins = [];
  for (const [tool, toolCfg] of Object.entries(config.tools ?? {})) {
    for (const [cls, cfg] of Object.entries(toolCfg)) {
      if (cls === "role_overrides") continue;
      if (cfg?.model) pins.push({ tool, where: cls, model: cfg.model });
    }
    for (const [role, cfg] of Object.entries(toolCfg.role_overrides ?? {})) {
      if (cfg?.model) pins.push({ tool, where: role, model: cfg.model });
    }
  }
  return pins;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/devin-models.test.mjs`
Expected: PASS.

- [ ] **Step 6: Wire it into the doctor**

In `scripts/doctor-agents.mjs`, add the import at the top:

```javascript
import { parseModelCatalog, pinnedModels } from "./lib/devin-models.mjs";
```

and insert this section immediately before `console.log("\nInstalled CLIs");`:

```javascript
// Devin's own diagnosis of the profiles this roster generated. This is the
// check that would have caught an ignored frontmatter key on day one.
console.log("\nDevin profiles and models");
let devinCli = true;
try {
  execFileSync("command", ["-v", "devin"], { stdio: "pipe", shell: true });
} catch {
  devinCli = false;
}

if (!devinCli) {
  console.log("  info devin CLI absent — skipping profile and model checks");
} else {
  let doctorOut = "";
  try {
    doctorOut = execFileSync("devin", ["doctor"], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    doctorOut = e.stdout ?? "";
  }
  for (const line of doctorOut.split("\n")) {
    // Only a FAIL is this repository's problem. `devin doctor` also warns about
    // things this roster does not own, and a warn that fails the run would make
    // `doctor:agents` red for somebody else's stale config. Surface it without
    // failing, exactly as the antigravity trust check above does.
    if (/^\s*fail\b/i.test(line)) report(false, `devin doctor: ${line.trim()}`);
    else if (/^\s*warn\b/i.test(line)) console.log(`  warn devin doctor: ${line.trim()}`);
  }
  const loaded = doctorOut.match(/(\d+) profile\(s\) loaded/);
  if (loaded) console.log(`  ok   devin doctor: ${loaded[1]} subagent profile(s) loaded`);

  const config = JSON.parse(readFileSync("config/agents.json", "utf8"));
  const pins = pinnedModels(config).filter((p) => p.tool === "devin");
  let catalog;
  try {
    catalog = parseModelCatalog(
      execFileSync("devin", ["models", "list"], { encoding: "utf8", stdio: "pipe" }),
    );
  } catch (e) {
    // An empty catalog would report every pinned model as missing — a wall of
    // false failures for one broken command. Say what actually happened, once,
    // and skip the per-model loop rather than inventing findings.
    report(false, `devin models list failed: ${e.message}`);
  }
  for (const { where, model } of catalog ? pins : []) {
    const entry = catalog.get(model);
    if (!entry) {
      report(false, `devin: ${where} pins model "${model}", which devin models list does not offer`);
    } else if (!entry.free) {
      console.log(`  warn devin: ${where} pins "${model}" (${entry.label}) — no longer free`);
    } else {
      console.log(`  ok   devin: ${where} → ${model} (${entry.label}, free)`);
    }
  }
}
```

- [ ] **Step 7: Retire the promise this task just kept**

Task 1 left a forward-looking sentence in `README.md`, at the end of the model-promotion paragraph:

> The expiry is recorded here deliberately, because nothing enforces it yet — Task 4 of the roster's
> own plan will teach `npm run doctor:agents` to re-check both facts against the installed CLI.

It was accurate when written and stops being accurate the moment this task lands — self-dating prose
with nothing to prompt its rewrite, which is why closing it is a step here rather than a hope.
Replace that sentence with the present-tense fact:

```markdown
`npm run doctor:agents` re-checks both facts against the installed CLI: it fails on a slug that no
longer exists and warns on one that is no longer free, so the expiry reports itself rather than
resting on this paragraph.
```

- [ ] **Step 8: Run the doctor and the suite**

Run: `npm run doctor:agents && npm run test:agents`
Expected: the doctor exits 0, prints six profiles loaded and **four** model lines — `readonly`,
`verifier` and `implementer` on `glm-5-2`, plus the `code-reviewer` override on `swe-1-7` — every one
marked free. Four and not six on purpose: `pinnedModels` reports what the config *pins* (three
classes plus one role override), not what each of the six roles resolves to. No `CFG005` warnings —
Task 2 removed their cause.

- [ ] **Step 9: Commit** — coordinator only, after all verdicts

```bash
git commit -m "feat(doctor): surface devin doctor and check every pinned model is real and free" -- \
  scripts/doctor-agents.mjs scripts/lib/devin-models.mjs README.md \
  tests/devin-models.test.mjs tests/fixtures .roster
```

---

### Task 5: One commit per delivery

**Files:**
- Modify: `AGENTS.md:161-170` — step 8
- Modify: `agents/skills/review-loop/SKILL.md` — step 7
- Regenerated: `.claude/skills/`, `.devin/skills/`, `.agent/skills/`, `.codex/skills/`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This is contract prose; there is no unit test for it, and the plan does not
  pretend otherwise — see Step 5 for how it is actually verified.

- [ ] **Step 1: Reorder step 8 in `AGENTS.md`**

Replace the first bullet of `8. **Decide.**`:

```markdown
   - Every verdict `approved` or `approved_with_notes`, and the verifier passed → close the change
     in this order, which is **one** commit, not two:
     1. Append the delivery line to the ledger.
     2. Archive it — `mkdir -p .roster/archive && mv .roster/ledger.md ".roster/archive/$(date +%F)-<slug>.md"`.
        Plain `mv`, **not** `git mv`: at this point the ledger has never been committed during this
        run, and `git mv` refuses an untracked file (`fatal: not under version control`).
     3. Stage, then commit — **two commands, not one**:

        ```bash
        git add -- <source paths> .roster
        git commit -m "<message>" -- <source paths> .roster
        ```

        `.roster` is safe as a whole directory: `.roster/review/` is git-ignored, so the archived
        ledger is the only thing under it that can be staged. The `git add` is not optional and
        this order is not stylistic — `git commit -- <paths>` commits only paths git already
        tracks, and under this ordering the archived ledger is always a **new** file, so a commit
        without the add fails with `pathspec ... did not match any file(s) known to git` and
        delivers nothing. On the architectural path, use the paths the plan's task specifies.

     One commit per run of this loop, not one per cycle and not one per artefact. Committing before
     the archive is what produced a second, content-free rename commit on every delivery: the ledger
     got swept into the feature commit just so `git mv` had something tracked to move.

     Then summarise for the user. Done.
```

- [ ] **Step 2: Mirror it in the skill**

In `agents/skills/review-loop/SKILL.md`, replace step 7's first sentence:

```markdown
7. Append the cycle block to the ledger, then decide: all approved and verifier green → append the
   delivery line, `mv` the ledger into `.roster/archive/` (plain `mv` — `git mv` fails on a file this
   run never committed), then **you** deliver it in **one** commit: `git add -- <paths> .roster`
   first, then `git commit -m "<msg>" -- <paths> .roster`. Both commands, in that order — the
   archived ledger is a new file, and `git commit` alone only knows paths git already tracks.
   (`-m` goes before `--`; everything after `--` is read as a path.) Then summarise.
   Otherwise merge the required changes and return to step 3.
```

- [ ] **Step 3: Check step 2 still says `git mv`**

Run: `grep -n "git mv" AGENTS.md`
Expected: exactly one hit, inside step 2. There the stale ledger *is* tracked — it was committed by
the delivery that failed to close it — so `git mv` is correct and must stay.

- [ ] **Step 4: Regenerate and run the suite**

Run: `npm run sync:agents && npm run test:agents`
Expected: PASS.

- [ ] **Step 5: Verify by delivering this very task**

There is no unit test for contract prose; the check is the next delivery, and this task is it. After
the commit below, run: `git log --oneline -3 && git show --stat HEAD`
Expected: **one** commit for this task, containing the archived ledger under
`.roster/archive/2026-09-01-*.md` — and **no** `.roster/ledger.md` entry, and no second rename commit.

- [ ] **Step 6: Commit** — coordinator only, after all verdicts

```bash
git commit -m "fix(loop): close a delivery in one commit instead of two" -- \
  AGENTS.md agents/skills/review-loop/SKILL.md \
  .claude/skills .devin/skills .agent/skills .codex/skills config/.agents-manifest.json .roster
```
