---
description: The plan for two tasks that share one interface has a producer/consumer table with one row for it, and the row names the task that writes the join test (S26).
max_turns: 20
timeout_seconds: 520
allowed_tools: [Skill, Read, Glob, Grep, Bash]
---

Load the skill `guilda:architect` with the Skill tool first. You are the Architect of this project. Read `.guilda/config.json`.
The spec `docs/superpowers/specs/2026-11-10-notes.md` is approved. Write the plan for it now, as `docs/superpowers/specs/2026-11-10-notes.plan.md`.
Use two tasks: T1 builds the token store and T2 builds the notes sync. They run in one wave.
Do not ask me anything. Do not write briefs. Your final reply is the text of the producer/consumer table of the plan, nothing else.
