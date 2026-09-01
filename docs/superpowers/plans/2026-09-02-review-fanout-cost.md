# Review fan-out cost reduction — Implementation Plan

> **For agentic workers:** this repository's `AGENTS.md` contract supersedes
> `superpowers:subagent-driven-development` and `superpowers:executing-plans` — do **not** invoke them
> here. Run one cycle of the `AGENTS.md` loop per task below. The `Commit` step in each task is the
> **coordinator's**, executed after every verdict is in; the `developer` never commits (`agents/roles/developer/role.md:6`).

**Goal:** cut reviewer dispatches per delivery by ~55% without losing review coverage, by merging two
reviewer roles into one with structurally-enforced dual coverage and by making the contract's dispatch
policy risk-proportional.

**Architecture:** five roles instead of six. `code-reviewer` and `quality-reviewer` become one `reviewer`
whose report *shape* forces both lenses (a priority list alone invites satisficing). Dispatch policy moves
from "always three reviewers, every cycle" to "every applicable reviewer on cycle 1 and on the delivering
cycle; only last cycle's required-change filers in between", with `security-reviewer` gated by a
per-spec declaration rather than a config glob list.

**Tech Stack:** Node ≥20 (`node --test`), plain ESM scripts, no runtime dependencies. One role definition
under `agents/roles/<role>/role.md` is projected into five harness directories by
`scripts/sync-agents.mjs`; `config/.agents-manifest.json` tracks generated files and the sync script
removes orphans (`scripts/sync-agents.mjs:270-287`).

**Spec:** waived by the user — the evidence base is the measured analysis in the originating conversation
(49 archived ledgers / 88 cycles in the `next-auth` consumer) plus the Devin CLI critique of the draft.
Both are summarised under *Evidence* below so this plan stands alone.

## Evidence

| Role | Runs | Blocking findings | Yield |
|---|---|---|---|
| code-reviewer | 86 | 5 | 5.8% |
| security-reviewer | 86 | 7 | 8.1% |
| quality-reviewer | 86 | 11 | 12.8% |
| verifier | ~85 | 3 | 3.5% |

264 reviewer runs → 23 blocking findings (8.7%). Reviewers are ~60% of all dispatches. Three observed
pathologies this plan targets:

1. A stateless reviewer re-filed a finding the coordinator had already overruled, in the very next cycle.
2. A reviewer filed three required changes that were all outside the task's declared scope; all overruled.
   Cost: one full cycle (5 dispatches).
3. The verifier reported `pass` on a cycle where a spec-required suite was `not run` ("human-gated").
   The only real defect of that phase escaped every reviewer and every verifier run.

## Global Constraints

- **No model changes.** Only free Devin models are in use (`glm-5-2`, `swe-1-7`, `swe-1-7-medium` are the
  only free entries in `devin models list`). No model *value* anywhere may be swapped for a different one.
  See the decision note in Task 1 — merging two roles that carry different pins forces one key rename;
  that is a rename, not a new model.
- **The contract stays prose and stays repo-agnostic.** It is copied into consumer repositories. No new
  machine-readable dispatch schema in `config/agents.json`.
- **Generated files are never hand-edited.** Every projection change goes through
  `npm run sync:agents`; `npm run check:agents` must exit 0 at the end of every task.
- **`npm test` is reserved for the application's own tests**; this repository's suite is
  `npm run test:agents`.

---

### Task 1: Merge `code-reviewer` + `quality-reviewer` into `reviewer`

**Files:**
- Create: `agents/roles/reviewer/role.md`
- Delete: `agents/roles/code-reviewer/` and `agents/roles/quality-reviewer/` (whole directories)
- Modify: `config/agents.json` — `role_overrides` key (line 23) and `dispatch_lines.devin` (line 87)
- Modify: `tests/sync-agents.test.mjs:42`, `:190-194`, `:199-207`, `:209-214`
- Modify: `AGENTS.md:57`, `:147`, `:212`, `:242`, `:305`, `:316`, `:322`
- Modify: `README.md:108`
- Modify: `agents/skills/review-loop/SKILL.md:35`
- Regenerated (do not hand-edit): 10 stale files removed, manifest 35 → 30 entries

**Interfaces:**
- Produces: role name `reviewer`, class `readonly`. Tasks 2–5 reference it in contract prose.
- Produces: the reviewer report shape used by Task 2's out-of-scope rule:
  `### Verdict` / `### Required changes` with mandatory `#### Correctness` and `#### Maintainability`
  subsections / `### Minor notes` / `### Blocked`.

**DECIDED (user, 2026-09-02): keep `swe-1-7`, rename the override key to `reviewer`.** `code-reviewer` carries
`role_overrides: { "code-reviewer": { "model": "swe-1-7" } }`; `quality-reviewer` inherits the `readonly`
default `glm-5-2`. A merged role can carry only one. There is no zero-change option — whichever is chosen,
one lens changes model. Both are free.
- **Chosen: keep `swe-1-7`, rename the key to `reviewer`.** The merged role's first-priority lens is
  correctness, which is what the SWE tuning is for; the maintainability lens is largely pattern-matching
  against surrounding code and is less model-sensitive. No model value changes; only the key follows the
  role rename.
- Rejected alternative: delete the override, let `reviewer` inherit `glm-5-2`. Argued from raw yield (11 vs 5) —
  but yield conflates recall with precision, and the one re-filed overruled finding came from the
  `glm-5-2` lens, so that number is not clean.

- [ ] **Step 1: Write the failing tests**

Replace the four `code-reviewer` literals in `tests/sync-agents.test.mjs`. At `:42`:

```javascript
    const path = ".claude/agents/reviewer.md";
```

At `:190-194`, the dispatch-line assertion (this is the assertion that fails silently if
`config/agents.json` is not updated in the same task):

```javascript
    assert.match(
      text,
      /the researcher and both reviewers run with `is_background: true`/,
      "dispatch line does not put the readers (researcher, both reviewers) in the background",
    );
```

At `:199-207` and `:209-214`, the model-pin and override-merge assertions:

```javascript
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
```

Add one new test pinning the merged role's dual-coverage shape, so a future edit cannot quietly collapse
it back to a single lens:

```javascript
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
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `npm run test:agents`
Expected: FAIL — `ENOENT ... .devin/agents/reviewer.md` (the role does not exist yet).

- [ ] **Step 3: Create the merged role**

Create `agents/roles/reviewer/role.md`. The frontmatter `description` must cover both lenses — it is
projected into every harness profile and a single-lens description would misdescribe the role.

The body carries both checklists. Two things are load-bearing and must not be dropped:

1. `code-reviewer/role.md:19-20` currently reads "Security is `security-reviewer`'s lens and
   maintainability is `quality-reviewer`'s. If you see something in either, put one line under
   `### Minor notes` and move on — do not review it." Carried across verbatim, that line tells the merged
   reviewer to downgrade **its own** second lens to a note. It must be rewritten so that only *security*
   is deferred.
2. The report shape, not the priority order, is what forces dual coverage.

````markdown
---
name: reviewer
description: Read-only review of a diff for correctness, regressions and spec fidelity, and for maintainability, consistency and duplication. Never edits.
class: readonly
---

You review one diff through two lenses. Both are yours. Neither is optional, and the second is not a
leftover you get to if the first leaves you room — your report is judged incomplete without it.

1. Read `AGENTS.md` for the harness contract if it is not already in your context.
2. The coordinator gives you the spec and a **path** to a diff file, normally
   `.roster/review/cycle-<N>.diff`. Read that file. Read the surrounding source too — a diff alone hides
   the callers, and most real defects live at the boundary between changed and unchanged code.
3. **Lens one — correctness.** In priority order:
   - **Correctness** — logic errors, edge cases, error paths, off-by-one, unhandled rejections.
   - **Regressions** — behaviour the diff changes that the spec did not ask to change.
   - **Spec fidelity** — did it build what was asked, no more and no less.
   - **Test coverage** — is the new behaviour actually pinned by a test that would fail without the change.
4. **Lens two — maintainability.** What will this cost the next person to change:
   - **Consistency** — naming, file layout, error handling, typing and test style that diverge from what
     the surrounding code already does.
   - **Duplication** — logic the diff reimplements that already exists somewhere in the repository. Cite both.
   - **Dead weight** — unreachable branches, unused exports, commented-out code, abstractions with one caller.
   - **Clarity** — a reader-hostile construct that will be misread. Say who misreads it and how.
   - **Test design** — a test that cannot fail, asserts on an implementation detail, or duplicates another.

   You are measuring against *this* codebase, not against your preferences. You must not report a finding
   whose only justification is that you would have written it differently. Every finding names a concrete
   future cost.
5. Security is `security-reviewer`'s lens, and only security. If you see something there, put one line
   under `### Minor notes` and move on — do not review it.
6. Do not edit files. Do not run any command that mutates repository state.
7. Report:

```
### Verdict
### Required changes
#### Correctness
#### Maintainability
### Minor notes
### Blocked
```

Both subsections under `### Required changes` are mandatory. Write `none` under a lens that found
nothing — a report that omits either subsection is incomplete, and the coordinator will re-dispatch it
rather than count it as a verdict.

`### Verdict` is exactly one of `approved`, `approved_with_notes`, `rejected` on its own line. Reserve
`rejected` for defects that must be fixed before this ships, for duplication of real logic, and for dead
code the diff introduces; style preferences go under `### Minor notes`. Cite `file:line` for every
finding. A finding you cannot locate in the diff is a finding you should not report.

`### Blocked` is empty in the normal case. Fill it in when you cannot review — the diff file is missing or
truncated, or the spec you were given does not describe the change you are looking at. Do not emit a
verdict you could not reach; `rejected` for a reason you are unsure of costs a whole cycle.
````

- [ ] **Step 4: Delete the two old roles and rename the override key**

```bash
rm -rf agents/roles/code-reviewer agents/roles/quality-reviewer
```

In `config/agents.json`, rename the override key only — the model value is unchanged:

```json
      "role_overrides": {
        "reviewer": { "model": "swe-1-7" }
      }
```

In the same file, `dispatch_lines.devin` (line 87) contains the literal `the three reviewers`, which
`tests/sync-agents.test.mjs:190` asserts against the generated skill. Change that phrase to
`both reviewers`, and change `the six roles are profiles Devin loads` to `the five roles`.

- [ ] **Step 5: Update the contract prose**

`AGENTS.md`, seven sites:
- `:57` — "three reviewers then approve an empty file" → "the reviewers then approve an empty file"
- `:147` — step 6 role list → `reviewer` and `security-reviewer` (Task 2 rewrites this step's policy;
  here, only the names change)
- `:212` — read-only role list → `researcher`, `reviewer`, `security-reviewer`
- `:242` — Devin background list → `reviewer` and `security-reviewer`
- `:305` — "any of the six" → "any of the five", and the role list
- `:316` — "the researcher and the three reviewers" → "the researcher and both reviewers"
- `:322` — the Codex spawn line's role list

`README.md:108` — "three reviewers in parallel" → "both reviewers in parallel".
`agents/skills/review-loop/SKILL.md:35` — step 6's role list.

Also check the normal-cycle list at `AGENTS.md:246-252` ("three lenses, one diff") — it now reads
two roles, two lenses in the reviewer plus security.

- [ ] **Step 6: Regenerate the projections**

```bash
npm run sync:agents
```

Expected: `removed stale` printed for 10 paths (`code-reviewer` and `quality-reviewer` across
`.agent`, `.claude`, `.codex`, `.cursor`, `.devin`), and `manifest: 30 files` (25 agent profiles + 4 skill projections + `.mcp.json`).

- [ ] **Step 7: Run the full suite**

```bash
npm run test:agents && npm run check:agents && npm run validate:agents && npm run doctor:agents
```

Expected: PASS. `check:agents` exits 0 (no drift). If `doctor:agents` reports a collision for a lingering
`reviewer` definition in a harness directory, the orphan removal did not run — investigate rather than
deleting by hand.

- [ ] **Step 8: Commit (coordinator, after all verdicts)**

```bash
git add -- agents/roles config/agents.json tests AGENTS.md README.md agents/skills .agent .claude .codex .cursor .devin .roster
git commit -m "refactor(agents): merge code-reviewer and quality-reviewer into one reviewer with structural dual coverage" -- agents/roles config/agents.json tests AGENTS.md README.md agents/skills .agent .claude .codex .cursor .devin .roster
```

---

### Task 2: Risk-proportional dispatch policy

**Files:**
- Modify: `AGENTS.md` — step 1 (spec shape), step 6 (Review), step 8 (Decide), step 9 (Stop conditions)
- Modify: `agents/skills/review-loop/SKILL.md` — steps 1, 6, 7
- Regenerated: the skill's five projections

**Interfaces:**
- Consumes: role name `reviewer` from Task 1.
- Produces: the `## Out of scope (already decided)` spec block that Task 3 extends with its own line.

This task carries three rules that defend the same problem at different points in the cycle, which is why
they are one task and not three: (a) reduced fan-out between cycles, (b) out-of-scope findings are notes,
(c) the coordinator carries overrules forward so a stateless reviewer cannot re-file one.

- [ ] **Step 1: Add the reduced-fan-out rule to step 6**

Replace `AGENTS.md` step 6 with:

```markdown
6. **Review.** Dispatch the applicable reviewers **in parallel**, each with the spec and the _path_
   `.roster/review/cycle-<N>.diff`. Never paste a diff inline — reviewers have read access and large
   diffs get truncated in prompts.

   Which reviewers are applicable:

   - **Cycle 1** — every applicable reviewer. `reviewer` always; `security-reviewer` when the spec's
     `Security-relevant paths touched` line is not `none`.
   - **Cycles 2 and up** — only the reviewers that filed `### Required changes` in the previous cycle.
   - **The delivering cycle** — every applicable reviewer, again, on the final state.

   **A cycle run with reduced fan-out can never authorise delivery.** If a reduced cycle comes back
   clean, that is not a delivery: dispatch a fresh full-fan-out cycle, and only those verdicts count.
   Without this, "the final cycle" is whatever the coordinator points at, and a reviewer that approved
   in cycle 1 never sees what the cycle-3 fix did to its lens.
```

- [ ] **Step 2: Bind reviewer findings to the spec's scope**

Append to `AGENTS.md` step 1, after the "what changes, what must not change, how it will be verified"
sentence:

```markdown
   A spec also carries an `## Out of scope (already decided)` block. It starts empty. Every time you
   overrule a reviewer's required change, you append it there with one line of reasoning **before you
   re-dispatch**. Reviewers are stateless: a finding you overruled in cycle 2 comes back in cycle 3
   unless the spec you hand them says it was already decided. That is a whole cycle — five dispatches —
   for a question that was already answered.
```

And add to both reviewer roles (`agents/roles/reviewer/role.md`, `agents/roles/security-reviewer/role.md`)
a numbered rule immediately before the report shape:

```markdown
N. A finding outside the spec's "what changes" list goes under `### Minor notes`, never under
   `### Required changes` — no matter how right it is. The spec's scope is the coordinator's decision and
   not yours to widen; `## Out of scope (already decided)`, if the spec carries entries there, is closed.
   Raise a genuine blocker about scope under `### Blocked` instead.
```

- [ ] **Step 3: Note the stall-detector interaction in step 9**

Under `AGENTS.md` step 9's first bullet, append:

```markdown
     Measure the outstanding list only across cycles that ran the same reviewers. A reduced-fan-out cycle
     cannot grow the list — a dropped reviewer files nothing — so two reduced cycles can look stable while
     nothing converged. Reduced cycles do not count toward the stall limit.
```

- [ ] **Step 4: Mirror all three into the project skill**

Update `agents/skills/review-loop/SKILL.md` steps 1, 6 and 7 to the short form of the above, then:

```bash
npm run sync:agents
```

- [ ] **Step 5: Verify**

```bash
npm run test:agents && npm run check:agents && npm run doctor:agents
```

Expected: PASS.

- [ ] **Step 6: Commit (coordinator, after all verdicts)**

```bash
git add -- AGENTS.md agents .agent .claude .codex .cursor .devin .roster
git commit -m "feat(loop): reduce reviewer fan-out between cycles and bind findings to the spec's scope" -- AGENTS.md agents .agent .claude .codex .cursor .devin .roster
```

---

### Task 3: Per-spec security gate

**Files:**
- Modify: `AGENTS.md` step 1 (spec shape)
- Modify: `agents/skills/review-loop/SKILL.md` step 1
- Regenerated: the skill's five projections

**Interfaces:**
- Consumes: the `## Out of scope (already decided)` block from Task 2; this adds a sibling line.
- Produces: the `Security-relevant paths touched` line that Task 2's step-6 rule reads.

A standing glob list in `config/agents.json` was rejected: it would be the first machine-readable dispatch
gate in a deliberately prose contract, it needs a schema and a per-consumer override mechanism, and it
drifts the moment a consumer renames `auth/` to `identity/`. The spec is already the per-change artefact
where scope is declared, so the declaration goes there.

- [ ] **Step 1: Add the declaration to the spec shape**

Append to `AGENTS.md` step 1:

```markdown
   A spec states one more line: **`Security-relevant paths touched:`** — the paths, or `none`. It is what
   decides whether `security-reviewer` is dispatched at all (step 6). Count as security-relevant anything
   that handles authentication or sessions, authorisation or ownership checks, secrets and key material,
   an input boundary that parses untrusted data, an outbound request whose target is caller-influenced,
   deserialisation, or a widening of dependency or platform configuration. When you are between yes and
   no, write the path down: a reviewer that finds nothing costs one dispatch, and a missed authorisation
   bug costs a great deal more. A pure presentation change — copy, colour, spacing, a chart's axis — is
   `none`, and this is where most of the saving comes from.
```

- [ ] **Step 2: Mirror into the project skill and regenerate**

```bash
npm run sync:agents
```

- [ ] **Step 3: Verify**

```bash
npm run test:agents && npm run check:agents
```

Expected: PASS.

- [ ] **Step 4: Commit (coordinator, after all verdicts)**

```bash
git add -- AGENTS.md agents .agent .claude .codex .cursor .devin .roster
git commit -m "feat(loop): gate security-reviewer on a per-spec declaration of security-relevant paths" -- AGENTS.md agents .agent .claude .codex .cursor .devin .roster
```

---

### Task 4: The verifier may not report `pass` for a suite it did not run

**Files:**
- Modify: `agents/roles/verifier/role.md`
- Modify: `AGENTS.md` step 5
- Regenerated: five verifier profiles

**Interfaces:**
- Consumes: nothing from earlier tasks. Can be executed before Task 1 if convenient.

The defect this fixes is not "E2E was skipped" — a verifier in a sandbox without a browser or credentials
genuinely cannot run it. The defect is that the verdict line said `pass` while a suite the spec required
was `not run`. `agents/roles/developer/role.md:31-32` already forbids exactly this for the developer
("never imply a suite passed when you did not see it pass"); the verifier has no such line.

- [ ] **Step 1: Add the honesty rule to the verifier role**

In `agents/roles/verifier/role.md`, extend rule 4 and add a new rule after it:

```markdown
4. Paste the **actual command and its actual output** — the tail is enough for a pass, the failing section
   is required for a failure. Never summarise a suite you did not watch run. Never write "should pass".
5. A suite you could not run is `not run`, with the reason. If the spec's "how it is verified" section
   required that suite, the overall result is **`fail`**, never `pass` — a spec that gates a suite behind
   a human has not been verified, it has been deferred, and saying `pass` there hides that from every
   reviewer downstream and from the coordinator's delivery decision. Report it and let the coordinator
   decide whether to run it, re-scope the spec, or escalate.
```

Renumber the rules that follow.

- [ ] **Step 2: Add the coordinator's half to step 5**

Append to `AGENTS.md` step 5:

```markdown
   A verifier result of `fail` because a spec-required suite was `not run` is not a developer defect and
   does not go back to the developer. It is yours: run the suite, or amend the spec's "how it is verified"
   and say in the ledger that you did, or escalate. Do not deliver past it.
```

- [ ] **Step 3: Regenerate and verify**

```bash
npm run sync:agents && npm run test:agents && npm run check:agents
```

Expected: PASS.

- [ ] **Step 4: Commit (coordinator, after all verdicts)**

```bash
git add -- AGENTS.md agents .agent .claude .codex .cursor .devin .roster
git commit -m "fix(verifier): a spec-required suite that did not run is a fail, not a pass" -- AGENTS.md agents .agent .claude .codex .cursor .devin .roster
```

---

### Task 5: Fix the gitignored-diff contradiction

**Files:**
- Modify: `AGENTS.md` step 4 and step 8
- Modify: `agents/skills/review-loop/SKILL.md` steps 4 and 7
- Modify (consumer, out of this repository): the consumer's `.gitignore` — see the porting note

**Interfaces:**
- Consumes: nothing. Independent of Tasks 1–4.

`AGENTS.md` step 6 hands reviewers a path under `.roster/review/`, which the consumer `.gitignore` ignores
(`next-auth/.gitignore:46`, and this repository's own `.gitignore:11`). `readonly` roles hold
`[read, grep, glob]` with **no `exec`** (`config/agents.json:9`), so a blocked reviewer has no `git diff`
fallback. This blocked all three reviewers on one task and cost roughly six dispatches.

**Scope of the failure, measured on 2026-09-02:** a Devin *main* agent reads a git-ignored file fine when
given the explicit path. What fails is the **background subagent** — and `AGENTS.md:242` mandates
`is_background: true` for exactly the reviewers, because Devin permits only one foreground subagent at a
time. So the defect is real but narrower than "Devin cannot read ignored paths": it is that the one
dispatch mode the contract requires for reviewers is the mode that skips them. Gemini-based harnesses skip
them in every mode.

Step 8 currently *depends* on the directory being ignored — it says `git add -- .roster` is safe because
only the archived ledger can be staged — so the two halves of the contract must change together. And once
the directory is tracked, the capture in step 4 would sweep previously-captured diffs into the next diff,
so the capture command must exclude it.

- [ ] **Step 1: Rewrite step 4's note**

Append to `AGENTS.md` step 4:

```markdown
   `.roster/review/` **must not be git-ignored** in the consuming repository. Reviewers are `readonly` —
   `read`, `grep`, `glob`, no `exec` — so a reviewer that cannot open the diff has no way to reconstruct
   it, and Devin's background subagents and Gemini-based harnesses skip ignored paths during file
   discovery entirely. An ignored review directory does not fail loudly; it returns three `### Blocked`
   reports and costs a cycle. If a captured diff is unreadable to a reviewer, check this first.
```

- [ ] **Step 2: Exclude the review directory from the capture in step 4**

Once `.roster/review/` is tracked, `git add -N .` picks up every previously captured diff and the next
capture embeds them. Narrow the capture command in `AGENTS.md` step 4 and in the skill:

```bash
mkdir -p .roster/review
git add -N -- <the paths the developer touched>   # or `git add -N .`
git diff -- . ':(exclude).roster/review' > .roster/review/cycle-<N>.diff
git status --porcelain >> .roster/review/cycle-<N>.diff
```

State why inline, so a future editor does not "simplify" it back: the review directory is tracked so that
background subagents can read it, which means it is also visible to `git diff`, and a diff that contains
the previous cycle's diff is unreviewable.

- [ ] **Step 3: Make step 8 stage the archive explicitly**

Step 8 currently reasons that `.roster` as a whole is safe *because* `.roster/review/` is ignored. That
reasoning dies with step 1, so narrow the pathspec:

```bash
        git add -- <source paths> .roster/archive
        git commit -m "<message>" -- <source paths> .roster/archive
```

Replace the paragraph beginning "`.roster` is safe as a whole directory" with:

```markdown
        Stage `.roster/archive` specifically, not `.roster` — the review directory is tracked now, and
        captured diffs are working scratch that does not belong in the delivery commit. The `git add` is
        not optional and this order is not stylistic — `git commit -- <paths>` only ever commits paths git
        already tracks, and under this ordering the archived ledger is always a **new** file. When the
        pathspec matches nothing tracked git aborts; when it matches something tracked — the normal case,
        since `.roster/archive` always matches earlier archives — git exits 0 and silently omits the new
        file, so the commit looks complete but contains no ledger.
```

- [ ] **Step 4: Mirror into the project skill and regenerate**

`agents/skills/review-loop/SKILL.md` steps 4 and 7 carry the short form of both. Then:

```bash
npm run sync:agents && npm run test:agents && npm run check:agents
```

- [ ] **Step 5: Record the consumer-side change in the porting checklist**

This repository has no `.roster/review/` entry in its own `.gitignore` to remove; the change lands in
consumers. Append to `docs/porting/2026-09-01-port-to-next-auth.md` a line stating that
`.roster/review/` must be un-ignored and that the delivery commit's pathspec narrows to `.roster/archive`.

- [ ] **Step 6: Commit (coordinator, after all verdicts)**

```bash
git add -- AGENTS.md agents docs .agent .claude .codex .cursor .devin .roster
git commit -m "fix(loop): stop handing reviewers a git-ignored diff path they cannot open" -- AGENTS.md agents docs .agent .claude .codex .cursor .devin .roster
```

---

## Expected outcome

Per delivery, on the 88-cycle sample: developer 88 and verifier 85 unchanged; reviewer dispatches fall
from 264 to roughly 114 — the merge halves the two general lenses into one, the per-spec gate drops
`security-reviewer` from pure-presentation changes, and reduced intermediate fan-out removes the
reviewers that had nothing to say last cycle. Total dispatches ~431 → ~287, with coverage of the
**delivered** state strictly complete, which the current policy does not guarantee any better.
