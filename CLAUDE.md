@AGENTS.md

## Claude Code specifics

Dispatch subagents with the `Agent` tool (`subagent_type: <role>`). Independent roles go in one message.
Calls return synchronously — no polling needed.
