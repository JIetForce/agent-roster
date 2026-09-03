# Cache-discipline subsection for the coordinator in AGENTS.md

## Spec

Bounded chat spec, approved by the user in chat on 2026-09-03. Insert ONE new subsection,
`### Cache discipline`, into `AGENTS.md` at the end of `## Parallel dispatch` — after the
"**Workers do not dispatch workers.**" paragraph (currently ends line 431), before `## Escalation`
(currently line 433). Text supplied verbatim in the developer dispatch.

- What changes: that subsection only.
- What must not change: every other line of `AGENTS.md`, including the `is_background: false`
  default for `developer`/`verifier` in `### Per-tool concurrency facts` — the new subsection
  cites that default, it does not rewrite it. No hand edits to generated files
  (`.devin/agents/*`, `.claude/agents/*`, `.cursor/agents/*`, any `*/skills/**`).
- How it is verified: `npm run check:agents` and `npm run test:agents` pass from the repo root.
- Security-relevant paths touched: none

Already decided:

- Polling cadence 3-4 minutes; Devin `read_subagent(block=true, timeout=180)`.
- The rule is a cost discipline, not a gate — reviewers do not police compliance with it.
- Claude Code's 1-hour TTL is described through its real levers, the environment variables
  `ENABLE_PROMPT_CACHING_1H` / `FORCE_PROMPT_CACHING_5M`. The earlier draft named settings keys
  `promptCacheTtl` / `subagentPromptCacheTtl`; neither identifier exists anywhere in the Claude
  Code 2.1.150 binary. The selector is `oVH(querySource)`, whose default allowlist is
  `["repl_main_thread*","sdk","auto_mode","memdir_relevance"]`, gated on entitlement and off in
  overage — so the coordinator's own main thread already holds the long TTL there.
- `developer` and `verifier` stay `is_background: false` on Devin however long they run. The
  rejected alternative was to background them and fall back to foreground on a `### Blocked`
  tool-denial report. That fallback assumes the denial announces itself; this repository's own
  record says it does not — `.roster/archive/2026-09-01-devin-projection-task3-dispatch-by-profile.md:46`,
  "silently auto-denied exec/edit and an empty report". An empty report is an empty diff, which
  step 4 stops the loop over. No Devin experiment was run: the CLI is not authenticated here, and
  the assumption it would test is already contradicted by the archive.
- Polling is not free. A poll re-sends the whole prefix at the cache-read rate (0.1x) against a
  cold reprocess at the cache-write rate (1.25x), so roughly a dozen polls cost the miss they were
  avoiding — break-even near 45 minutes at a 3-4 minute cadence. The subsection therefore carries a
  stopping point rather than the absolute "no single wait outlasts the TTL".
- Scope is `agent-roster` (canonical). The final text is copied into the `next-auth` working copy
  afterwards, over the provisional cycle-1 section there; that copy is a trivial-row edit, not a
  second run of this loop.

## Cycle log

### Cycle 1

- verifier: pass — `npm run check:agents` exit 0 ("in sync (30 profiles)"); `npm run test:agents`
  exit 0, 56/56 across 13 suites. Diff confined to `AGENTS.md`, 19 insertions, 0 deletions; no
  generated projection hand-edited.
- coordinator-run suite: none
- reviewer: approved — 0 required
- security-reviewer: not dispatched — spec declares `Security-relevant paths touched: none`, and the
  diff is prose about cache economics and dispatch mode; the reviewer's gate backstop filed nothing.
- resolved since cycle 0: n/a (first cycle)
- outstanding: none

Reviewer minor notes, carried to the human and not to a developer:
- `AGENTS.md:448-450` restates the writer-foreground rationale that `AGENTS.md:421-423` already
  gives. Complementary, not contradictory; a future editor tightening one should check the other.
- `AGENTS.md:442-444` gives the background-and-poll mechanism only in Devin's syntax while the
  bullet generalises across harnesses. A gap to fill if the subsection is revisited.

### Delivered

Cycle 1, full fan-out for this spec (`reviewer`; `security-reviewer` not applicable), approved with
the verifier passing. No spec-required suite was amended away. Delivered on 2026-09-03.
