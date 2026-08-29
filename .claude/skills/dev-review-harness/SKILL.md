---
name: dev-review-harness
description: Run the developer + reviewer loop for a code change in this repository. Use when the user asks to implement a feature, fix a bug, or make any code change that should be reviewed before delivery.
---

# Developer + Reviewer Harness

`AGENTS.md` is the authoritative contract. Read it if it is not already in your context.

1. Rewrite the request as a concrete spec and show it to the user.
2. Dispatch `nextjs-developer` with the `Agent` tool (`subagent_type: nextjs-developer`). It returns synchronously.
3. Capture the diff to a file — never inline:
   ```bash
   mkdir -p .harness/review
   git diff > .harness/review/cycle-1.diff
   git status --porcelain >> .harness/review/cycle-1.diff
   ```
4. Dispatch `code-reviewer` with the spec and the diff **path**.
5. On `rejected`, hand `### Required changes` back to the developer and repeat from step 2 with the next
   cycle number. Stop per `AGENTS.md`'s stop conditions (stall, blocked, or the cycle-8 runaway guard)
   and escalate to the user.
6. On `approved` or `approved_with_notes`, summarise the result.
