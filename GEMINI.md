See `AGENTS.md` for this repository's agent roster and its operating contract — it is authoritative.

Antigravity specifics: `invoke_subagent` is asynchronous. After invoking a role, poll the
subagent until its state is `Idle` before you read anything it produced. Custom subagents are defined in
`.agent/agents/<name>/agent.md`.
