# Devin projection and ledger lifecycle — Task 4: the doctor catches this class of defect

## Spec

Task 4 of `docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md`
(design: `docs/superpowers/specs/2026-09-01-devin-projection-and-ledger-lifecycle-design.md`)

**What changes.** `scripts/doctor-agents.mjs` gains a Devin section, active only when the CLI is
present: it runs `devin doctor` and surfaces its findings, and it cross-checks every model pinned in
`config/agents.json` against `devin models list` — failing on a slug that does not exist, warning on
one that is no longer free. A new `scripts/lib/devin-models.mjs` holds the parser, unit-tested
against a captured fixture so the check is testable without the CLI. Step 7 retires the
forward-looking sentence Task 1 left in `README.md`.

**Why.** `permissions` sat in six generated profiles being silently ignored, and nothing in this
repository could tell us. `devin doctor` knew all along. This wires the harness's own diagnosis into
ours, and makes the 2026-09-16 promo expiry report itself rather than resting on a paragraph.

**What must not change.** The doctor's exit code stays meaningful: a `warn` from `devin doctor` must
not fail the run, only a `fail` — matching how the antigravity trust check already reports. A broken
`devin models list` must produce one honest failure, not one per pinned model.

**How it is verified.** `node --test tests/devin-models.test.mjs` fails before the parser exists and
passes after; `npm run test:agents` green; `npm run doctor:agents` exits 0 and prints four model
lines, all free.

## Cycle log

### Cycle 1
- verifier: pass — test:agents 43/43, doctor:agents exit 0 with four model lines all free,
  check:agents and validate:agents pass. Confirmed by reading: only `report(false, …)` increments
  the problem count so a `devin doctor` warn cannot fail the run; the catch leaves `catalog`
  undefined so a thrown `devin models list` reports once; the live fixture contains a family header,
  an `aliases:` line, and both free and priced models, so the four parser tests are not vacuous.
- code-reviewer: rejected — 1 required
- security-reviewer: approved — 0 required
- quality-reviewer: approved_with_notes — 0 required
- resolved since cycle 0: n/a (first cycle)
- outstanding:
  (a) `scripts/doctor-agents.mjs` — the guard `catalog ? pins : []` protects only the throw path.
      `devin models list` exits 0 and prints an error body when the free-tier quota is exhausted —
      observed twice today — so `execFileSync` returns normally, the parser matches nothing, and
      `catalog` is an empty Map, which is truthy. The loop then reports every pinned model as
      missing: the wall of false failures the spec explicitly forbids, reached by the path we did
      not guard.

### Cycle 2
- verifier: pass — test:agents 44/44, doctor:agents exit 0 still printing four `ok devin:` lines,
  and a throwaway script confirming parseModelCatalog returns size 0 for the real quota-exhaustion
  body. Counted from the code: report(false, …) fires once when the command throws, once when it
  exits 0 with an error body, and not at all on success.
- code-reviewer: approved_with_notes — 0 required
- security-reviewer: approved — 0 required
- quality-reviewer: approved_with_notes — 0 required
- resolved since cycle 1: 1 (the empty-catalogue path is now guarded, not just the throwing one)
- outstanding: none

## Delivered
2026-09-01. Task 4 of docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md.
Two cycles, one rejection.

The rejection is the one worth remembering. The first guard protected the path where
`devin models list` throws. The path that actually occurs is different: with the free-tier quota
exhausted the command exits 0 and prints an error body, so the parser returns an empty Map — truthy
— and every pinned model was reported missing. We had watched that exact failure happen twice
earlier in this session without connecting it to the code being written. A reviewer reading the
guard made the connection.

Also carries a fix to this plan's own Task 5, found the same way: `AGENTS.md` step 4 captures the
review artefact with `git diff`, which does not show untracked files at all. Task 4's substance was
three NEW files, so the first capture contained none of it — the reviewers would have approved two
unrelated edits. Task 5 now opens with a Step 0 adding `git add -N` to the capture, in the contract
and in the skill.
