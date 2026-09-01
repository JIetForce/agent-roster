# Devin projection and ledger lifecycle — Task 3: dispatch by named profile

## Spec

Task 3 of `docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md`
(design: `docs/superpowers/specs/2026-09-01-devin-projection-and-ledger-lifecycle-design.md`)

**What changes.** `AGENTS.md` and `dispatch_lines.devin` stop telling the coordinator to dispatch
`subagent_general` with the role passed as text, and tell it to use `run_subagent` with
`profile: "<role>"` — the six profiles Devin already loads. The prohibition widens: substituting
`subagent_general` or `subagent_explore` for a role discards both the tool allowlist and the model.
`### Per-tool concurrency facts` gains the foreground/background split, because Devin permits only
one foreground subagent at a time — so "three reviewers in parallel" requires `is_background: true`.
README's `## Verification status` records what was established empirically.

**What must not change.** The six role bodies. The other four harnesses' dispatch lines. The
`<!-- DISPATCH -->` projection mechanism itself.

**How it is verified.** A new test asserts the generated Devin skill names a profile and states the
background split; `npm run test:agents` green; and an end-to-end probe dispatches `code-reviewer` and
`researcher` by profile and confirms they report `swe-1-7` and `glm-5-2` with a read-only toolset.

**Why this task is the point of the plan.** Until it lands, everything the projection guarantees is
discarded at the moment of dispatch. Tasks 1 and 2 made the profiles correct; this one makes them used.

## Cycle log

### Cycle 1
- verifier: pass — check:agents, validate:agents, test:agents (39/39), config parses, devin doctor;
  plus cross-harness confirmation that no generated skill leaked Devin's dispatch line, and that
  `subagent_general` now appears only inside prohibitions
- coordinator probe: `profile="code-reviewer"` → SWE-1.7 Max; `profile="researcher"` → GLM-5.2 High;
  both with tools exactly find_file_by_name, grep, read. Profile dispatch binds model and tools.
  The researcher also answered in its role's prescribed output format without being asked to —
  incidental proof that the role body is the profile's system prompt.
- code-reviewer: rejected — 1 required
- security-reviewer: approved_with_notes — 0 required
- quality-reviewer: approved — 0 required
- resolved since cycle 0: n/a (first cycle)
- outstanding:
  (a) `README.md:173` says "two honest exceptions" while the section now carries three bullets — and
      the new one is not an exception at all: the other two say what was NOT verified, this one says
      what WAS. Wrong count and wrong framing.
  (b) `tests/sync-agents.test.mjs:178` asserts the dispatch line merely contains `is_background`,
      not which way the split runs. A regression sending a writer to the background would pass, and
      in the runtime that means silently auto-denied exec/edit and an empty report — the exact
      failure this contract devotes a paragraph to. Raised by security-reviewer and code-reviewer
      independently; promoted by the coordinator because it repeats the weakness Task 2 just removed
      elsewhere: asserting a keyword's presence instead of the property.

### Cycle 2
- verifier: pass — run by the coordinator, not a worker: the Devin CLI was quota-exhausted at the
  account level (both free models, and even an empty prompt, returned resource_exhausted).
  check:agents in sync, validate:agents all valid, test:agents 39/39, devin doctor 6 profiles 0 warnings.
- code-reviewer: approved_with_notes — 0 required
- security-reviewer: approved — 0 required
- quality-reviewer: approved_with_notes — 0 required
- resolved since cycle 1: 2 (README's exception count and framing; the test now pins the direction of
  the foreground/background split instead of the mere presence of the word)
- outstanding: none

## Delivered
2026-09-01. Task 3 of docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md.
Two cycles, one rejection. This is the task the plan exists for: until now every guarantee the six
generated profiles carry was discarded at the moment of dispatch.

Coordinator's live probe, before review: `profile="code-reviewer"` ran as SWE-1.7 Max and
`profile="researcher"` as GLM-5.2 High, both with tools exactly find_file_by_name, grep, read. The
researcher also answered in its role's prescribed output format without being asked — incidental
proof that the role body is the profile's system prompt, which no test asserts.

Operational findings, for whoever runs this loop next:
- Three reviewers dispatched in parallel exhaust the Devin free-tier quota at the account level.
  Both free families fail together, so splitting roles across them is not insurance against this.
  Sequential dispatch with retries works and costs only wall-clock. `AGENTS.md` calls parallel
  reader dispatch free of downside; on this runtime it has one.
- A quota-exhausted run exits 0 and writes a report file containing an error instead of a verdict.
  Anything checking the exit code would read it as a successful review — the same shape of failure
  as three `approved` verdicts on an empty diff. Check for the verdict, not the exit code.
