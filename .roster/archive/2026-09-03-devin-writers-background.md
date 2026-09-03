# Devin writers go background so the coordinator's cache survives their runs

## Spec

Bounded chat spec, approved by the user 2026-09-03.

The contract states at `AGENTS.md:422-423` that a Devin background subagent "auto-denies any tool you
have not already approved this session, so a background writer fails the first time it runs a
command". That is false for the current Devin. Probe run 2026-09-03 from this repository:
`devin --model glm-5-2 -p`, default `--permission-mode auto`, parent forbidden from calling `exec`
and confirmed it did not. It dispatched `run_subagent` with `profile: "developer"`,
`is_background: true`, whose task was a single `exec` writing a marker file. The marker file was
created, contents `bg-exec-worked`, and no denial was reported. The foreground mandate for writers
therefore rests on a fact that no longer holds, and it is the reason the coordinator's prompt cache
dies on the two longest waits of every cycle — on a ten-task plan, ten times.

What changes:

1. `AGENTS.md:419-423` — the Devin bullet in `### Per-tool concurrency facts`: `developer` and
   `verifier` go `is_background: true`. State the probe and its date so a later reader does not
   restore the old rule from memory.
2. `AGENTS.md:448-450` — the closing paragraph of `### Cache discipline`: writers are polled too.
   The poll checks the worker's **state** (running / finished / stuck), not its output — reading
   output pulls it into the coordinator's context for no benefit.
3. `AGENTS.md:511-513` — the Devin bullet in `## Dispatch, per harness`: same split.
4. `config/agents.json:88` — the `devin` dispatch string that projects into the generated profiles.
5. `tests/sync-agents.test.mjs:178-192` — the assertion pins writers to `is_background: false`.
   Invert it to pin the new direction; keep it pinning a direction, never mere presence.
6. Regenerate with `npm run sync:agents` and include the regenerated tracked files.

What must not change:

- The empty-diff stop at step 4 stays exactly as it is. It is now the backstop: if a background
  writer is ever denied its tools, the capture is empty and the loop stops before any reviewer sees
  it. Do not weaken, move, or qualify it.
- Devin's one-foreground-subagent-at-a-time fact, and the background dispatch of `researcher`,
  `reviewer`, `security-reviewer`.
- The `cursor` block in `config/agents.json:62-66`. Cursor is unverified; out of scope.
- `.devin/agents/*`, `.claude/agents/*`, `.cursor/agents/*` are generated — never hand-edited.

How it is verified: `npm run check:agents` and `npm run test:agents` from the repo root.

Security-relevant paths touched: `config/agents.json`, `.devin/agents/*` (generated from it). The
change moves writers from session-approval to profile-allowlist approval, so it alters which
permission surface a tool call is checked against.

Already decided:

- The probe is sufficient evidence; it is not repeated per role. `verifier` needs only `exec`, which
  is what the probe exercised.
- Poll cadence 3-4 minutes, on state rather than output.
- Cost of being wrong is bounded by step 4 and is one wasted dispatch per run, not per task.

## Cycle log

### Cycle 1

- verifier: pass — `npm run check:agents` exit 0 ("in sync (30 profiles)"); `npm run test:agents`
  exit 0, 56/56. Generated projections regenerated, not hand-edited. The inverted test assertion was
  executed against both the old and the new dispatch line: it fails on the old and passes on the new,
  so it pins a direction rather than a substring's presence. Step 4's empty-diff paragraph
  byte-identical to HEAD.
- coordinator-run suite: none
- reviewer: approved — 0 required
- security-reviewer: approved — 0 required. `is_background` is not a field Devin profile frontmatter
  carries (`scripts/sync-agents.mjs:143` emits it for cursor only); it is a per-call argument. The
  tool allowlists in `.devin/agents/developer.md` and `.devin/agents/verifier.md` are identical
  before and after, so nothing widened. Under `--permission-mode auto` — this system's documented
  baseline since 2026-09-01 — no human gate existed on either path, so none was removed.
- resolved since cycle 0: n/a (first cycle)
- outstanding: none

Notes carried to the human, not to a developer:
- `AGENTS.md:418-423` justifies backgrounding all five roles with concurrency, which is the reason
  for the readers but not for the writers — writers are backgrounded for the cache and are still
  dispatched one at a time by `## Parallel dispatch`. Every rule that governs dispatch order is
  unchanged, so a skimmer, not the contract, is what would go wrong.
- The probe covered `developer` and `exec`. `edit`/`write` and `verifier` are inferred, and the text
  says only what was exercised.
- Nothing re-probes this. If Devin's default permission mode changes upstream, the new claim goes
  stale exactly as the old one did.
- `docs/superpowers/specs/2026-09-01-devin-projection-and-ledger-lifecycle-design.md:48` and
  `docs/superpowers/plans/2026-09-01-devin-projection-and-ledger-lifecycle.md:430-439` still carry
  the disproven auto-deny claim. Archived planning documents, not the live contract.

### Delivered

Cycle 1, full fan-out (`reviewer` and `security-reviewer`), both approved, verifier passing. No
spec-required suite was amended away. Delivered 2026-09-03.
