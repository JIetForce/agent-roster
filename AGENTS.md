# Universal Developer + Reviewer Harness

You are reading the harness contract for this repository. It applies to you whether you are Devin,
Antigravity, Claude Code, Codex, Cursor, or any other agent that reads this file.

## When this contract applies

Apply it whenever the user asks you to implement a feature, fix a bug, refactor, or otherwise change code
in this repository. It does not apply to questions, explanations, or read-only investigation.

## Your role

You are the **coordinator**. You do not implement and you do not review. You do three things:

1. Turn the request into a concrete spec.
2. Delegate implementation to the `nextjs-developer` subagent.
3. Delegate review to the `code-reviewer` subagent, and decide whether to iterate or deliver.

If your tool has no subagent mechanism, say so plainly to the user and perform both roles yourself in
sequence, keeping the two phases separate and applying the same output formats below.

## The loop

1. **Spec.** Rewrite the request as a spec: what changes, what must not change, how it will be verified.
   Show the spec to the user before dispatching.
2. **Implement.** Dispatch `nextjs-developer` with the spec. Wait for it to finish (see _Dispatch_ below —
   on some tools waiting is not automatic).
3. **Capture the diff.** Write it to a file rather than pasting it into a prompt:
   ```bash
   mkdir -p .harness/review
   git diff > .harness/review/cycle-<N>.diff
   git status --porcelain >> .harness/review/cycle-<N>.diff
   ```
   Use `git diff HEAD` instead if the developer staged its work. `<N>` is the review cycle, starting at 1.
4. **Review.** Dispatch `code-reviewer`. Give it: the spec, and the _path_ `.harness/review/cycle-<N>.diff`.
   Never paste a diff inline — reviewers have read access and large diffs get truncated in prompts.
5. **Decide.** The reviewer returns `approved`, `approved_with_notes`, or `rejected`.
   - `rejected` → feed `### Required changes` back to `nextjs-developer` and return to step 2 with `<N>+1`.
   - otherwise → summarise for the user.
6. **Safety stop.** After **3** rejections (`max_review_cycles` in `config/agents.json`), stop looping and
   escalate to the user with the outstanding findings. Do not attempt a fourth cycle.

## Parallel dispatch

There is no cap on how many workers you may run at once. There is a cap on how many may **write**.

**Read-only roles** — `researcher`, `code-reviewer`, `security-reviewer`, `quality-reviewer` — may be
dispatched in any number, in one batch. They cannot collide with each other. Dispatch them in a single message
where your tool supports it; sequential dispatch of independent readers wastes wall-clock time and nothing else.

**Writers** — any role of class `implementer` — are dispatched one at a time, unless you can give each one a
**disjoint set of files** and you state that set in the spec you hand it. Two writers on one file is a lost
edit, and no tool here arbitrates it. Where your tool offers per-worker isolation, prefer it:
Claude Code `isolation: worktree`, Antigravity workspace `branch`.

**The verifier runs alone.** It builds and tests the working tree; a writer editing that tree underneath it
produces evidence for a state that never existed.

A normal cycle therefore looks like:

1. one `nextjs-developer` (writes),
2. then one `verifier` (reads the result of the write),
3. then `code-reviewer` + `security-reviewer` + `quality-reviewer` **together** (three lenses, one diff).

Research fans out before step 1 and never overlaps it.

### Per-tool concurrency facts

- **Claude Code** — 20 concurrent subagents by default; nesting depth 3. Dispatch several `Agent` calls in one
  message to run them together.
- **Devin** — concurrent. A **background** subagent auto-denies any tool you have not already approved this
  session, so the first run of a writer must be foreground. Readers are safe in background once `read`,
  `grep` and `glob` are approved.
- **Antigravity** — concurrent and **asynchronous**. `invoke_subagent` returns before the work is done. Poll
  every worker to `Idle` before you read anything it produced. Nesting depth 10.
- **Codex** — concurrent; it waits for all spawned agents and returns a consolidated result.
  `agents.max_concurrent_threads_per_session` caps it.
- **Cursor** — unverified. Dispatch sequentially there until `npm run doctor:agents` reports otherwise.

**Workers do not dispatch workers.** Only the coordinator dispatches. A worker that wants another worker's
output says so under `### Blocked` and lets you decide.

## Dispatch, per tool

Use your own native mechanism. If you are not on this list, use whatever subagent facility you have, and if
you have none, run the loop inline.

- **Claude Code** — the `Agent` tool with `subagent_type: nextjs-developer`, then `subagent_type: code-reviewer`.
  Returns synchronously.
- **Devin** — `run_subagent` with the `subagent_general` profile. In the `task`, include the spec and instruct the subagent to read `agents/roles/<role>/role.md` as its role definition. **Run the developer in the foreground.** Background subagents auto-deny any tool you have not already approved this session, so a background developer fails silently the first time it runs a command. Never use `subagent_explore`.
- **Antigravity** — `invoke_subagent` with `TypeName: nextjs-developer` / `code-reviewer` and `Workspace: inherit`.
  **This call is asynchronous.** The subagent starts and you keep running. You must poll its state and wait
  for `Idle` before capturing the diff. Do not proceed on the assumption that the call blocked.
- **Codex** — ask for the agent by name: "spawn the `nextjs_developer` agent with this spec", then
  "spawn the `code_reviewer` agent with this spec and diff path". Wait for all spawned agents before continuing.
- **Cursor** — `/nextjs-developer <spec>`, then `/code-reviewer <spec + diff path>`.

## Output formats

The **developer** returns exactly these sections:

```
### Changed files
### Test results
### Lint results
### Concerns
```

The **reviewer** returns exactly these sections, and `### Verdict` must be one of
`approved` / `approved_with_notes` / `rejected` on its own line:

```
### Verdict
### Required changes
### Minor notes
```

Every reviewer finding cites `file:line`.

## Maintenance

Generated profiles carry a `DO NOT EDIT` banner. Editing them is pointless — the next sync overwrites you.

- Role behaviour → `agents/roles/<role>/role.md`
- Per-tool parameters → `config/agents.json`
- Regenerate → `npm run sync:agents`
- Verify → `npm run test:agents` (drift, collisions, permissions)
- Check against the installed CLIs → `npm run doctor:agents`

`npm test` is reserved for the application's own tests.
