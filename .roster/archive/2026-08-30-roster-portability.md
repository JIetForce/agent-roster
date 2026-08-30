# Make the roster droppable into any project — discovery, ledger lifecycle, and the superpowers boundary

## Spec

Seven changes, approved in full by the user on 2026-08-30. Two design decisions were
delegated to the coordinator and are recorded here as part of the spec:

- **Review artifact stays the uncommitted working tree**, one commit per loop run made by
  the coordinator after every verdict is in. Rejected under commit-range review: BASE
  tracking drifts, and rejected work already in history can only be removed destructively.
  Its one real failure — a developer that commits, leaving an empty diff the reviewers
  "approve" — is closed by an explicit empty-diff stop condition, not by switching models.
- **Spec/plan artifacts follow a size ladder**, and the ledger is written on every run
  regardless. Bounded change → spec is a paragraph in chat, approved before dispatch.
  Architectural change → `superpowers:brainstorming` writes the spec file and
  `superpowers:writing-plans` the plan, then one loop run per plan task.

What changes:

1. `AGENTS.md` — plans do not outrank this contract; the developer does not commit; the
   coordinator commits after step 8 (upstreamed from next-auth `d793cce`).
2. `scripts/` — collision detection keyed on definition **names** with symlinks resolved,
   not on the count of source directories. Two directories are legal; one name resolving to
   two different definitions is not. Plus detection of a harness directory that lost its
   leading dot (`agent/skills`), which no tool reads and every installer can create.
3. `.gitignore` + `AGENTS.md` — the ledger is tracked in git and gets a lifecycle: one
   active `.roster/ledger.md`, archived to `.roster/archive/` on delivery. Only
   `.roster/review/` stays ignored.
4. `AGENTS.md` — the size ladder above, and an approval **gate** replacing "show the spec".
5. `AGENTS.md` — an explicit superpowers boundary: which skills stay, which two are off.
6. `AGENTS.md` — isolation is required for writers, not preferred.
7. `README.md` — an installation checklist for adopting the roster in an existing project.

What must not change:
- The six role definitions in `agents/roles/*/role.md` (behaviour is not in scope).
- The generator's manifest contract: it never deletes a file it did not write.
- The capability-class model in `config/agents.json`.
- `npm test` stays reserved for a host application's own tests.

Verification: `npm run test:agents`, `npm run check:agents`, `npm run validate:agents` and
`npm run doctor:agents` all pass; the new collision logic has direct unit tests over
temporary fixtures covering a symlinked duplicate (legal) and a divergent duplicate (fatal);
the doctor still exits 0 on this repository and exits 1 on a fixture that reproduces the
next-auth collision.

## Cycle log

### Cycle 1

Run inline: subagent dispatch was not requested for this change, so the coordinator performed the
implementation and review phases in sequence, keeping them separate, per `## Your role` in `AGENTS.md`.

- verifier: pass — `npm run check:agents` (in sync, 35 profiles), `npm run validate:agents` (all valid),
  `npm run test:agents` (33 tests / 8 suites, 0 fail), `npm run doctor:agents` (exit 0)
- behaviour proof: a fixture reproducing next-auth's exact layout (`.agents/skills/shadcn` +
  `.claude`/`.devin` symlinks + `agent/skills/shadcn` + per-tool `review-loop`) makes the doctor exit 1 on
  the two real defects — `review-loop` resolving to two definitions for Devin, and the dot-dropped
  `agent/skills/` — while the antigravity two-directory case that used to FAIL now passes. Applying the two
  fixes to the fixture (`read_config_from.claude: false`, delete `agent/`) turns it green.
- outstanding: none

Scope note — one deliberate departure from the spec's "role definitions must not change":
`agents/roles/developer/role.md` rule 6 permitted a commit "unless the coordinator explicitly instructed it",
and a plan task handed to the developer reads as exactly that instruction. That loophole is the mechanism of
the original defect, so rule 6 now names it: a plan's `Commit` step is not the coordinator's instruction.
No behaviour was added; an ambiguity was closed.

### Delivery

Delivered on 2026-08-30. All seven approved items landed, plus the rule 6 disambiguation above.
