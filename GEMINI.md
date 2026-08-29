See `AGENTS.md` for the developer + reviewer harness contract — it is authoritative.

Antigravity specifics: `invoke_subagent` is asynchronous. After invoking `nextjs-developer`, poll the
subagent until its state is `Idle` before you capture the diff. Custom subagents are defined in
`.agent/agents/<name>/agent.md`.
