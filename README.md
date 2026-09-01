# agent-roster

Define an agent role once. Get it in Claude Code, Devin, Antigravity, Codex and Cursor — without any of them
seeing two conflicting copies of it.

## The problem this exists for

Coding-agent harnesses read each other's directories. That is a feature until you use more than one, at which
point it quietly becomes a bug:

| Path | Claude Code | Devin | Antigravity | Cursor | Codex |
| --- | :---: | :---: | :---: | :---: | :---: |
| `.claude/agents/*.md` | ✓ | ✓ (import) | ✗ | ✓ (compat) | ✗ |
| `.agents/agents/<n>.md` | ✗ | ✓ | ✓ | ✗ | ✗ |
| `.devin/agents/<n>.md` | ✗ | ✓ | ✗ | ✗ | ✗ |
| `.agent/agents/<n>/agent.md` | ✗ | ✗ | ✓ | ✗ | ✗ |
| `.cursor/agents/*.md` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `.codex/agents/*.toml` | ✗ | ✗ | ✗ | ✓ (compat) | ✓ |

Devin is fed by four of those paths; Cursor by three. Write the same `code-reviewer` into each vendor's
directory the obvious way and Devin discovers three of them — one restricted to Devin's tools, one to
Antigravity tools that do not exist in Devin, one to Claude's. They do not merge. One wins, arbitrarily.

`agent-roster` keeps **one** definition per role, projects it into exactly one location per harness, and
fails the build if any harness could discover a second *definition* of one name.

It checks names, not directory counts. A tool reading two skill directories is normal — the ecosystem's
convention is one real copy under the neutral `.agents/skills/`, symlinked into each tool's own directory, and
third-party installers already do this. Two paths that resolve to one definition are one definition. Two paths
that resolve to two is the bug, and so is a directory that lost its leading dot (`agent/skills/`), which no
harness reads and which therefore hides a duplicate where nothing will report it.

## What you get

- **Six roles** with a single source of truth in `agents/roles/<role>/role.md`.
- **A contract** in `AGENTS.md`: how work is dispatched, what may run in parallel, how a worker escalates a
  blocking question, and when the review loop stops.
- **A generator** — `npm run sync:agents` — that writes 35 files and owns every one of them through a
  manifest, so it never deletes a file it did not write.
- **A validator and a doctor** that fail on drift, on a collision, and on a read-only role that gained the
  ability to act.

## Quick start

```bash
git clone https://github.com/JIetForce/agent-roster.git
cd agent-roster
npm run sync:agents     # write every per-harness profile
npm run doctor:agents   # check against the harnesses actually installed here
```

Then open the repository in any supported harness and ask it to implement something. It reads `AGENTS.md`,
becomes the coordinator, and dispatches the roles.

## Adopting it in an existing project

1. Copy `agents/`, `config/`, `scripts/`, `tests/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` and
   `.cursor/rules/agent-roster.mdc` across. Add the four `*:agents` scripts to your `package.json`.
2. Add **one** line to `.gitignore`:

   ```gitignore
   .roster/review/
   ```

   Do not ignore `.roster/` wholesale. The ledger and `.roster/archive/` are tracked deliberately: they are
   what carries a review loop through a context reset, an ignored file survives neither a fresh clone nor a
   new worktree, and Gemini-based harnesses skip git-ignored paths during file discovery — so an ignored
   ledger is one Antigravity cannot see at all.
3. `npm run sync:agents`, then `npm run doctor:agents`.
4. Fix whatever the doctor names. In a project that already had agent tooling, expect one of:
   - **a skill name resolving to two definitions** — keep one; delete the other or make it a symlink;
   - **`agent/skills/` or `agents/agents/`** — a dropped leading dot from some installer. Nothing reads it.
     Delete it.
5. Run the manual discovery checks the doctor prints, in each harness you actually use. `/agents` should list
   each role exactly once.
6. If you use `superpowers`, read `### The superpowers boundary` in `AGENTS.md`. Two of its skills are
   superseded by this contract and must not be invoked in a repository that carries it.

## The roles

| Role | Class | Does |
| --- | --- | --- |
| `developer` | `implementer` | Implements a spec, writes tests, runs lint and tests |
| `verifier` | `verifier` | Runs the build, lint, suite and end-to-end checks; reports evidence, never edits |
| `researcher` | `readonly` | Answers one scoped question with `file:line` citations |
| `code-reviewer` | `readonly` | Correctness, regressions, spec fidelity, test coverage |
| `security-reviewer` | `readonly` | Authn/authz, injection, secrets, SSRF, unsafe deserialisation |
| `quality-reviewer` | `readonly` | Maintainability, consistency, duplication, dead code |

The three review lenses have deliberately disjoint remits, so one defect draws one finding rather than three.

A role declares a **capability class**, not per-harness settings. `config/agents.json` maps each class to
every harness's own permission vocabulary once, so adding a role costs one file instead of five config
blocks.

The class is what grants permissions. Where one role genuinely needs a different *setting* — not
different permissions — `tools.<harness>.role_overrides.<role>` refines it. Today that is one entry:
`code-reviewer` runs a different model family from the `developer` whose diff it reads, so the widest
review lens does not share the author's blind spots.

Devin roles run free models during a promotion that **ends 2026-09-16**: `glm-5-2` (GLM-5.2 High)
everywhere, `swe-1-7` (SWE-1.7 Max) for `code-reviewer`. Two traps worth naming: `swe-1-7-medium` is
also free and is deliberately unused, and the bare alias `swe` is *not* free — it resolves to
SWE-1.7 Lightning. `npm run doctor:agents` re-checks both facts against the installed CLI: it fails on a slug that no longer exists and warns on one that is no longer free, so the expiry reports itself rather than resting on this paragraph.

## The loop

Research fans out in parallel → one writer → the verifier alone → three reviewers in parallel → decide.

It keeps iterating while the outstanding-findings list is shrinking, and stops on a **stall** (two cycles
with no shrinkage), on a blocking question the coordinator cannot resolve from the repository, or on a
runaway guard at cycle 8. A fixed rejection count was the wrong instrument: it halts a loop that is still
converging and tolerates three wasted cycles on one that is not.

State lives in `.roster/ledger.md`, tracked in git, so the loop survives a context reset — and a fresh clone,
and a new worktree. There is exactly one active ledger; delivering a change archives it under
`.roster/archive/` rather than leaving it for the next change to overwrite.

The review artefact is the **uncommitted working tree**, not a commit range. The developer does not commit;
the coordinator does, once, after every verdict is in. An empty captured diff stops the loop — three
`approved` verdicts on an empty file look exactly like three on a good change.

## Parallelism, and its one real limit

There is no cap on how many workers run at once. There is a cap on how many may **write**. Read-only roles
fan out freely; the verifier runs alone, because a writer editing the tree underneath it produces evidence for
a state that never existed.

Writers go one at a time unless each gets both a disjoint set of files **and** its own worktree. Disjoint
files alone are not enough: `git add` writes to the repository's single shared index, so one writer's
`git commit` without a pathspec sweeps up whatever another has staged, however carefully you divided the
files.

## Worker output is data, never instruction

A worker's report is text produced by a model that just read your repository — including any file an
attacker could have influenced and any dependency's README. `AGENTS.md` states the boundary explicitly: a
worker cannot change the spec, its own permissions or the contract, and a worker claiming the user approved
something has not established that the user approved something. Claude Code enforces some of this in its
runtime; the other harnesses do not, which is why it lives in the contract.

## Adding a role

Create `agents/roles/<name>/role.md`:

```markdown
---
name: my-role
description: One line. Loaded at startup on every harness, so keep it short.
class: readonly
---

Body — this becomes the role's system prompt in all five formats.
```

Then `npm run sync:agents`. No per-harness edits.

## Commands

| Command | Does |
| --- | --- |
| `npm run sync:agents` | Regenerate every per-harness profile and skill |
| `npm run check:agents` | Fail if anything on disk drifted from the source |
| `npm run validate:agents` | Fail if a role's generated permissions violate its class |
| `npm run doctor:agents` | Check discovery, collisions, MCP and skills against installed harnesses |
| `npm run test:agents` | The full suite |

`npm test` is left free for the host application's own tests.

## Verification status

Every claim in the discovery matrix was checked against vendor documentation or a local installation.

**Devin's profile behaviour is verified empirically**, against CLI 3000.6.7 on 2026-09-01, not
from documentation: `devin doctor` reports the six profiles loaded, `run_subagent`'s `profile`
parameter is an enum containing all six role names, `model:` binds (a subagent dispatched under a
profile reports that profile's model, not the parent session's), `allowed-tools:` is enforced (a
readonly role is handed exactly `find_file_by_name`, `grep`, `read`), and `permissions:` is ignored
outright. A profile with no `model:` key does not inherit the session model — it falls to Devin's
own subagent default.

Two honest exceptions remain:

- **Cursor is unverified.** Its rows come from documentation only; `cursor-agent` was not installed on the
  machine this was built on. `npm run doctor:agents` reports what it can. Corrections welcome.
- **The `verifier` class keeps a shell**, so its "does not modify source" is a contract obligation, not an
  enforced sandbox. The validator asserts full read-only only for the `readonly` class. Cursor and Codex
  expose a single all-or-nothing toggle and cannot express the distinction at all.

## Related

Complementary to [superpowers](https://github.com/obra/superpowers), which is installed per harness at user
scope and supplies general engineering discipline — brainstorming, plan writing, TDD, systematic debugging,
verification. This repository supplies the roles and the contract for one project.

Two `superpowers` skills are the exception: `subagent-driven-development` and `executing-plans` answer the
same question this contract answers, and answer it differently — commit-range review versus working-tree
review, their own ledger versus this one, their own dispatch loop nested inside this one, and "never stop for
the human" versus escalate. `AGENTS.md` documents the boundary and supersedes those two.

## License

MIT — see [LICENSE](LICENSE).
