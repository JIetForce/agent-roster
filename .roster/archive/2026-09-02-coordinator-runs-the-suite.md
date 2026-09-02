# The coordinator runs a spec-required suite the verifier could not, instead of stopping for the human

## Spec

**Classification:** bounded — the flow being changed already exists here to read, one independently
testable deliverable, one pass of one writer.

**The defect.** Task 4 (commit `f328d7b`) made a spec-required suite reported `not run` a hard `fail`
— correct, and it stays. But the other half, *who then runs it*, became an unordered menu of three
peer options, and escalate is the cheapest branch in it:

- `AGENTS.md:188` (step 5) — "It is yours: run the suite, **or** amend the spec's "how it is verified", **or** escalate"
- `AGENTS.md:250` (step 8 precondition) — the same triple, verbatim
- `agents/roles/verifier/role.md:20` — "let the coordinator decide whether to run it, re-scope the spec,
  or escalate", next to "a spec that gates a suite behind **a human**", which legitimises a spec whose
  verification is a human action
- `agents/skills/review-loop/SKILL.md:56` — the condensed copy of the same triple

`AGENTS.md:16` ("Your role") compounds it: the coordinator "does three things", does not implement and
does not review, and is never said to have a shell. Agents therefore stop and ask the human to run the
tests. Before Task 4 this stop did not exist because the verifier simply wrote `pass` and the loop
carried on — the fix made the dishonesty visible and routed it into a human stop instead of a cycle.

The contract also never spells out what happens once the coordinator runs the suite and it fails. The
precondition says "and only then evaluate the exits", which routes it to exit (3), but no words say so.

### What changes

1. `## Your role` (`AGENTS.md:16`) — one line: the coordinator has a shell and uses it for the loop's own
   mechanics (diff capture, archive, commit) **and to run a suite the verifier could not**. It still does
   not implement and does not review.
2. Step 5 and the step 8 precondition — the menu becomes an ordered rule:
   1. **Run the suite yourself.** The default, not optional.
   2. Only if the command cannot run in this environment at all — and you must show the command you ran
      and the error it returned — amend "how it is verified", record it in the ledger, and continue.
   3. **Never stop the loop to ask the human to run a test suite.** A test result is not a product
      decision, so it never qualifies under `## Escalation` step 2 (`AGENTS.md:407`). Escalation remains
      only for an unrunnable suite that is the sole evidence the change works.
3. State the continuation explicitly: **coordinator ran it → it failed → that is the developer's work
   item, exit (3), cycle N+1, in the same turn.** No stop.
4. Verifier rule 5 (`agents/roles/verifier/role.md:17`) — replace "let the coordinator decide whether to
   run it, re-scope the spec, or escalate" with: report `not run` with the exact command and the exact
   error; the coordinator runs it. Drop "gates a suite behind a human" — a spec whose "how it is
   verified" names a human action is a defect in the spec, not a legitimate form of it.
5. The same edits in `agents/skills/review-loop/SKILL.md`, then `npm run sync:agents`.

### What must not change

- `not run` for a spec-required suite stays **`fail`**, never `pass` — Task 4's honesty rule, and the
  reason this problem is visible at all.
- The four exits' structure and mutual exclusivity; `not run` is still handled in exactly one place (the
  step 8 precondition) — it now resolves there to "run it" rather than to a menu.
- No model value, no tool allowlist, no `config/agents.json`.
- Generated files are never hand-edited.

### How it is verified

`npm run test:agents` (46), `npm run check:agents` (in sync, 30 profiles), `npm run validate:agents`,
`npm run doctor:agents` — all exit 0. Plus grep: no escalate-as-peer-option for the `not run` case
remains in `AGENTS.md`, the verifier role, or the skill; verifier rule 5 is identical across all five
harness projections.

### Security-relevant paths touched

`AGENTS.md`, `agents/roles/verifier/role.md`, and their generated projections. Not ritual: the new rule
directs an agent to execute a command taken from a spec's or plan's "how it is verified" line
unconditionally, where it previously stopped and waited for a human. That is a human-gate removal plus
execution of a command sourced from a document.

### Out of scope (already decided)

- A genuinely unrunnable suite (paid credentials, physical device) continues with a ledger note rather
  than stopping. Confirmed by the user at spec time.

## Cycle log

### Cycle 1
- verifier: pass — `test:agents` 49/49, `check:agents` in sync (30 profiles), `validate:agents`,
  `doctor:agents` exit 0. Also mutation-checked the three new tests: reverting the wording fails exactly
  those 3 and no others, and the tree was restored byte-identically to the captured diff.
- reviewer: rejected — 1 required (`#### Correctness`; `#### Maintainability` none)
- security-reviewer: approved_with_notes — 0 required
- resolved since cycle 0: n/a
- outstanding:
  - `AGENTS.md:200` — the "Escalation is left only for the case where an unrunnable suite is the sole
    evidence the change works" carve-out reopens the ask-the-human branch. In the common case a spec's
    "how it is verified" names one suite, which is by definition the sole evidence, so the exception
    swallows the rule this change exists to establish. It also contradicts the spec's own out-of-scope
    record (unrunnable suite → ledger note, continue), and `AGENTS.md:267-278` (the step 8 precondition,
    no carve-out) and `agents/skills/review-loop/SKILL.md:56-60` (no carve-out) each state a third,
    different policy for the same rule.

Coordinator decisions on this cycle:
- Accepted the reviewer's finding and its suggested resolution: delete the carve-out outright rather than
  propagate it into the other two documents. That moves the contract toward what the user explicitly
  approved at the spec gate ("continue with a ledger note, don't stop"), not away from it — the carve-out
  was mine, and the user's confirmation pointed the other way.
- Replaced the safety value the carve-out was carrying with a delivery-time requirement instead of a
  mid-loop stop: exit (1) must say in the summary when a spec-required suite was amended away.
- Promoted three notes to required changes rather than deferring them, since cycle 2 edits those exact
  lines anyway: the prose bloat in step 5 / the precondition (reviewer minor note 1), the command-scope
  bound on what "how it is verified" may tell the coordinator to execute (security-reviewer note 1), and
  the missing `SKILL.md` assertion in the new test block — which is why the divergence above was not
  caught by the suite (reviewer minor note 3). Plus the "only" on the shell grant (security-reviewer
  note 2).
- Nothing overruled; the out-of-scope record is unchanged.
- Amended `Security-relevant paths touched` to name `agents/skills/review-loop/SKILL.md` explicitly
  (reviewer minor note 4 — precision, not a gate misdeclaration; the gate was never `none`).

### Cycle 2 (full fan-out — run at full fan-out deliberately, so a clean result could deliver)
- verifier: pass — `test:agents` 51/51, `check:agents` in sync (30 profiles), `validate:agents`,
  `doctor:agents` exit 0. Second sync produces no change. Both new tests independently mutation-tested
  with wording the verifier chose itself; each fails alone. `AGENTS.md` proven byte-identical to
  `HEAD` + exactly the captured diff (reconstruction by `patch`), no duplicate paragraphs, steps 1-9 and
  the four exits each present exactly once — which independently closes the developer's reported
  backup/restore mishap.
- reviewer: rejected — 1 required (Correctness; Maintainability none)
- security-reviewer: 1 required. Its `### Verdict` line said `approved_with_notes` while
  `### Required changes` was non-empty — an internally inconsistent report. Counted as filed, per step 8's
  "every reviewer approved means no `### Required changes` were filed": the section governs, not the label.
- resolved since cycle 1: 1 — the reviewer confirmed its own cycle-1 finding closed: the carve-out is gone
  unconditionally from all three documents, and the skill's shorter step 5 is legitimate compression, not a
  third policy (the skill's preamble already declares itself the short form).
- outstanding:
  - `AGENTS.md:193-195` — the bound "the project's own build, lint and test commands" is categorical, not
    textual, so `npm run test:e2e -- --reporter=$(curl …)` satisfies it while carrying a payload in its
    arguments. The compensating control (the exit (1) disclosure) is detective, not preventive: it fires
    after the command has run. The `### The boundary` cross-reference does not cover this — that section
    is about a worker's report, not a spec's verification line.
  - `AGENTS.md:291-292` — the exit (1) disclosure clause, which is the entire replacement for the deleted
    carve-out, is pinned by no test, while both its sibling behaviours in the same diff are. A future edit
    that simplifies exit (1) drops it silently — the same exposure that let the cycle-1 divergence reach
    review instead of failing the suite.

Coordinator decisions on this cycle:
- Accepted both. The security finding is mechanical rather than a judgement call, which is what makes it
  implementable — but I did not take its fallback verbatim: it routes a rejected command to item 2 (amend
  and continue), which for a legitimate compound command like `a && b` silently drops verification. A
  compound or exotic command is a spec defect to fix (name the suites separately), which keeps the
  verification instead of abandoning it.
- Promoted two minor notes, both mechanical and both in text cycle 3 is editing anyway: the audit gap
  (nothing records that the coordinator, not the verifier, produced a suite's evidence) and the
  "takes exit (3)" sentence reading unconditionally where exit (4) governs when reviewers also filed —
  that one could make a coordinator drop reviewer findings, which is worth more than its size.
- Nothing overruled; the out-of-scope record is unchanged.
- **Convergence watch.** Outstanding went 1 → 2, which is not shrinking. It is not a stall under step 9:
  cycle 1's item is closed and confirmed closed, and both new items are findings against text that cycle 2
  itself introduced. But cycle 3 adds text again, so if it produces another new-material finding I escalate
  rather than open cycle 4 — the loop would be ratcheting, not converging.

### Cycle 3 — not run as a cycle; the loop was stopped by the user
The cycle-3 developer dispatch was rejected by the user on cost, mid-flight. Its file edits had already
landed on disk; its report never arrived. The user then chose to trim the coordinator's scope creep and
deliver without further dispatches.

Trim and close-out performed by the coordinator, outside the loop, with no developer, verifier or
reviewer dispatched:
- Removed the shell-metacharacter enumeration from step 5 item 1 and from the skill. Kept the part of the
  security fix that is mechanical and cheap: run the command the verifier reported, **verbatim, never one
  you compose**, and only when it is a plain invocation of the project's own build, lint or test commands.
  That closes the coordinator-composes-a-command hole; it does not close argument injection inside an
  otherwise-legitimate command. Recorded as an accepted, open weakness — see below.
- Dropped the "every generated verifier profile carries the handoff" test: it cannot fail independently of
  the drift test plus the role assertion, which the reviewer had already noted. Cut two essay-length test
  comments. Tests: 112 lines → 81, 51 passing.
- Finished the exit (3)/(4) correction the reviewer filed: step 5's continuation still read "exit (3)"
  unconditionally where the precondition had already been corrected to "(3) or (4), as the reviewers'
  verdicts select". Both now agree.

### Delivery — non-conforming, deliberately
This does **not** satisfy exit (1). Exit (1) requires a full-fan-out cycle in which every applicable
reviewer approved. The last text was written by the coordinator and reviewed by nobody. It is delivered
on the user's explicit instruction after they stopped the loop on cost.

- verifier: not dispatched. The coordinator ran the suite itself — which is what this change now
  requires: `test:agents` 51/51, `check:agents` in sync (30 profiles), `validate:agents` all valid,
  `doctor:agents` exit 0.
- suites the coordinator ran itself: all four, above. No spec-required suite was amended away.
- reviewer / security-reviewer: not dispatched on the final text.
- outstanding at delivery, accepted rather than fixed:
  - `AGENTS.md:193` — the bound on what the coordinator may execute is categorical ("a plain invocation
    of the project's own build, lint or test commands") plus verbatim-only. `npm run test:e2e --
    --reporter=$(curl …)` still satisfies it. The security reviewer's mechanical fix (reject shell
    operators, substitutions, redirection, fetch) was implemented and then removed as disproportionate
    for this repository. Anyone porting this contract to a repository where the "how it is verified" line
    is not written by a trusted human should reinstate it.

### What this run cost, and why
8 subagent dispatches, ~835k subagent tokens, for a change that is ~28 lines of contract prose. Cycle 1's
finding was worth its cycle: the coordinator's own first draft reopened the very branch it was closing.
Cycles 2 and 3 were not — both reviewed material the coordinator had added beyond the user's request
(a delivery-time disclosure, a command-execution bound, 112 lines of tests), so the reviewers were being
paid to find defects in scope creep. The loop converged; the scoping did not. See the follow-up below.
