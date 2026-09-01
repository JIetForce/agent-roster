# Porting the Devin projection + ledger lifecycle work into `next-auth`

**Source:** `agent-roster` commits `7876fb1..b0f663b` (five, one per plan task), pushed to
`origin/main` on 2026-09-01.
**Target:** `/Users/ruslan/repos/AI/anty/next-auth`, which carries a hand-copied roster.
**Design and plan, for the reasoning behind any single change:**
`docs/superpowers/specs/2026-09-01-devin-projection-and-ledger-lifecycle-design.md` and
`docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md` in `agent-roster`.
Per-task cycle records, including every rejection and why: `.roster/archive/2026-09-01-devin-*.md`.

## What this port is for

Four things were wrong in the roster as `next-auth` still carries it:

1. **The six generated Devin profiles are never used.** The contract dispatches `subagent_general`
   with the role pasted in as text, so the profile's tool allowlist and model are discarded. A
   `security-reviewer` whose role body says "Never edits" gets `edit` and `write`.
2. **`permissions` in those profiles is dead.** Devin reports `CFG005: unsupported frontmatter
   key(s) ignored` for it. `next-auth` emits five such warnings on every `devin doctor`.
3. **Every delivery makes two commits**, the second a content-free rename of the ledger.
   `next-auth`'s history shows this — `chore(roster): archive Task N ledger after delivery` next to
   each feature commit.
4. **The review artefact can silently omit the change.** Step 4 captures with `git diff`, which does
   not show untracked files, so a task made of new files ships a diff containing none of it.

## Preconditions

- `next-auth`'s own review loop is finished and its tree is clean. At the time of writing it had
  uncommitted work and an active `.roster/ledger.md`. **Do not start this port on top of that** —
  the port touches `AGENTS.md` and `config/agents.json`, which its running loop also reads.
- `agent-roster` is at `b0f663b` or later.

## The changes

Six files are **straight copies** — `next-auth` has no local modifications to any of them, verified
by diff on 2026-09-01: every difference is a line present only in `agent-roster`.

```
config/agents.json
scripts/sync-agents.mjs
scripts/validate-agents.mjs
scripts/doctor-agents.mjs
agents/skills/review-loop/SKILL.md
tests/sync-agents.test.mjs
```

Three files are **new** and must be created:

```
scripts/lib/devin-models.mjs
tests/devin-models.test.mjs
tests/fixtures/devin-models-list.txt
```

`AGENTS.md` is a copy **with one exception**, described below.

### `AGENTS.md` — copy, then restore the Next.js block

`next-auth`'s `AGENTS.md` ends with a block `next dev` writes and re-adds on its own:

```
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know
...
<!-- END:nextjs-agent-rules -->
```

Copying `agent-roster`'s `AGENTS.md` over it removes that block. `next dev` will put it back, which
means it reappears as an uncommitted change at the least convenient moment. Copy the file, then
re-append the block verbatim from git history (`git show HEAD:AGENTS.md` before the copy), and
commit it with the port so the tree stays clean.

Everything else in `AGENTS.md` is roster text and should match `agent-roster` exactly. The
substantive changes are: the Devin bullet under `## Dispatch, per harness`, the Devin bullet under
`### Per-tool concurrency facts`, the capture block in step 4, and the first bullet of step 8.

### Do NOT copy

- **`README.md`** — `agent-roster`'s README is about the roster; `next-auth`'s is about the
  application. The roster's adoption instructions never included it.
- **`config/.agents-manifest.json`** and everything under `.devin/`, `.claude/`, `.agent/`,
  `.codex/`, `.cursor/` — all generated. Run `npm run sync:agents` instead. Copying them by hand is
  how the two repositories drift.
- **`agents/roles/*/role.md`** — all six bodies are byte-identical already. Nothing to do.
- **`.roster/`** — `next-auth` has its own ledger history.

### One conflict, decided deliberately

`next-auth` pins `swe-1-7` for all three Devin capability classes (its commit `3f0f0b5`). The port
replaces that with `glm-5-2` for every class plus a `role_overrides` entry putting **only**
`code-reviewer` on `swe-1-7`.

That is not a revert of their fix; it is the same fix with a reason added. `glm-5-2` is free and
faster; `code-reviewer` reads the `developer`'s diff, so it runs a different model family and does
not share the author's blind spots. In this repository that split earned its keep immediately —
`swe-1-7` produced two of the two rejections across five tasks, and found defects the two `glm-5-2`
lenses read past.

Both models are free **until 2026-09-16**. After that date this allocation is a cost decision, not a
free one, and `npm run doctor:agents` will start warning that a pinned model is no longer free.

### `.roster/review/` must be un-ignored (2026-09-02 amendment)

The roster contract changed on 2026-09-02 so that `.roster/review/` is **tracked**, not git-ignored.
Reviewers are `readonly` (`read`, `grep`, `glob`, no `exec`), so a reviewer handed a path it cannot
open has no way to reconstruct the diff — and Devin background subagents and Gemini-based harnesses
skip git-ignored paths during file discovery entirely, returning `### Blocked` reports that cost a
cycle. Two consumer-side changes follow from this, both required by the port:

1. **Remove `.roster/review/` from `next-auth/.gitignore`.** The captured diffs are regenerable
   scratch, but they must be *readable* scratch; tracking them is the cheapest way to guarantee that.
   The ledger and its archive remain tracked as before.
2. **Narrow the delivery commit's pathspec from `.roster` to `.roster/archive`.** Step 8 of the new
   `AGENTS.md` stages `.roster/archive` specifically, because `.roster/review/` is now tracked and
   captured diffs do not belong in the delivery commit. Copying the new `AGENTS.md` brings this with
   it; this note is here so a porter who copies the contract without re-reading step 8 does not keep
   the old `git add -- .roster` and sweep review scratch into the delivery.

The capture command in step 4 also gained `':(exclude).roster/review'` so a tracked review directory
does not embed the previous cycle's diff into the next capture. That comes in with the `AGENTS.md`
copy; no consumer action beyond the two items above.

**One trap the tracked review directory introduces.** A careless `git add -A` or `git commit -a`
outside this contract can now sweep a captured diff into history, because `.roster/review/` is no
longer ignored. The contract never commits that directory — delivery stages `.roster/archive`
specifically (step 8), and the capture command excludes `.roster/review` from its own diff — so
consumers should treat `.roster/review/` as regenerable scratch and avoid bare `git add -A` /
`git commit -a` while a cycle's diff is sitting in it.

The contract is prose and cannot enforce a consumer's git hygiene, so consumers should add a
pre-commit hook that blocks `.roster/review/` from entering history. A minimal hook:

```bash
# .git/hooks/pre-commit (or via husky/lefthook as the project already does)
if git diff --cached --name-only -- '.roster/review/' | grep -q .; then
  echo "error: .roster/review/ is regenerable scratch and must not be committed." >&2
  echo "       The contract stages .roster/archive for delivery, never .roster/review/." >&2
  exit 1
fi
```

This turns the contract's "never commit `.roster/review/`" from a rule an agent can forget into a
gate the repository enforces. The hook is consumer-side, not part of this roster, so it is not copied
by the port — each consumer adds it once.

## Verification

Run in `next-auth` after `npm run sync:agents`:

```bash
npm run check:agents     # in sync, no drift
npm run validate:agents  # all generated profiles valid
npm run test:agents      # the four existing roster suites plus the new devin-models suite
npm run doctor:agents    # exit 0
devin doctor             # must report 6 profiles and ZERO CFG005 warnings, down from five
```

`npm test` in `next-auth` is Playwright and is not part of this port.

The check that actually proves the port landed is not a test. Dispatch a role by profile and see
what binds:

```bash
devin --model glm-5-2 -p 'Call run_subagent with profile="code-reviewer", is_background=false, title="probe", task="From your own context only, no file reads: name your model and list the exact names of every tool you have." Report its answer verbatim.'
```

Expect SWE-1.7 and exactly `find_file_by_name`, `grep`, `read`. Repeat with
`profile="researcher"` and expect GLM-5.2 with the same three tools.

> **2026-09-02:** `code-reviewer` and `quality-reviewer` were merged into a single `reviewer`, which
> carries the `swe-1-7` pin. Run the probe above with `profile="reviewer"`; `profile="code-reviewer"`
> no longer resolves. The expectation is otherwise unchanged. If a probe reports the parent
session's model instead, the profile is not binding and the port is incomplete.

Then confirm the ledger lifecycle on the port's own delivery: **one** commit, containing the
archived ledger under `.roster/archive/`, and no `.roster/ledger.md` in it.

## How to run it

This is a change to code in `next-auth`, so `next-auth`'s own `AGENTS.md` loop applies. It is
**bounded** — the files exist, the changes are known, one pass of one writer covers it — so the spec
is a paragraph in chat, not a spec file. Write it, get agreement, then run one cycle.

Note the ordering trap: the port rewrites step 8 of the very contract the coordinator is following.
Close this delivery with the **new** procedure (delivery line → `mv` to archive → `git add` →
`git commit`), not the old one that is still in the file when the loop starts. Following the old
step 8 would produce the second, content-free commit this port exists to remove.

## Known follow-ups, not part of this port

Recorded in `agent-roster`'s archived ledgers, still open in both repositories:

- `agents/roles/verifier/role.md` should forbid destructive git commands. A verifier ran
  `git checkout -- config/agents.json` mid-cycle and destroyed the task's own uncommitted work; it
  recovered from a backup it had happened to take.
- `scripts/validate-agents.mjs` — `notebook_edit` is absent from `NO_WRITE_MARKERS.devin`, so a
  verifier that regained it is caught only by its absence from the allowlist.
- `scripts/lib/devin-models.mjs` — the `Free` match is case-sensitive. A catalogue printing `free`
  would produce a spurious "no longer free" warning. Warning only; it cannot fail the doctor.
- Parallel reviewers exhaust the Devin free-tier quota at the account level — both free model
  families fail together. Dispatch them sequentially with retries, and check each report for a
  `### Verdict` rather than trusting the exit code: a quota-exhausted run exits 0 and writes an
  error body where the verdict should be. (2026-09-02: the merge to a single `reviewer` takes the
  concurrent readers from three to two, which reduces this but does not remove it. Observed again
  during that work: two concurrent `devin -p` reviewers on a 106 KB diff exceeded a ten-minute
  budget and one returned an empty file — the `### Verdict` check is what caught it.)
