# Devin projection and ledger lifecycle — Task 5: one commit per delivery

## Spec

Task 5 of `docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md`
(design: `docs/superpowers/specs/2026-09-01-devin-projection-and-ledger-lifecycle-design.md`)

**What changes.** Two fixes to the loop's own mechanics, in `AGENTS.md` and mirrored in
`agents/skills/review-loop/SKILL.md`:

- **Step 0 — the capture.** Step 4 captures the review artefact with `git diff`, which does not show
  untracked files. A task whose substance is new files ships a diff containing none of it. `git add -N`
  is added before the capture.
- **Steps 1–2 — the ordering.** Step 8 commits *before* the two ledger mutations that close the
  change, so every delivery ends with a dirty tree and a second, content-free commit. It becomes:
  append the delivery line, `mv` the ledger into `.roster/archive/`, then one `git add` + one
  `git commit`. `git mv` is wrong here — the ledger has never been committed during the run and
  `git mv` refuses an untracked file. `git commit -- <paths>` alone is wrong too: it knows only
  tracked paths, so the new archive file is not committed.

**What must not change.** Step 2's `git mv` stays: the stale ledger it archives *is* tracked. The
review artefact stays the uncommitted working tree. `.roster/review/` stays git-ignored.

**How it is verified.** There is no unit test for contract prose, and the plan does not pretend
otherwise. The check is this task's own delivery: one commit, containing the archived ledger and no
`.roster/ledger.md`.

**Provenance.** Every defect this task fixes was found by executing the loop, not by reading it.
Task 1's delivery failed on the missing `git add`; Task 4's first capture omitted its own three new
files. Both were invisible to review because nobody reviews the commit procedure.

## Cycle log

### Cycle 1
- verifier: pass — check:agents in sync, test:agents 44/44, doctor:agents exit 0; `git mv` survives
  only in step 2 and is gone from step 8; all four generated copies carry the new text and each
  still carries its own dispatch mechanism; the new commit procedure was simulated in a throwaway
  repo and does commit the archived ledger.
- code-reviewer: rejected — 1 required
- security-reviewer: approved — 0 required
- quality-reviewer: approved_with_notes — 0 required
- resolved since cycle 0: n/a (first cycle)
- outstanding:
  (a) `AGENTS.md:178-182` and `SKILL.md` — the rationale for requiring `git add` before `git commit`
      describes a failure that will not normally occur. Measured on git 2.50.1, reproduced by the
      verifier and independently by the coordinator: a pathspec matching NOTHING tracked gives the
      documented hard error, but a pathspec matching at least one tracked path — which `.roster`
      always does from the second delivery onward, because `.roster/archive/` holds tracked files —
      exits 0 and silently drops the new file. The contract documents the loud case and omits the
      silent one, which is the one that will happen.

Note on how this was found: the verifier was asked to confirm the new procedure is executable. It
confirmed the positive case, then went on to test whether the OLD way fails as the contract claims,
and found it does not. The rationale was not invented — it was generalised from the single real
error the coordinator hit on Task 1's delivery, without noticing that case was the rare one.

### Cycle 2
- verifier: pass — check:agents in sync, test:agents 44/44; both claims measured in a throwaway repo
  on git 2.50.1 and confirmed (pathspec matching nothing tracked → abort; matching something tracked
  → exit 0 with the new file silently omitted; add-then-commit → the archived ledger is included).
  Verdict on the wording: accurate, neither overstated nor understated. Commands unchanged between
  cycles; `git mv` remains runnable only in step 2.
- code-reviewer: approved_with_notes — 0 required
- security-reviewer: approved — 0 required
- quality-reviewer: approved — 0 required
- resolved since cycle 1: 1 (the rationale now describes the failure that actually occurs)
- outstanding: none

## Delivered
2026-09-01. Task 5 of docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md,
the last task of the plan. Two cycles, one rejection.

This delivery is the task's own test. There is no unit test for contract prose; the check is whether
closing this change by the procedure it just wrote produces one commit containing the archived
ledger, and no `.roster/ledger.md`.

The rejection is worth keeping. Cycle 1's rationale was not invented — it was generalised from the
one real error the coordinator hit delivering Task 1, without noticing that case was the rare one.
The common case is quieter and worse: git exits 0, the commit is created, and the new file is left
out in silence. A contract that justifies a required step with a failure that will not happen
teaches the next reader to skip the step.
