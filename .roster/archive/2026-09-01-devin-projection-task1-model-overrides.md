# Devin projection and ledger lifecycle — Task 1: per-role model overrides

## Spec

Task 1 of `docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md`
(design: `docs/superpowers/specs/2026-09-01-devin-projection-and-ledger-lifecycle-design.md`)

**What changes.** `config/agents.json` gains `tools.<harness>.role_overrides.<role>`, shallow-merged
over the class block by `scripts/sync-agents.mjs`. Every Devin role moves to `glm-5-2` except
`code-reviewer`, pinned to `swe-1-7`. The generator rejects an override naming a role that does not
exist. `README.md` records the class/override distinction, the two model traps, and the 2026-09-16
promo expiry.

**What must not change.** The capability class stays the source of permissions — an override may not
widen a role, and `npm run validate:agents` still checks the generated file. Claude profiles keep
`model: sonnet`. No vendor slug enters `agents/roles/*`. The six role bodies are untouched. The
`permissions` key stays in `config/agents.json` this cycle; Task 2 removes it.

**How it is verified.** `node --test tests/sync-agents.test.mjs` fails first, then passes;
`npm run test:agents` green; `npm run sync:agents` leaves a clean `git diff`.

**Dispatch note.** Workers run in the Devin CLI this cycle rather than Claude Code subagents — the
user's call, for token economy. The coordinator still writes no code and reviews nothing until the
final pass.

## Cycle log

### Cycle 1
- verifier: pass — check:agents, validate:agents, test:agents (37/37), devin doctor (6 profiles), model greps both sides
- code-reviewer: approved_with_notes — 0 required
- security-reviewer: approved — 0 required
- quality-reviewer: approved_with_notes — 0 required
- resolved since cycle 0: n/a (first cycle)
- outstanding: 2 notes promoted to required by the coordinator —
  (a) `README.md:101-104` claims `npm run doctor:agents` re-checks the model facts against the CLI;
      that capability is Task 4 and does not exist yet, so the sentence ships false until then;
  (b) `scripts/sync-agents.mjs:212-216` the merge comment says "shallow merge" but not that an
      array key *replaces* the class's array rather than extending it — the next person to add a
      per-role `allowed-tools` silently loses the class allowlist.
- note: the verifier restored a file with `git checkout --`, briefly destroying the task's own work,
  and recovered from its own backup. Confirmed intact by diff hash, unchanged before and after.
  `agents/roles/verifier/role.md` should forbid destructive git commands — raised as a follow-up,
  out of scope for this task.

### Cycle 2
- verifier: pass — check:agents, validate:agents, test:agents (37/37), diff scope confirmed
- code-reviewer: approved — 0 required
- security-reviewer: approved — 0 required
- quality-reviewer: approved_with_notes — 0 required
- resolved since cycle 1: 2 (README no longer claims a doctor capability that does not exist; the
  merge comment now says an array override replaces rather than extends)
- outstanding: none

## Delivered
2026-09-01. Task 1 of docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md.
Two cycles. Closed with the reordered step 8 — delivery line, archive, then one commit — ahead of
Task 5 landing that change in AGENTS.md, because following the old order would have produced the
very second commit this plan removes.

Follow-ups raised, not in scope here:
- `agents/roles/verifier/role.md` should forbid destructive git commands. The cycle-1 verifier ran
  `git checkout -- config/agents.json`, destroying this task's own uncommitted work, and recovered
  from a backup it had taken. Integrity confirmed by diff hash, not by its report.
- quality-reviewer's note about the README's self-dating sentence is closed by a new Step 7 added to
  Task 4 of the plan, which rewrites it in the present tense when the doctor gains the check.
