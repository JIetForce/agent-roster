# Task 2 — risk-proportional dispatch policy (plan: docs/superpowers/plans/2026-09-02-review-fanout-cost.md)

## Spec

Plan task: Task 2, "Risk-proportional dispatch policy". Three rules that defend one problem at three
points in the cycle: reduced fan-out between cycles, out-of-scope findings become notes, and the
coordinator carries overrules forward so a stateless reviewer cannot re-file one.

Folded in from Task 1's review (reviewer minor note, cycle 2): `AGENTS.md`'s output-formats section still
shows the reviewer's old four-section shape and omits the `#### Correctness` / `#### Maintainability`
subsections that `agents/roles/reviewer/role.md` now requires. Task 2 rewrites that region, so it lands
here rather than in a cycle of its own.

Workers are Devin CLI invocations; developer/verifier on `glm-5-2`, reviewer on `swe-1-7`.

## Cycle log

### Cycle 1
- verifier: pass — test/check/validate/doctor green; all 10 acceptance facts confirmed
- reviewer: rejected — 4 Correctness + 3 Maintainability required
- security-reviewer: rejected — 1 required
- outstanding: step 8 could close a reduced cycle; step 8 never recorded overrules; "filed Required
  changes" was defeated by `none` being mandatory (would have voided the whole reduction); a bounded
  chat spec cannot host a `##` block; skill said "last cycle"; "normal cycle" stale; "instead" ambiguous;
  the scope rule would have downgraded a defect the diff INTRODUCED to a minor note

### Cycle 2
- reviewer: rejected — 3 required
- security-reviewer: approved_with_notes — 0 required; confirmed the suppression path is closed
- resolved since cycle 1: 8
- outstanding: step 8 named only the file-spec form of the out-of-scope record; both role files likewise;
  security-reviewer was never told to write `none`, which the new dispatch rule keys on

### Cycle 3
- reviewer: rejected — 1 required
- security-reviewer: approved_with_notes — 0 required
- resolved since cycle 2: 3
- outstanding: step 6's three applicability bullets contradicted each other for a delivering cycle at
  N>=2, and step 8 had no path to the full-fan-out delivering cycle after a clean reduced cycle

### Cycle 4
- reviewer: rejected — 2 required
- security-reviewer: approved_with_notes — 0 required
- resolved since cycle 3: 1
- outstanding: the stall justification claimed a reduced cycle "cannot grow the list", which is false for
  a reviewer that DOES run; an all-overruled empty list still dispatched the developer, producing the
  empty diff step 4 treats as a loop stop

### Cycle 5
- reviewer: rejected — 1 required
- security-reviewer: approved — 0 required
- resolved since cycle 4: 2
- outstanding: the all-overruled branch fired on ANY empty list, so "reviewers clean but verifier failed"
  matched it and could not converge

### Cycle 6
- reviewer: rejected — 1 required; confirmed all 12 cases of
  {full,reduced} x {none,all-overruled,remaining} x {pass,fail} map to exactly one exit
- security-reviewer: approved — 0 required
- resolved since cycle 5: 1
- outstanding: exit (3) dispatched the developer but the next cycle would have dispatched NO reviewers,
  because every reviewer had been clean and was therefore dropped

### Cycle 7
- verifier (coordinator-run): pass — test:agents 45/45, check:agents in sync (30 profiles),
  validate:agents all valid
- reviewer: approved — 0 required
- security-reviewer: approved — 0 required
- resolved since cycle 6: 1
- outstanding: none
- delivery: committed as `feat(loop): make reviewer fan-out risk-proportional and bind findings to scope`

Seven cycles, 13 required changes, every one a real defect in prose written during this task. Four of
them were holes in the coordinator's own design, not the developer's execution: the `none` ambiguity
would have voided the entire fan-out reduction, and the scope rule as first written would have
downgraded a defect the diff introduced to a one-line note.
