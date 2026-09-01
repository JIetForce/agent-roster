# Devin projection and ledger lifecycle — Task 2: remove the permissions key Devin ignores

## Spec

Task 2 of `docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md`
(design: `docs/superpowers/specs/2026-09-01-devin-projection-and-ledger-lifecycle-design.md`)

**What changes.** `permissions` is removed from `tools.devin.readonly` and `tools.devin.verifier` in
`config/agents.json` — Devin reports it as an unsupported frontmatter key (CFG005) and ignores it, so
every project carrying this roster emits five warnings for nothing. The test at
`tests/sync-agents.test.mjs:112` asserted that ignored key; it is rewritten to assert the
`allowed-tools` allowlist, which Devin does enforce. The comment in `scripts/validate-agents.mjs`
that describes Devin's deny-list is corrected, because it becomes false.

**What must not change.** Readonly roles keep exactly `read`/`grep`/`glob`; the verifier keeps its
shell and still cannot edit through a first-class tool. No other harness is touched. The generated
role bodies are unchanged.

**How it is verified.** The rewritten test fails before the config change and passes after;
`npm run test:agents` green; `devin doctor` reports zero CFG005 warnings.

**Carried in this cycle's commit.** An uncommitted fix to Task 5's text in the plan file: step 8 must
`git add` before `git commit`, because the archived ledger is always a new file and
`git commit -- <paths>` only knows tracked paths. Found by executing Task 1's delivery, not by review.

## Cycle log

### Cycle 1
- verifier: pass — check:agents, validate:agents, test:agents (38/38), devin doctor 0 warnings,
  and a prose proof that no role's write-restriction rested on the removed key
- code-reviewer: approved_with_notes — 0 required
- security-reviewer: approved — 0 required
- quality-reviewer: approved_with_notes — 0 required
- resolved since cycle 0: n/a (first cycle)
- outstanding: 1 note promoted to required by the coordinator — `scripts/sync-agents.mjs:101-106`
  still emits a `permissions:` block when the config carries one. Task 2 removes the key because
  Devin ignores it; leaving the emitter that can put it back is half the job.

Follow-ups raised, not in scope:
- `tests/sync-agents.test.mjs:128` — the "no profile carries permissions" test iterates all six roles
  but lives under a describe block scoped to readonly. Placement, not behaviour.
- `scripts/validate-agents.mjs:79` — `notebook_edit` is absent from `NO_WRITE_MARKERS.devin`, so a
  verifier that re-gained it would be caught only by its absence from the allowlist. Pre-existing.

### Cycle 2
- verifier: pass — check:agents, validate:agents, test:agents (38/38), devin doctor clean; renderer
  scope confirmed by reading, and independently by the coordinator (no other renderer in the diff)
- code-reviewer: approved_with_notes — 0 required
- security-reviewer: approved — 0 required
- quality-reviewer: approved — 0 required
- resolved since cycle 1: 1 (the devin renderer can no longer emit the ignored key)
- outstanding: none

## Delivered
2026-09-01. Task 2 of docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md.
Two cycles. `devin doctor` went from five CFG005 warnings to zero.

Carried in this commit: the fix to Task 5's own text — step 8 must `git add` before `git commit`,
because under the new ordering the archived ledger is always a new file and `git commit -- <paths>`
knows only tracked paths. Found by executing Task 1's delivery; no reviewer could have caught it,
because nobody reviews the commit procedure.

Follow-ups raised, not in scope:
- `tests/sync-agents.test.mjs` — the "no profile carries permissions" test iterates all six roles but
  lives under a describe block scoped to readonly. Placement only.
- `scripts/validate-agents.mjs` — `notebook_edit` is absent from `NO_WRITE_MARKERS.devin`; a verifier
  that regained it is caught only by the allowlist, not by an explicit marker. Pre-existing.
- `tests/sync-agents.test.mjs` — a comment names the runtime tools (`find_file_by_name`) while the
  assertion names the config tools (`glob`). Both correct, opposite ends of the vocabulary mapping,
  but it reads as a contradiction to anyone who does not know the mapping.
