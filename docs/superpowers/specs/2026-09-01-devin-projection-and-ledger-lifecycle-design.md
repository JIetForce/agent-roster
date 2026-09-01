# Devin projection and ledger lifecycle — design

**Date:** 2026-09-01
**Status:** approved, awaiting implementation plan

## Why

Two defects, unrelated in mechanism, both of the same kind: `AGENTS.md` describes a loop that
differs from the one that actually runs.

1. **The Devin projection is bypassed by its own contract.** `agents/roles/*` is projected into six
   `.devin/agents/*.md` profiles that Devin loads and can dispatch by name — and `AGENTS.md:280`
   instructs the coordinator to ignore them and dispatch `subagent_general` instead, passing the role
   as free text. Every guarantee the projection carries (tool allowlist, model) is discarded at the
   moment of dispatch. `config/agents.json` and the generated `SKILL.md` files carry the same
   instruction.
2. **Step 8 produces two commits per delivery.** It orders the commit *before* the two ledger
   mutations that close the change, so the loop always ends with a dirty tree and the coordinator
   makes a second, content-free commit. A ten-task plan yields twenty commits, ten of them pure
   renames.

Both were established empirically against the installed Devin CLI (3000.6.7) rather than from
documentation; the evidence is in the appendix.

## What changes

### 1. Dispatch by named profile

`AGENTS.md` (`## Dispatch, per harness`) and `config/agents.json` (`dispatch_lines.devin`), which is
projected into `.devin/skills/review-loop/SKILL.md`:

- Dispatch each role with `run_subagent` using `profile: "<role>"`. The spec (and, for reviewers,
  the diff path) still travels in `task`; only the role definition stops being passed as text.
- Drop the instruction to tell the subagent to read `agents/roles/<role>/role.md` — under a named
  profile the role body *is* the subagent's system prompt.
- Widen the existing `subagent_explore` prohibition: substituting `subagent_general` or
  `subagent_explore` for a role is forbidden, because it discards both the tool allowlist and the
  model.

### 2. Foreground and background, corrected

Devin permits **at most one foreground subagent at a time**. The contract's "dispatch the three
reviewers in parallel" is therefore only achievable with `is_background: true`, which the current
text does not say. `## Parallel dispatch` → `### Per-tool concurrency facts` gains the split:

| Role | Mode | Why |
| --- | --- | --- |
| `developer`, `verifier` | `is_background: false` | They need `exec`/`edit`; a background subagent auto-denies any tool not already approved this session. |
| `researcher`, `code-reviewer`, `security-reviewer`, `quality-reviewer` | `is_background: true` | Their three tools are read-only and auto-approved under `--permission-mode auto`; background is what makes them concurrent at all. |

### 3. Per-role model overrides

`config/agents.json` gains `tools.<harness>.role_overrides.<role>`, shallow-merged over the class
block by `scripts/sync-agents.mjs`. The class remains the source of permissions; the override exists
for what genuinely differs per role.

The key is read for every harness so the generator has one code path, but only `devin` populates it
in this change. An absent `role_overrides` block behaves exactly as today.

| Role | Class | Model | Rationale |
| --- | --- | --- | --- |
| `developer` | `implementer` | `glm-5-2` | Primary model: fast, free during the promotion |
| `verifier` | `verifier` | `glm-5-2` | Runs commands and reports their output |
| `researcher` | `readonly` | `glm-5-2` | — |
| `security-reviewer` | `readonly` | `glm-5-2` | — |
| `quality-reviewer` | `readonly` | `glm-5-2` | — |
| `code-reviewer` | `readonly` + override | `swe-1-7` | A second model family on the author's diff: the developer runs `glm-5-2`, so the widest review lens must not share its blind spots |

Constraints that must be written down where they will be read:

- `glm-5-2` = GLM-5.2 High (200K, Free). `swe-1-7` = SWE-1.7 Max (262K, Free).
- **`swe-1-7-medium` is not used**, despite also being free.
- The bare alias `swe` resolves to SWE-1.7 **Lightning**, which is **not** free
  ($2.5 / $12.5 per 1M). A one-character slip is a paid model.
- Both free tiers are a promotion **ending 2026-09-16**.
- Claude Code profiles keep `sonnet`. `glm-*` and `swe-*` exist only inside Devin.

### 4. Remove the `permissions` key

Devin does not support `permissions` in a subagent profile: it reports
`CFG005: unsupported frontmatter key(s) ignored: permissions` for all five roles that carry one. The
key is removed from `tools.devin.readonly` and `tools.devin.verifier` in `config/agents.json`, so
adopting this roster stops emitting five warnings in every project.

The key was not load-bearing — `allowed-tools` is an allowlist that already excludes `write`, `edit`
and `exec`, and it *is* enforced (appendix). But one test asserted the ignored key:

- `tests/sync-agents.test.mjs:112` ("devin: denies write, edit and exec explicitly") matches the
  `permissions:\n  deny:` block. It is rewritten to assert the `allowed-tools` allowlist instead:
  every `readonly` role grants exactly `read`, `grep`, `glob` and nothing else.
- `scripts/validate-agents.mjs` needs no logic change — `GRANT_FIELD.devin` already scopes to
  `allowed-tools`. Its comment claims Devin's `permissions.deny` "spells out these exact words";
  that becomes false and is corrected.

### 5. The doctor catches this class of defect

`scripts/doctor-agents.mjs`, only when the `devin` CLI is present:

- Run `devin doctor` and surface its warnings and failures. This is what would have caught the
  ignored `permissions` key on day one.
- Cross-check every model named in `config/agents.json` against `devin models list`: fail on a slug
  that does not exist, warn on one that is no longer priced `Free`. The 2026-09-16 expiry then
  reports itself instead of resting on a comment nobody re-reads.

### 6. One commit per delivery

`AGENTS.md` step 8 and `agents/skills/review-loop/SKILL.md` step 7 are reordered:

1. Append the delivery line to the ledger.
2. Move it into `.roster/archive/<date>-<slug>.md` with **`mv`**, not `git mv`.
3. Make **one** commit whose pathspec covers the source paths plus `.roster` — safe as a whole
   directory, because `.roster/review/` is git-ignored and the archived ledger is the only new file
   under it.

`git mv` is wrong at step 8 specifically: at that point the ledger has never been committed during
this run, and `git mv` refuses an untracked file (`fatal: not under version control`, exit 128).
The current order only works because the ledger gets swept into the feature commit first — which is
exactly what produces the second commit. Step 2 keeps `git mv`: the stale ledger it archives is
tracked, by definition of how it got there.

## What must not change

- The capability class stays the source of permissions. `role_overrides` may not widen a role's
  tools; the validator continues to assert class invariants against the generated file, so an
  override that grants `exec` to a `readonly` role fails the build.
- The review artefact stays the **uncommitted working tree**. Nothing here moves the loop toward
  commit-range review.
- The ledger and `.roster/archive/` stay tracked in git, and `.roster/review/` stays ignored.
- `agents/roles/*/role.md` stays harness-agnostic: no vendor model slug enters a role definition.
- Claude Code, Antigravity, Cursor and Codex projections are untouched except where a shared file is
  edited for another reason.
- The six role bodies are unchanged. This is a change to how they are dispatched, not to what they do.

## How it is verified

- `npm run sync:agents` leaves a clean `git diff` (no drift between source and projection).
- `npm run test:agents` passes, including the rewritten allowlist assertion.
- `devin doctor` reports zero warnings in this repository.
- `npm run doctor:agents` passes and reports the `devin doctor` result and the model cross-check.
- End-to-end, by the same probe that exposed the defect: dispatch `researcher` and `code-reviewer`
  through `run_subagent` with their profile names and confirm each reports `glm-5-2` and `swe-1-7`
  respectively, with a read-only toolset. Both models are free; the check costs nothing.
- The double-commit fix is verified by its next delivery: one task produces exactly one commit, and
  that commit contains the archived ledger — never `.roster/ledger.md`.

## Evidence

Established against Devin CLI 3000.6.7 on 2026-09-01.

- **Profiles load and are dispatchable.** `devin doctor`:
  `pass custom subagent profiles — 6 profile(s) loaded: code-reviewer, developer, quality-reviewer,
  researcher, security-reviewer, verifier`. The `run_subagent` input schema has a required `profile`
  parameter whose enum is
  `["code-reviewer","developer","quality-reviewer","researcher","security-reviewer","subagent_explore","subagent_general","verifier"]`.
- **`model:` binds.** With the parent session forced to `swe-1-7`, a subagent dispatched as
  `researcher` reported "You are powered by Claude Sonnet 5 Medium" — the value then in
  `config/agents.json`.
- **`allowed-tools:` is enforced, not advisory.** That same subagent's entire toolset was
  `find_file_by_name`, `grep`, `read`. No `exec`, no `write`, no `edit`. The config vocabulary maps:
  `glob` → `find_file_by_name`.
- **`permissions:` is ignored.** `CFG005` on all five profiles carrying it.
- **Omitting `model:` does not inherit the session model.** A temporary profile with no `model` key,
  dispatched from a parent running `swe-1-7`, reported "You are powered by Subagent Default". So the
  three states are: pinned, ignored-and-defaulted, or absent — never inherited.
- **`git mv` refuses an untracked file:** `fatal: not under version control`, exit 128.

## Out of scope

- The other four harnesses' model choices.
- Whether `.claude/agents` should follow the same per-role split.
- Propagating this to `/Users/ruslan/repos/AI/anty/next-auth`, which carries its own copy of the
  roster. That is a separate, manual sync.
