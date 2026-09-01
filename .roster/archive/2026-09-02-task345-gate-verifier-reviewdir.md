# Tasks 3-5 — security gate, verifier honesty, git-ignored diff path

## Spec

Plan: `docs/superpowers/plans/2026-09-02-review-fanout-cost.md`, Tasks 3, 4 and 5, run as ONE loop.

Coordinator decision: the plan schedules three loop runs. They are combined into one because the three
edits are small, independent and localised, and because Task 4 interacts with what Task 2 just landed —
Task 2's step-8 exit (3) sends a failed verifier to the developer, while Task 4 says a `not run` on a
spec-required suite is the coordinator's, not the developer's. Reviewing them in one diff is what catches
that interaction. The option was put to the user before they left and was not ruled out.

- Task 3: the spec declares `Security-relevant paths touched:`; that line gates `security-reviewer`.
- Task 4: the verifier may not report `pass` for a suite it did not run; `not run` on a spec-required
  suite is `fail`, and resolving it is the coordinator's job.
- Task 5: `.roster/review/` must not be git-ignored (Devin background subagents skip ignored paths, and
  readonly roles have no `exec` fallback); the capture excludes it from its own diff; delivery stages
  `.roster/archive` rather than `.roster`.

Carried in from Task 2's security-reviewer (cycles 2, 4): a spec that wrongly declares
`Security-relevant paths touched: none` suppresses the security-reviewer's dispatch entirely, and its
`### Blocked` escape hatch is unreachable because it never runs. Task 3 must address this backstop.

## Cycle log

### Cycle 1
- verifier: pass — test:agents 45/45, check:agents in sync (30 profiles), validate:agents, doctor:agents
  all green; `git check-ignore` confirms `.roster/review/` un-ignored
- reviewer: rejected — 2 Correctness required
- security-reviewer: rejected — 1 required
- outstanding:
  - the `not run` case left one combination orphaned and two double-claimed across step 8's exits
  - `README.md:62` still told adopters to git-ignore `.roster/review/`
  - the security-relevant definition read as a CLOSED list and omitted crypto/RNG choice, audit and
    security-event logging, rate limiting, security response headers, and filesystem permissions — and
    because the backstop repeats the same list, a gap in the definition defeated BOTH layers at once

### Cycle 2
- reviewer: rejected — 1 Correctness required; confirmed step 8 exhaustive for the 12 pass/real-failure
  combinations
- security-reviewer: rejected — 1 required
- resolved since cycle 1: 3 required + 3 accepted minor notes (dropped the `git add -N .` fallback, which
  had already bitten the coordinator during Task 1; re-confirm the declaration when scope grows; porting
  warning that captured diffs are now sweepable by `git add -A`)
- outstanding:
  - `scripts/doctor-agents.mjs:156-166` — shipped CODE still advising users to ignore `.roster/review/`
    and warning when it is not, contradicting the contract the same script checks
  - the gate backstop was suppressible: coordinator writes `none`, reviewer files the misdeclaration,
    coordinator overrules it into the out-of-scope record, and rule 7 tells every later reviewer the
    record is closed — so the delivering cycle re-runs the reviewer and it still does not re-file

### Cycle 3
- reviewer: rejected — 1 Correctness required; re-ran the exhaustiveness enumeration and confirmed all
  18 combinations of {full,reduced} x {none,all-overruled,remaining} x {passed,real failure,not run}
  map to exactly one place, with the `not run` column intercepted by the step-8 precondition
- security-reviewer: approved — 0 required; traced eight routes by which a security-relevant change
  could reach delivery unreviewed, found seven structurally closed and the eighth (reviewer model error)
  irreducible in prose but not silent, because the delivering cycle re-runs the reviewer
- resolved since cycle 2: 2 required + 2 accepted minor notes
- outstanding: `scripts/doctor-agents.mjs`'s new hard-fail had no test pinning it — the change could be
  reverted to a soft warn with `npm run test:agents` staying green

### Cycle 4
- verifier (coordinator-run): pass — test:agents 46/46, check:agents in sync (30 profiles),
  validate:agents all valid, doctor:agents exit 0
- coordinator mutation test: softened the doctor's hard-fail to a no-op and re-ran
  `tests/collisions.test.mjs` — 1 of 4 failed; restored byte-identically and 4/4 passed again. The new
  test genuinely pins the failure path rather than merely passing alongside it.
- reviewer: approved_with_notes — 0 required; reproduced the full 18-combination partition table and
  confirmed no case is orphaned or double-claimed; confirmed the new test would fail if the doctor's
  hard-fail were reverted
- security-reviewer: approved — 0 required; re-confirmed all three lenses in their final state and could
  not find another route past the gate
- resolved since cycle 3: 1 required + 1 accepted minor note
- outstanding: none
- coordinator correction: the plan's Task 5 sample still carried the `# or git add -N .` fallback that
  the contract now forbids. Struck. The plan document is the coordinator's, not the developer's.
- delivery: committed as `feat(loop): gate security review per spec, make not-run a fail, track the review dir`

Four cycles, 8 required changes. Two were defects in shipped code rather than prose: the doctor still
advised ignoring `.roster/review/` and warned when it was not, contradicting the contract the same script
checks; and the gate backstop was suppressible through the overrule path, because the rule that stops a
stateless reviewer re-filing an overruled finding also stopped it re-filing a misdeclared security gate.
