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
    const path = ".claude/agents/reviewer.md";
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

  it("devin's dispatch line names the profile, not the general subagent", () => {
    const text = readFileSync(".devin/skills/review-loop/SKILL.md", "utf8");
    assert.match(text, /profile: "<role>"/, "dispatch line does not pass a named profile");
    // Pin the direction, not just the presence of `is_background`. A writer
    // dispatched in the background has its `exec` and `edit` tools auto-denied
    // without a prompt, so it returns a report having changed nothing — the
    // empty-diff failure mode AGENTS.md devotes its "empty diff stops the loop"
    // paragraph to. The line contains both `true` and `false`, so asserting
    // only that each appears somewhere would pass under a reversal. Bind each
    // value to the roles it applies to by matching the surrounding words.
    assert.match(
      text,
      /`developer` and `verifier` run with `is_background: false`/,
      "dispatch line does not put the writers (developer, verifier) in the foreground",
    );
    assert.match(
      text,
      /the researcher and both reviewers run with `is_background: true`/,
      "dispatch line does not put the readers (researcher, both reviewers) in the background",
    );
  });
});

describe("the merged reviewer keeps both lenses structural", () => {
  it("requires a Correctness and a Maintainability subsection", () => {
    const role = readFileSync("agents/roles/reviewer/role.md", "utf8");
    assert.match(role, /^#### Correctness$/m, "reviewer lost its correctness subsection");
    assert.match(role, /^#### Maintainability$/m, "reviewer lost its maintainability subsection");
    assert.match(
      role,
      /omits either subsection is incomplete/,
      "reviewer does not state that a report missing a lens is incomplete",
    );
  });
});

describe("a not-run suite is the coordinator's to run, not a menu", () => {
  // Regression guard for the defect where "run it, or amend the spec, or
  // escalate" read as three coequal options and coordinators took the
  // cheapest one — stopping to ask the human to run the test suite.
  it("verifier hands a not-run suite to the coordinator, without a human-gate framing", () => {
    const role = readFileSync("agents/roles/verifier/role.md", "utf8");
    assert.ok(
      !role.includes("or escalate"),
      "verifier role should not offer escalation as a peer option for a not-run suite",
    );
    assert.ok(
      !role.includes("gates a suite behind a human"),
      "verifier role should not frame a human-gated spec as a legitimate form of verification",
    );
    assert.ok(
      role.includes("the coordinator runs it from there, not you"),
      "verifier role should hand a not-run suite to the coordinator to run",
    );
  });

  it("AGENTS.md makes running the suite the coordinator's default, not a choice coequal with escalating", () => {
    const contract = readFileSync("AGENTS.md", "utf8");
    assert.ok(
      contract.includes("**Run the suite yourself.**"),
      "step 5 should state running the suite yourself as the default, not offer it as one of a menu",
    );
    assert.ok(
      contract.includes("**Never stop the loop to ask the human to run a test suite.**"),
      "step 5 should forbid stopping the loop to ask the human to run tests",
    );
    assert.ok(
      !contract.includes(`run the suite, or amend the spec's "how it is verified"`),
      "step 5 should not still offer run/amend/escalate as an unordered menu",
    );
  });

  it("the review-loop skill states the same unconditional rule, not a menu", () => {
    const skill = readFileSync("agents/skills/review-loop/SKILL.md", "utf8");
    assert.ok(
      /run it yourself/i.test(skill) && /not optional/i.test(skill),
      "skill step 5 should state running the suite yourself as the default, not offer it as one of a menu",
    );
    assert.ok(
      /never stop to ask the human/i.test(skill),
      "skill step 5 should forbid stopping to ask the human to run tests",
    );
  });

  // An earlier attempt kept the unconditional rule but reopened it with
  // "escalation is left only for the case where an unrunnable suite is the sole
  // evidence the change works" — which swallows the rule, since a spec naming
  // one suite makes that suite its sole evidence by definition. Matched at the
  // concept level so a legitimate rewording need not delete this test.
  it("no source reopens an escalation carve-out for the not-run case", () => {
    const CARVE_OUT_SIGNAL = /(sole|only)\s+evidence|escalat\w*[^.]*\bleft\s+only\b/i;
    for (const path of [
      "AGENTS.md",
      "agents/roles/verifier/role.md",
      "agents/skills/review-loop/SKILL.md",
    ]) {
      assert.ok(
        !CARVE_OUT_SIGNAL.test(readFileSync(path, "utf8")),
        `${path}: should not carve an escalation exception back out of the not-run rule`,
      );
    }
  });

  // The delivery summary is the entire replacement for the carve-out removed
  // above: without this, a rewording of exit (1) drops the disclosure silently.
  it("exit (1)'s delivery summary must disclose any suite step 5 amended away", () => {
    const DISCLOSURE_SIGNAL =
      /(name|names|naming|disclos\w*)[^.]*spec-required suite[^.]*(amended away|amend\w*\s+away)[^.]*reason/i;
    for (const path of ["AGENTS.md", "agents/skills/review-loop/SKILL.md"]) {
      assert.ok(
        DISCLOSURE_SIGNAL.test(readFileSync(path, "utf8")),
        `${path}: exit (1) should require naming any spec-required suite step 5 amended away, and why`,
      );
    }
  });
});

describe("review cost is bounded by the size of the change", () => {
  // The loop's acceptance test used to be "no reviewer objects", and that target
  // recedes as the diff grows: every cycle's fix is new surface for the next
  // cycle's findings, all of them true. These rules damp it.
  it("step 1 offers an off-ramp for a change too small to be worth a cycle", () => {
    const contract = readFileSync("AGENTS.md", "utf8");
    assert.match(contract, /\|\s*\*\*Trivial\*\*/, "step 1's table should carry a trivial row");
    assert.match(contract, /off-ramp/i, "the trivial row should be named as an off-ramp, not left implicit");
  });

  it("the coordinator may not promote a note into the developer's work item", () => {
    for (const path of ["AGENTS.md", "agents/skills/review-loop/SKILL.md"]) {
      assert.match(
        readFileSync(path, "utf8"),
        /list may only shrink/i,
        `${path}: exit (4) should forbid growing the work item after the step 1 gate`,
      );
    }
  });

  it("a bounded change gets one review cycle, and the budget is not the coordinator's to extend", () => {
    assert.match(
      readFileSync("AGENTS.md", "utf8"),
      /bounded_review_cycles/,
      "step 9 should name the bounded budget",
    );
    const config = JSON.parse(readFileSync("config/agents.json", "utf8"));
    assert.equal(config.harness.bounded_review_cycles, 1);
  });

  it("both reviewers treat a finding against a previous cycle's remediation as a note", () => {
    for (const path of [
      "agents/roles/reviewer/role.md",
      "agents/roles/security-reviewer/role.md",
    ]) {
      assert.match(
        readFileSync(path, "utf8"),
        /earlier cycle of \*this same run\*/,
        `${path}: self-generated text should stay out of Required changes`,
      );
    }
  });

  it("delivery removes this run's captured diffs", () => {
    for (const path of ["AGENTS.md", "agents/skills/review-loop/SKILL.md"]) {
      assert.match(
        readFileSync(path, "utf8"),
        /rm -f \.roster\/review\/cycle-\*\.diff/,
        `${path}: exit (1) should delete the captured diffs, which nothing else removes`,
      );
    }
  });
});

describe("per-role model overrides", () => {
  it("devin: reviewer is pinned to swe-1-7, every other role to glm-5-2", () => {
    const modelOf = (role) =>
      readFileSync(`.devin/agents/${role}.md`, "utf8").match(/^model: (.+)$/m)?.[1];

    assert.equal(modelOf("reviewer"), "swe-1-7");
    for (const role of ROLES.filter((r) => r !== "reviewer")) {
      assert.equal(modelOf(role), "glm-5-2", `${role}: expected the primary model`);
    }
  });

  it("an override refines its class without dropping the class's other keys", () => {
    // reviewer is `readonly`: the override changes the model only, so the
    // class's tool allowlist must survive the merge intact.
    const f = readFileSync(".devin/agents/reviewer.md", "utf8");
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
