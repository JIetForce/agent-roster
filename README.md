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
fails the build if any harness could discover a second.

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

To adopt it in your own project, copy `agents/`, `config/`, `scripts/`, `tests/`, `AGENTS.md`, `CLAUDE.md`
and `GEMINI.md` across, then run `npm run sync:agents`.

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

## The loop

Research fans out in parallel → one writer → the verifier alone → three reviewers in parallel → decide.

It keeps iterating while the outstanding-findings list is shrinking, and stops on a **stall** (two cycles
with no shrinkage), on a blocking question the coordinator cannot resolve from the repository, or on a
runaway guard at cycle 8. A fixed rejection count was the wrong instrument: it halts a loop that is still
converging and tolerates three wasted cycles on one that is not.

State lives in `.roster/ledger.md` so the loop survives a context reset.

## Parallelism, and its one real limit

There is no cap on how many workers run at once. There is a cap on how many may **write**. Read-only roles
fan out freely; writers go one at a time unless each gets a disjoint set of files; the verifier runs alone,
because a writer editing the tree underneath it produces evidence for a state that never existed.

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

Every claim in the discovery matrix was checked against vendor documentation or a local installation, with
two honest exceptions:

- **Cursor is unverified.** Its rows come from documentation only; `cursor-agent` was not installed on the
  machine this was built on. `npm run doctor:agents` reports what it can. Corrections welcome.
- **The `verifier` class keeps a shell**, so its "does not modify source" is a contract obligation, not an
  enforced sandbox. The validator asserts full read-only only for the `readonly` class. Cursor and Codex
  expose a single all-or-nothing toggle and cannot express the distinction at all.

## Related

Complementary to [superpowers](https://github.com/obra/superpowers), which is installed per harness at user
scope and supplies general engineering discipline (TDD, systematic debugging, verification). This repository
supplies the roles and the contract for one project. `AGENTS.md` documents where that line falls.

## License

MIT — see [LICENSE](LICENSE).
